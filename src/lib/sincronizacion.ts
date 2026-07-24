import { randomUUID } from "crypto";
import { crearClienteAdmin } from "./supabase/admin";
import { FUENTES, mapearMercados, pedirCuotas, pedirMarcadores } from "./odds-api";

// Motor de sincronización con The Odds API. Escrituras por lote (rápido) y
// seguro con apuestas: los eventos que ya tienen apuestas no se tocan
// (sus cuotas quedan congeladas a nivel de catálogo).

export type ResumenSincronizacion = {
  ok: boolean;
  resumen: Array<{ liga: string; eventos: number; nota?: string }>;
  creditosRestantes: string | null;
};

export async function sincronizarCartelera(): Promise<ResumenSincronizacion> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { ok: false, resumen: [], creditosRestantes: null };

  const supabase = crearClienteAdmin();
  const resumen: ResumenSincronizacion["resumen"] = [];
  let creditosRestantes: string | null = null;

  // Eventos con apuestas: no se les refrescan mercados (cuotas congeladas).
  const { data: lineas } = await supabase
    .from("apuesta_lineas")
    .select("selecciones(mercados(evento_id))");
  const conApuestas = new Set<string>(
    (lineas ?? [])
      .map((l) => {
        const sel = l.selecciones as unknown as { mercados: { evento_id: string } } | null;
        return sel?.mercados?.evento_id ?? null;
      })
      .filter((x): x is string => x !== null)
  );

  for (const fuente of FUENTES) {
    const { eventos, restantes, status } = await pedirCuotas(fuente.clave, apiKey);
    if (restantes) creditosRestantes = restantes;
    if (!eventos) {
      resumen.push({ liga: fuente.liga, eventos: 0, nota: `sin datos (HTTP ${status})` });
      continue;
    }
    const utiles = eventos.filter((ev) => mapearMercados(ev, fuente.nombres).length > 0);
    if (utiles.length === 0) {
      resumen.push({ liga: fuente.liga, eventos: 0 });
      continue;
    }

    // 1) ¿Cuáles ya existen?
    const externos = utiles.map((ev) => ev.id);
    const { data: existentes } = await supabase
      .from("eventos")
      .select("id, externo_id")
      .in("externo_id", externos);
    const idPorExterno = new Map((existentes ?? []).map((e) => [e.externo_id, e.id]));

    // 2) Insertar los nuevos en un solo lote
    const nuevos = utiles
      .filter((ev) => !idPorExterno.has(ev.id))
      .map((ev) => ({
        deporte: fuente.deporte,
        liga: fuente.liga,
        equipo_a: ev.home_team,
        equipo_b: ev.away_team,
        comienza_at: ev.commence_time,
        externo_id: ev.id,
      }));
    if (nuevos.length > 0) {
      const { data: insertados } = await supabase
        .from("eventos")
        .insert(nuevos)
        .select("id, externo_id");
      for (const e of insertados ?? []) idPorExterno.set(e.externo_id, e.id);
    }

    // 3) Refrescar los existentes sin apuestas
    const refrescables = utiles.filter(
      (ev) => idPorExterno.has(ev.id) && !conApuestas.has(idPorExterno.get(ev.id)!)
    );
    const idsRefrescables = refrescables.map((ev) => idPorExterno.get(ev.id)!);
    for (const ev of refrescables) {
      const idEvento = idPorExterno.get(ev.id)!;
      await supabase
        .from("eventos")
        .update({ comienza_at: ev.commence_time })
        .eq("id", idEvento)
        .neq("comienza_at", ev.commence_time);
    }

    // 4) Actualizar cuotas EN SITIO. Antes se borraban los mercados y se
    //    reinsertaban, y durante ese hueco la cartelera se veía sin cuotas.
    //    Ahora: lo que existe se actualiza, lo nuevo se inserta y lo que
    //    desapareció del mercado se desactiva (nunca se borra: hay apuestas
    //    que apuntan a esas selecciones).
    const { data: yaEnBase } = await supabase
      .from("mercados")
      .select("id, evento_id, tipo, selecciones(id, nombre, cuota)")
      .in("evento_id", idsRefrescables.length > 0 ? idsRefrescables : ["-"]);

    // evento_id + tipo → mercado ; mercado_id + nombre → selección
    const mercadoPorClave = new Map<string, string>();
    const selPorClave = new Map<string, { id: string; cuota: number }>();
    const selVistas = new Set<string>();
    for (const m of yaEnBase ?? []) {
      mercadoPorClave.set(`${m.evento_id}|${m.tipo}`, m.id);
      const sels = (m.selecciones ?? []) as Array<{ id: string; nombre: string; cuota: number }>;
      for (const s of sels) selPorClave.set(`${m.id}|${s.nombre}`, { id: s.id, cuota: Number(s.cuota) });
    }

    const mercadosNuevos: Array<{ id: string; evento_id: string; tipo: string; nombre: string; orden: number }> = [];
    const seleccionesNuevas: Array<{
      mercado_id: string; nombre: string; cuota: number; orden: number; lado: string; punto: number | null;
    }> = [];
    const cambiosCuota: Array<{ id: string; cuota: number }> = [];

    for (const ev of refrescables) {
      const idEvento = idPorExterno.get(ev.id)!;
      const mercados = mapearMercados(ev, fuente.nombres);
      mercados.forEach((m, i) => {
        let idMercado = mercadoPorClave.get(`${idEvento}|${m.tipo}`);
        if (!idMercado) {
          idMercado = randomUUID();
          mercadoPorClave.set(`${idEvento}|${m.tipo}`, idMercado);
          mercadosNuevos.push({ id: idMercado, evento_id: idEvento, tipo: m.tipo, nombre: m.nombre, orden: i });
        }
        for (const s of m.selecciones) {
          const clave = `${idMercado}|${s.nombre}`;
          const existente = selPorClave.get(clave);
          if (existente) {
            selVistas.add(existente.id);
            if (Math.abs(existente.cuota - s.cuota) > 0.001) {
              cambiosCuota.push({ id: existente.id, cuota: s.cuota });
            }
          } else {
            seleccionesNuevas.push({
              mercado_id: idMercado,
              nombre: s.nombre,
              cuota: s.cuota,
              orden: s.orden,
              lado: s.lado,
              punto: s.punto,
            });
          }
        }
      });
    }

    if (mercadosNuevos.length > 0) await supabase.from("mercados").insert(mercadosNuevos);
    if (seleccionesNuevas.length > 0) await supabase.from("selecciones").insert(seleccionesNuevas);
    for (const c of cambiosCuota) {
      await supabase.from("selecciones").update({ cuota: c.cuota, activa: true }).eq("id", c.id);
    }

    // Las que ya no ofrece la casa: fuera del catálogo, pero sin borrarlas.
    const desaparecidas = [...selPorClave.values()]
      .map((s) => s.id)
      .filter((id) => !selVistas.has(id));
    if (desaparecidas.length > 0) {
      await supabase.from("selecciones").update({ activa: false }).in("id", desaparecidas);
    }

    resumen.push({ liga: fuente.liga, eventos: refrescables.length });
  }

  return { ok: true, resumen, creditosRestantes };
}

