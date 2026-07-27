import { crearClienteAdmin } from "../supabase/admin.ts";
import { traerResultados } from "../combos-resultado.ts";
import { traerPartidosDelDia, clavePartido } from "../combos.ts";
import { traerJornada, type TotalMercado } from "./datos.ts";
import { MODELOS, candidatosDe, nombreDe } from "./modelos.ts";
import {
  MODELOS_TOTALES,
  candidatosTotalDe,
  nombreTotalDe,
  OPCIONES_TOTALES,
} from "./modelos-totales.ts";
import { juzgar } from "./motor.ts";

// Guardar lo que dijo el motor cada día, y comprobarlo después.
//
// Sin esto el motor es una opinión. Con esto, en un mes se puede contestar la
// única pregunta que importa: **¿los que el motor eligió ganaron más que los que
// descartó?**
//
// ## Se guardan TODOS los candidatos, no solo los que entran
//
// Es la decisión de fondo de este archivo. Guardar solo los recomendados
// permitiría decir "acertamos el 62%", y ese número no significa nada suelto: si
// los descartados también ganaron el 62%, el motor no está eligiendo, está
// mirando. Los descartados son el grupo de comparación, y sin ellos no hay forma
// de saber si los umbrales están donde deben.
//
// ## Y se guarda el detalle de cada modelo
//
// Así, dentro de tres meses, se puede preguntar cosas como "¿el modelo de
// descanso aportó algo?" sin volver a calcular nada: la respuesta está en la
// tabla.

/**
 * Con menos abridores anunciados que esto no se calcula la jornada.
 *
 * El modelo de abridores pesa el 30% y los anuncios llegan a lo largo de la
 * mañana. Calcular a las 6 AM daría una foto sin la mitad de los abridores, y
 * como cada jornada se guarda una sola vez, esa foto mala quedaría para siempre.
 */
const MINIMO_ANUNCIADOS = 0.7;

export type ResumenSenales = {
  fecha: string;
  guardados: number;
  entran: number;
  motivo?: string;
};

/**
 * Los precios de Polymarket, que son el voto del mercado.
 *
 * Si falla, el motor sigue con un modelo menos y se nota en `midieron`. Es
 * preferible una jornada con siete modelos a no guardar nada: el día no se
 * repite.
 */
export async function mercadoDelDia(fecha: string): Promise<{
  ganador: Map<string, { local: number; visita: number }>;
  totales: Map<string, TotalMercado>;
}> {
  const ganador = new Map<string, { local: number; visita: number }>();
  const totales = new Map<string, TotalMercado>();
  try {
    for (const p of await traerPartidosDelDia(fecha)) {
      const clave = clavePartido(p.visita, p.local);
      if (p.ganaLocal !== null && p.ganaVisita !== null) {
        ganador.set(clave, { local: p.ganaLocal, visita: p.ganaVisita });
      }
      // `traerPartidosDelDia` ya se queda con la línea principal y ya filtra los
      // totales de primeras cinco entradas, que es la trampa clásica de estos
      // datos: parecen del juego completo y no lo son.
      if (p.over && p.under) {
        totales.set(clave, { linea: p.over.linea, mas: p.over.p, menos: p.under.p });
      }
    }
  } catch {}
  return { ganador, totales };
}

