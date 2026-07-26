import { randomUUID } from "crypto";
import { crearClienteAdmin } from "./supabase/admin";
import { FUENTES, mapearMercados, pedirCuotas, pedirMarcadores } from "./odds-api";
import { buscarResultados } from "./resultados";

// Motor de sincronización con The Odds API. Escrituras por lote (rápido) y
// seguro con apuestas: los eventos que ya tienen apuestas no se tocan
// (sus cuotas quedan congeladas a nivel de catálogo).

export type ResumenSincronizacion = {
  ok: boolean;
  resumen: Array<{ liga: string; eventos: number; nota?: string }>;
  creditosRestantes: string | null;
};

// Cada liga cuesta 3 créditos por sincronización (3 mercados × 1 región,
// medido contra la API). Con 7 ligas son 21 por corrida, así que una corrida
// diaria daría 630 al mes contra un tope de 500 en el plan gratis: no entra.
// A 44 h entra cómodo (~11/día ≈ 345/mes) y deja margen para el plan B de
// resultados y para las corridas a mano.
//
// El freno vive acá y no en el cron para no depender de su granularidad: el cron
// de Vercel en plan Hobby solo corre una vez al día, así que llama todos los días
// y la mayoría de las veces esto contesta "todavía no hace falta" sin gastar nada.
export const CADA_SINCRONIZACION_MS = 44 * 60 * 60 * 1000;

// APAGADA a pedido del dueño (2026-07-26). La cartelera que se mira ahora sale
// de ESPN, gratis (`src/lib/tablero.ts`), y los desafíos entre amigos son a
// plata pareja, así que no necesitan cuotas de nadie. Con esto The Odds API deja
// de gastar por completo.
//
// No se borró el motor: sigue entero y andando, y se vuelve a encender poniendo
// esto en false. Los eventos ya sincronizados siguen en la base para liquidar lo
// que quedó abierto.
const SINCRONIZACION_APAGADA = true;