// Cierra eventos terminados y LIQUIDA las apuestas afectadas.
// Inteligente con los créditos: solo consulta las ligas que tienen eventos
// pendientes que ya deberían haber terminado (comenzaron hace más de 2 horas).
export async function cerrarResultados(): Promise<{
  ok: boolean;
  eventosCerrados: number;
  apuestasCerradas: number;
  ligasConsultadas: string[];
}> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { ok: false, eventosCerrados: 0, apuestasCerradas: 0, ligasConsultadas: [] };

  const supabase = crearClienteAdmin();
  const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pendientes } = await supabase
    .from("eventos")
    .select("id, liga, externo_id")
    .eq("estado", "programado")
    .not("externo_id", "is", null)
    .lt("comienza_at", hace2h);

  if (!pendientes || pendientes.length === 0) {
    return { ok: true, eventosCerrados: 0, apuestasCerradas: 0, ligasConsultadas: [] };
  }

  const ligasPendientes = new Set(pendientes.map((p) => p.liga));
  const fuentes = FUENTES.filter((f) => ligasPendientes.has(f.liga));
  let eventosCerrados = 0;
  let apuestasCerradas = 0;

  for (const fuente of fuentes) {
    const { marcadores } = await pedirMarcadores(fuente.clave, apiKey);
    if (!marcadores) continue;

    for (const m of marcadores) {
      if (!m.completed || !m.scores) continue;
      const puntosLocal = Number(m.scores.find((s) => s.name === m.home_team)?.score ?? NaN);
      const puntosVisita = Number(m.scores.find((s) => s.name === m.away_team)?.score ?? NaN);
      if (Number.isNaN(puntosLocal) || Number.isNaN(puntosVisita)) continue;

      const resultado = puntosLocal > puntosVisita ? "a" : puntosLocal < puntosVisita ? "b" : "x";
      const { data: cerrado } = await supabase
        .from("eventos")
        .update({
          estado: "finalizado",
          resultado,
          marcador_a: puntosLocal,
          marcador_b: puntosVisita,
        })
        .eq("externo_id", m.id)
        .neq("estado", "finalizado")
        .select("id");

      for (const e of cerrado ?? []) {
        eventosCerrados++;
        const { data: liq } = await supabase.rpc("liquidar_evento", { p_evento: e.id });
        if (liq && typeof liq === "object" && "apuestas_cerradas" in liq) {
          apuestasCerradas += Number((liq as { apuestas_cerradas: number }).apuestas_cerradas);
        }
      }
    }
  }

  return { ok: true, eventosCerrados, apuestasCerradas, ligasConsultadas: [...ligasPendientes] };
}