/** Calcula la jornada y la guarda. Si ya estaba guardada, no hace nada. */
export async function guardarSenales(
  fecha: string,
  mercado?: { ganador: Map<string, { local: number; visita: number }>; totales: Map<string, TotalMercado> }
): Promise<ResumenSenales> {
  const supabase = crearClienteAdmin();

  // Se mira **por familia** y no por día entero. Así, si un día se agrega una
  // familia nueva —los totales llegaron después que los ganadores— la jornada ya
  // guardada no bloquea a la que falta, y no hay que borrar lo de antes para
  // sumar lo nuevo. Borrarlo se llevaría por delante la curación manual.
  const { data: yaHay } = await supabase
    .from("senales_dia")
    .select("mercado")
    .eq("fecha", fecha);
  const guardadas = new Set((yaHay ?? []).map((f) => f.mercado as string));
  if (guardadas.has("ganador") && guardadas.has("total")) {
    return { fecha, guardados: 0, entran: 0, motivo: "ya_estaba" };
  }

  const partidos = await traerJornada(fecha, mercado?.ganador, mercado?.totales);
  if (partidos.length === 0) return { fecha, guardados: 0, entran: 0, motivo: "sin_jornada" };

  const conAbridores = partidos.filter((p) => p.abridorLocal && p.abridorVisita).length;
  if (conAbridores / partidos.length < MINIMO_ANUNCIADOS) {
    return { fecha, guardados: 0, entran: 0, motivo: "faltan_abridores" };
  }

  const comun = (p: (typeof partidos)[number]) => ({
    fecha,
    juego: p.juego,
    partido: p.titulo,
    hora: p.hora || null,
  });

  // Quién gana
  const deGanador = partidos.flatMap((p) =>
    candidatosDe(p).map((c) => {
      const v = juzgar(c, MODELOS);
      return {
        ...comun(p),
        mercado: "ganador",
        linea: null as number | null,
        lado: c.lado,
        equipo: nombreDe(c),
        score: v.score,
        midieron: v.midieron,
        total_modelos: v.total,
        acuerdo: v.acuerdo,
        entra: v.entra,
        motivo_descarte: v.motivoDescarte,
        contradice: v.contradice ? v.contradice.id : null,
        detalle: v.detalle,
      };
    })
  );

  // Más o menos carreras. Solo donde el mercado publicó una línea: sin línea no
  // hay apuesta que juzgar, e inventarnos una sería medirnos contra nosotros
  // mismos.
  const deTotales = partidos.flatMap((p) =>
    candidatosTotalDe(p).map((c) => {
      const v = juzgar(c, MODELOS_TOTALES, OPCIONES_TOTALES);
      return {
        ...comun(p),
        mercado: "total",
        linea: c.linea,
        lado: c.tipo,
        equipo: nombreTotalDe(c),
        score: v.score,
        midieron: v.midieron,
        total_modelos: v.total,
        acuerdo: v.acuerdo,
        entra: v.entra,
        motivo_descarte: v.motivoDescarte,
        contradice: v.contradice ? v.contradice.id : null,
        detalle: v.detalle,
      };
    })
  );

  const filas = [
    ...(guardadas.has("ganador") ? [] : deGanador),
    ...(guardadas.has("total") ? [] : deTotales),
  ];
  if (filas.length === 0) return { fecha, guardados: 0, entran: 0, motivo: "ya_estaba" };

  const { error } = await supabase.from("senales_dia").insert(filas);
  // Si dos corridas coinciden, la segunda choca con la clave única y no pasa
  // nada: la jornada ya quedó guardada por la primera.
  if (error && !error.message.includes("un_senal_por_dia")) {
    console.error("[senales] guardar:", error.message);
    return { fecha, guardados: 0, entran: 0, motivo: "error" };
  }

  return { fecha, guardados: filas.length, entran: filas.filter((f) => f.entra).length };
}

/**
 * Marca qué candidatos acertaron, con los partidos ya terminados.
 *
 * Acertar es que **ese equipo ganó**, y se marca igual para los descartados: son
 * el grupo de comparación y sin su resultado no sirven de nada.
 */