// ¿Vale la pena gastar créditos en refrescar la cartelera?
export async function faltaSincronizar(): Promise<boolean> {
  if (SINCRONIZACION_APAGADA) return false;
  try {
    const supabase = crearClienteAdmin();

    // ¿Hay selecciones de la API sin metadatos de liquidación? (autocuración)
    //
    // OJO con el `!inner` sobre externo_id: solo cuentan las selecciones de
    // eventos que vinieron de The Odds API. Los partidos de referencia que están
    // sembrados a mano (NBA, ATP, CS2…) no tienen `lado` y **nunca lo van a
    // tener**, porque sincronizar no los toca. Sin este filtro la autocuración
    // se disparaba siempre y cada arranque del servidor quemaba 21 créditos.
    const { count: sinLado } = await supabase
      .from("selecciones")
      .select("id, mercados!inner(eventos!inner(externo_id))", { count: "exact", head: true })
      .is("lado", null)
      .not("mercados.eventos.externo_id", "is", null);

    const { data: ultimo } = await supabase
      .from("eventos")
      .select("created_at")
      .not("externo_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimo) return true; // nunca se ha sincronizado
    const viejo = Date.now() - new Date(ultimo.created_at).getTime() > CADA_SINCRONIZACION_MS;
    return viejo || (sinLado ?? 0) > 0;
  } catch {
    return false;
  }
}

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

// Ventana de cierre, en horas desde el inicio del partido.
//
// VENTANA_MIN: antes de eso casi ningún partido terminó, no vale la pena mirar.
//
// PLAN_B: recién a las 6 h se le pregunta a The Odds API por lo que las fuentes
// propias no encontraron. Esperar tanto es a propósito: cada consulta cuesta
// créditos y casi siempre la fuente gratuita termina reportándolo sola.
//
// VENTANA_MAX: pasado ese plazo nadie lo reportó, así que se anula y se devuelve
// lo apostado. Antes eran 12 h porque seguir preguntando gastaba créditos; ahora
// preguntar es gratis, así que se puede esperar el doble antes de darlo por
// perdido, y un postergado ya se detecta solo (no espera a que venza el plazo).
const VENTANA_MIN_H = 2;
const PLAN_B_H = 6;
const VENTANA_MAX_H = 24;

export type ResumenResultados = {
  ok: boolean;
  eventosCerrados: number;
  apuestasCerradas: number;
  eventosAnulados: number;
  // Cuántos cerró cada fuente, para ver de un vistazo si el plan B se está usando
  // más de la cuenta (señal de que algo dejó de emparejar).
  porFuente: Record<string, number>;
  // Ligas por las que hubo que preguntarle a The Odds API, y crédito que quedaba
  // según su propia cabecera. Con el emparejamiento sano, esto va vacío.
  ligasPlanB: string[];
  creditosRestantes: string | null;
};

// Marca el evento como finalizado y liquida sus apuestas. Devuelve cuántas cerró.
async function cerrarYLiquidar(
  supabase: ReturnType<typeof crearClienteAdmin>,
  eventoId: string,
  marcadorA: number,
  marcadorB: number,
  fuente: string,
  externoId: string | null
): Promise<number | null> {
  const resultado = marcadorA > marcadorB ? "a" : marcadorA < marcadorB ? "b" : "x";
  const { data: cerrado } = await supabase
    .from("eventos")
    .update({
      estado: "finalizado",
      resultado,
      marcador_a: marcadorA,
      marcador_b: marcadorB,
      resultado_fuente: fuente,
      resultado_externo_id: externoId,
    })
    .eq("id", eventoId)
    .neq("estado", "finalizado")
    .select("id");

  // Si no actualizó nada, otra corrida lo cerró primero: no liquidar dos veces.
  if (!cerrado || cerrado.length === 0) return null;

  const { data: liq } = await supabase.rpc("liquidar_evento", { p_evento: eventoId });
  // Los desafíos entre amigos de este partido se resuelven en la misma pasada.
  await supabase.rpc("liquidar_desafios", { p_evento: eventoId });

  if (liq && typeof liq === "object" && "apuestas_cerradas" in liq) {
    return Number((liq as { apuestas_cerradas: number }).apuestas_cerradas);
  }
  return 0;
}

// Cierra eventos terminados y LIQUIDA las apuestas afectadas.
//
// Orden de las fuentes: primero las propias (gratis e ilimitadas), y solo lo que
// ellas no resuelven va a The Odds API. Por eso esto se puede correr cada pocos
// minutos sin gastar créditos, que es lo que hace que la ganancia se acredite
// pronto en vez de hasta dos horas después.
export async function cerrarResultados(): Promise<ResumenResultados> {
  const supabase = crearClienteAdmin();
  const ahora = Date.now();
  const hace = (h: number) => new Date(ahora - h * 3600_000).toISOString();

  const porFuente: Record<string, number> = {};
  let eventosCerrados = 0;
  let apuestasCerradas = 0;
  let anulados = 0;
  let creditosRestantes: string | null = null;

  const anular = async (id: string) => {
    await supabase.rpc("anular_evento", { p_evento: id });
    // Un partido que no se jugó también devuelve lo de los desafíos, entero.
    await supabase.rpc("liquidar_desafios", { p_evento: id });
    anulados++;
  };

  const registrar = async (
    eventoId: string,
    a: number,
    b: number,
    fuente: string,
    externoId: string | null
  ) => {
    const n = await cerrarYLiquidar(supabase, eventoId, a, b, fuente, externoId);
    if (n === null) return;
    eventosCerrados++;
    apuestasCerradas += n;
    porFuente[fuente] = (porFuente[fuente] ?? 0) + 1;
  };

  // Desafíos que nadie respondió y cuyo partido ya empezó: se devuelve lo
  // retenido sin esperar a que el evento cierre, horas después.
  await supabase.rpc("caducar_desafios");

  // Partidos que ya deberían haber terminado.
  const { data: pendientes } = await supabase
    .from("eventos")
    .select("id, deporte, liga, equipo_a, equipo_b, comienza_at, externo_id")
    .eq("estado", "programado")
    .lt("comienza_at", hace(VENTANA_MIN_H))
    .order("comienza_at", { ascending: true });

  if (!pendientes || pendientes.length === 0) {
    return {
      ok: true,
      eventosCerrados: 0,
      apuestasCerradas: 0,
      eventosAnulados: 0,
      porFuente,
      ligasPlanB: [],
      creditosRestantes: null,
    };
  }

  // ---- 1) Fuentes propias, gratis ----
  const { resueltos, cancelados, sinResolver } = await buscarResultados(pendientes);

  for (const r of resueltos) {
    await registrar(r.eventoId, r.marcadorA, r.marcadorB, r.fuente, r.externoId);
  }
  // Postergados o cancelados: devolver lo apostado ya, sin hacer esperar a nadie.
  for (const e of cancelados) await anular(e.id);

  // ---- 2) Plan B: The Odds API, solo para lo que quedó sin resolver ----
  const apiKey = process.env.ODDS_API_KEY;
  const rezagados = sinResolver.filter(
    (e) => e.externo_id && new Date(e.comienza_at).getTime() < ahora - PLAN_B_H * 3600_000
  );
  const ligasPlanB = new Set<string>();

  if (apiKey && rezagados.length > 0) {
    const ligas = new Set(rezagados.map((e) => e.liga));
    const porExterno = new Map(rezagados.map((e) => [e.externo_id!, e]));

    for (const fuente of FUENTES.filter((f) => ligas.has(f.liga))) {
      const { marcadores, restantes } = await pedirMarcadores(fuente.clave, apiKey);
      if (restantes) creditosRestantes = restantes;
      ligasPlanB.add(fuente.liga);
      if (!marcadores) continue;

      for (const m of marcadores) {
        const evento = porExterno.get(m.id);
        if (!evento || !m.completed || !m.scores) continue;
        const a = Number(m.scores.find((s) => s.name === m.home_team)?.score ?? NaN);
        const b = Number(m.scores.find((s) => s.name === m.away_team)?.score ?? NaN);
        if (Number.isNaN(a) || Number.isNaN(b)) continue;
        await registrar(evento.id, a, b, "odds_api", m.id);
      }
    }
  }

  // ---- 3) Lo que nadie reportó en 24 h: devolver lo apostado ----
  // Si no se puede saber quién ganó, el usuario no pierde.
  const { data: vencidos } = await supabase
    .from("eventos")
    .select("id")
    .eq("estado", "programado")
    .lt("comienza_at", hace(VENTANA_MAX_H));
  for (const e of vencidos ?? []) await anular(e.id);

  return {
    ok: true,
    eventosCerrados,
    apuestasCerradas,
    eventosAnulados: anulados,
    porFuente,
    ligasPlanB: [...ligasPlanB],
    creditosRestantes,
  };
}
