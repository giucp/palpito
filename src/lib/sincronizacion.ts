import { crearClienteAdmin } from "./supabase/admin";
import { buscarResultados } from "./resultados";

// Cierre de resultados y liquidación.
//
// **Ya no hay The Odds API.** El dueño decidió el 2026-07-27 que no vuelve, y
// con eso se fue el motor de sincronización de cuotas entero: la cartelera que
// se mira sale de ESPN y los resultados de statsapi.mlb.com, las dos gratis y
// sin tope. Lo que queda acá es cerrar los partidos que terminaron y resolver
// lo que dependía de ellos.
//
// Por eso esto se puede correr cada pocos minutos sin que cueste nada, que es
// lo que hace que la ganancia se acredite pronto en vez de horas después.


// Ventana de cierre, en horas desde el inicio del partido.
//
// VENTANA_MIN: antes de eso casi ningún partido terminó, no vale la pena mirar.
//
// VENTANA_MAX: pasado ese plazo nadie lo reportó, así que se anula y se devuelve
// lo retenido. Si no se puede saber quién ganó, el jugador no pierde.
const VENTANA_MIN_H = 2;
const VENTANA_MAX_H = 24;

export type ResumenResultados = {
  ok: boolean;
  eventosCerrados: number;
  eventosAnulados: number;
  // Cuántos cerró cada fuente, para ver de un vistazo si alguna dejó de
  // emparejar y todo el peso se le está yendo a la otra.
  porFuente: Record<string, number>;
};

// Marca el evento como finalizado y resuelve lo que dependía de él.
// Devuelve `null` si otra corrida lo cerró primero.
async function cerrarYLiquidar(
  supabase: ReturnType<typeof crearClienteAdmin>,
  eventoId: string,
  marcadorA: number,
  marcadorB: number,
  fuente: string,
  externoId: string | null
): Promise<boolean> {
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
  if (!cerrado || cerrado.length === 0) return false;

  // Los desafíos entre amigos de este partido se resuelven acá. Antes también se
  // llamaba a `liquidar_evento`, que pagaba los parleys contra la casa; esos ya
  // no existen y la función se fue con sus tablas.
  await supabase.rpc("liquidar_desafios", { p_evento: eventoId });
  return true;
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
  let anulados = 0;

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
    if (!(await cerrarYLiquidar(supabase, eventoId, a, b, fuente, externoId))) return;
    eventosCerrados++;
    porFuente[fuente] = (porFuente[fuente] ?? 0) + 1;
  };

  // Desafíos que nadie respondió y cuyo partido ya empezó: se devuelve lo
  // retenido sin esperar a que el evento cierre, horas después.
  await supabase.rpc("caducar_desafios");

  // Y los retos de juego que nadie aceptó dentro de su hora.
  //
  // Van aparte porque `caducar_desafios` cruza con `eventos` para saber si el
  // partido empezó, y un reto de Carta más alta no tiene partido: se caía del
  // cruce y no vencía nunca. La función existía desde el principio pero no la
  // llamaba nadie, así que las fichas del que retaba se quedaban retenidas para
  // siempre si el amigo no entraba.
  await supabase.rpc("vencer_desafios_de_juego");

  // Partidos que ya deberían haber terminado.
  const { data: pendientes } = await supabase
    .from("eventos")
    .select("id, deporte, liga, equipo_a, equipo_b, comienza_at, externo_id, espn_id, espn_ruta")
    .eq("estado", "programado")
    .lt("comienza_at", hace(VENTANA_MIN_H))
    .order("comienza_at", { ascending: true });

  if (!pendientes || pendientes.length === 0) {
    return { ok: true, eventosCerrados: 0, eventosAnulados: 0, porFuente };
  }

  // ---- 1) Los resultados, de statsapi.mlb.com y de ESPN ----
  //
  // Antes había un plan B que le preguntaba a The Odds API por lo que estas dos
  // no encontraran, y se esperaban 6 horas para no gastar créditos. Ya no hay
  // plan B ni créditos que cuidar: lo que estas fuentes no resuelvan cae en el
  // paso 3 y se devuelve entero.
  const { resueltos, cancelados } = await buscarResultados(pendientes);

  for (const r of resueltos) {
    await registrar(r.eventoId, r.marcadorA, r.marcadorB, r.fuente, r.externoId);
  }
  // Postergados o cancelados: devolver lo retenido ya, sin hacer esperar a nadie.
  for (const e of cancelados) await anular(e.id);

  // ---- 2) Lo que nadie reportó en 24 h: devolver lo retenido ----
  // Si no se puede saber quién ganó, el jugador no pierde.
  const { data: vencidos } = await supabase
    .from("eventos")
    .select("id")
    .eq("estado", "programado")
    .lt("comienza_at", hace(VENTANA_MAX_H));
  for (const e of vencidos ?? []) await anular(e.id);

  return { ok: true, eventosCerrados, eventosAnulados: anulados, porFuente };
}