export async function resolverSenales(): Promise<{ resueltos: number; pendientes: number }> {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("senales_dia")
    .select("id, fecha, juego, lado, mercado, linea")
    .is("resuelto_at", null)
    .order("fecha", { ascending: true })
    .limit(500);

  if (!data || data.length === 0) return { resueltos: 0, pendientes: 0 };

  // Una consulta de resultados por fecha, no una por candidato.
  const porFecha = new Map<string, typeof data>();
  for (const f of data) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f]);

  let resueltos = 0;
  let pendientes = 0;
  const ahora = new Date().toISOString();

  for (const [fecha, filas] of porFecha) {
    const resultados = await traerResultados(fecha);
    for (const f of filas) {
      const r = resultados.get(f.juego);
      if (!r || (!r.finalizado && !r.cancelado)) {
        pendientes++;
        continue;
      }
      // Un partido que no se jugó no acertó ni falló: se cierra sin resultado
      // para que no vuelva a mirarse, pero queda fuera de la estadística.
      let gano: boolean | null = null;
      if (!r.cancelado) {
        if (f.mercado === "total") {
          const total = r.carrerasLocal + r.carrerasVisita;
          const linea = Number(f.linea);
          // Empate exacto con la línea: ni acierta ni falla, como en cualquier
          // casa. Las líneas de Polymarket son de media carrera, así que casi
          // nunca pasa, pero "casi nunca" no es "nunca".
          gano =
            !Number.isFinite(linea) || total === linea
              ? null
              : f.lado === "mas"
                ? total > linea
                : total < linea;
        } else {
          gano =
            f.lado === "local"
              ? r.carrerasLocal > r.carrerasVisita
              : r.carrerasVisita > r.carrerasLocal;
        }
      }

      await supabase
        .from("senales_dia")
        .update({ gano, resuelto_at: ahora })
        .eq("id", f.id);
      resueltos++;
    }
  }

  return { resueltos, pendientes };
}

/**
 * Cómo le va al motor, comparando los elegidos contra los descartados.
 *
 * **La segunda columna es la que importa.** Un 62% de acierto entre los
 * elegidos no dice nada si los descartados también ganaron el 62%: querría decir
 * que el motor no está eligiendo, está mirando.
 */
export async function balanceSenales(): Promise<{
  elegidos: { n: number; aciertos: number };
  descartados: { n: number; aciertos: number };
  curados: { n: number; aciertos: number };
  /** Donde el humano y el motor no coincidieron, y quién tenía razón. */
  discrepancias: { n: number; ganoElHumano: number; ganoElMotor: number };
  porModelo: Record<string, { n: number; aciertos: number }>;
}> {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("senales_dia")
    .select("entra, curado, gano, detalle")
    .not("gano", "is", null)
    .limit(10000);

  const elegidos = { n: 0, aciertos: 0 };
  const descartados = { n: 0, aciertos: 0 };
  const curados = { n: 0, aciertos: 0 };
  const discrepancias = { n: 0, ganoElHumano: 0, ganoElMotor: 0 };
  const porModelo: Record<string, { n: number; aciertos: number }> = {};

  for (const f of (data ?? []) as Array<{
    entra: boolean;
    curado: boolean | null;
    gano: boolean;
    detalle: Array<{ id: string; score: number | null }>;
  }>) {
    const grupo = f.entra ? elegidos : descartados;
    grupo.n++;
    if (f.gano) grupo.aciertos++;

    // La serie manual, aparte.
    if (f.curado === true) {
      curados.n++;
      if (f.gano) curados.aciertos++;
    }

    // Donde los dos no coincidieron: quién acertó.
    //
    // Es la comparación que de verdad enseña algo. Que las dos series acierten
    // parecido no dice nada si eligen casi lo mismo; lo que importa es qué pasa
    // justo donde se separan.
    if (f.curado !== null && f.curado !== f.entra) {
      discrepancias.n++;
      // El humano quiso tomarla: acierta si ganó. El humano la sacó: acierta si perdió.
      if (f.curado === f.gano) discrepancias.ganoElHumano++;
      else discrepancias.ganoElMotor++;
    }

    // Cuánto acierta cada modelo por su cuenta, cuando se moja de verdad
    // (por encima de 65). Es lo que dice si un modelo aporta o solo hace ruido.
    for (const d of f.detalle ?? []) {
      if (d.score === null || d.score < 65) continue;
      const m = (porModelo[d.id] ??= { n: 0, aciertos: 0 });
      m.n++;
      if (f.gano) m.aciertos++;
    }
  }

  return { elegidos, descartados, curados, discrepancias, porModelo };
}
