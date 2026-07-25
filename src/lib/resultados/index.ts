// Resultados propios: de dónde sale el marcador de cada evento.
//
// The Odds API se queda solo con lo que de verdad cuesta dinero y nadie regala,
// las **cuotas**. Los **resultados** son información pública, así que salen de
// fuentes gratuitas y sin tope:
//
//   béisbol → statsapi.mlb.com (oficial de la MLB)
//   fútbol  → API pública de ESPN
//
// Como no gastan créditos, se pueden consultar cada pocos minutos en vez de
// cada dos horas, que es lo que hace que la ganancia se acredite pronto.

// Las importaciones de este archivo llevan la extensión .ts a propósito: así
// `scripts/probar-emparejamiento.ts` puede correr con node y comprobar este
// mismo código, en vez de una copia que se desactualiza.
import { emparejar, type EventoLocal } from "./nombres.ts";
import { pedirPartidos as pedirMlb } from "./mlb.ts";
import { LIGAS_ESPN, pedirPartidos as pedirEspn } from "./espn.ts";

export { LIGAS_ESPN } from "./espn.ts";
export { normalizar, parecido, emparejar } from "./nombres.ts";

export type EventoPendiente = {
  id: string;
  deporte: string;
  liga: string;
  equipo_a: string;
  equipo_b: string;
  comienza_at: string;
};

export type ResultadoPropio = {
  eventoId: string;
  marcadorA: number;
  marcadorB: number;
  fuente: "mlb" | "espn";
  externoId: string;
};

// Genérico en el tipo del evento para no perder por el camino los campos que
// traiga quien llama (el cierre de resultados necesita conservar `externo_id`
// para el plan B).
export type BusquedaResultados<T extends EventoPendiente = EventoPendiente> = {
  // Terminados y listos para liquidar.
  resueltos: ResultadoPropio[];
  // Encontrados en la fuente pero todavía sin terminar (por empezar, en juego o
  // suspendidos). Se sabe que existen, así que no hace falta preguntarle a la
  // API de pago por ellos: se esperan.
  enCurso: T[];
  // Postergados o cancelados: no se van a jugar. Se anulan y se devuelve lo
  // apostado ya mismo, sin esperar a que venza el plazo.
  cancelados: T[];
  // La fuente gratuita no los tiene. Estos sí caen al plan B.
  sinResolver: T[];
};

const aLocal = (e: EventoPendiente): EventoLocal => ({
  equipoA: e.equipo_a,
  equipoB: e.equipo_b,
  comienzaAt: e.comienza_at,
});

// Rango de días a pedirle a la fuente: del evento pendiente más viejo al más
// nuevo, en un solo pedido. No se recorta a propósito. En la práctica el rango
// es de horas, porque lo que nadie reportó en 24 h se anula y deja de estar
// pendiente; y recortar el extremo viejo sería contraproducente, porque ahí es
// justo donde están los partidos que ya terminaron.
function rango(eventos: EventoPendiente[]) {
  const tiempos = eventos.map((e) => new Date(e.comienza_at).getTime());
  return { desde: new Date(Math.min(...tiempos)), hasta: new Date(Math.max(...tiempos)) };
}

export async function buscarResultados<T extends EventoPendiente>(
  eventos: T[]
): Promise<BusquedaResultados<T>> {
  const resueltos: ResultadoPropio[] = [];
  const enCurso: T[] = [];
  const cancelados: T[] = [];
  const sinResolver: T[] = [];

  if (eventos.length === 0) return { resueltos, enCurso, cancelados, sinResolver };

  // ---- Béisbol: un solo pedido cubre todos los días pendientes ----
  const beisbol = eventos.filter((e) => e.deporte === "beisbol");
  if (beisbol.length > 0) {
    const { desde, hasta } = rango(beisbol);
    let partidos: Awaited<ReturnType<typeof pedirMlb>> = [];
    try {
      partidos = await pedirMlb(desde, hasta);
    } catch {
      partidos = [];
    }
    for (const e of beisbol) {
      const m = emparejar(aLocal(e), partidos);
      if (!m) {
        sinResolver.push(e);
      } else if (m.candidato.cancelado) {
        cancelados.push(e);
      } else if (
        !m.candidato.finalizado ||
        m.candidato.carrerasLocal === null ||
        m.candidato.carrerasVisita === null
      ) {
        enCurso.push(e);
      } else {
        resueltos.push({
          eventoId: e.id,
          marcadorA: m.candidato.carrerasLocal,
          marcadorB: m.candidato.carrerasVisita,
          fuente: "mlb",
          externoId: m.candidato.id,
        });
      }
    }
  }

  // ---- Fútbol: un pedido por liga con eventos pendientes ----
  const futbol = eventos.filter((e) => e.deporte !== "beisbol");
  const porLiga = new Map<string, T[]>();
  for (const e of futbol) {
    if (!LIGAS_ESPN[e.liga]) {
      sinResolver.push(e); // liga sin fuente propia todavía
      continue;
    }
    const lista = porLiga.get(e.liga) ?? [];
    lista.push(e);
    porLiga.set(e.liga, lista);
  }

  for (const [liga, lista] of porLiga) {
    const { desde, hasta } = rango(lista);
    let partidos: Awaited<ReturnType<typeof pedirEspn>> = [];
    try {
      partidos = await pedirEspn(LIGAS_ESPN[liga], desde, hasta);
    } catch {
      partidos = [];
    }
    for (const e of lista) {
      const m = emparejar(aLocal(e), partidos);
      if (!m) {
        sinResolver.push(e);
      } else if (m.candidato.cancelado) {
        cancelados.push(e);
      } else if (
        !m.candidato.finalizado ||
        m.candidato.golesLocal === null ||
        m.candidato.golesVisita === null
      ) {
        enCurso.push(e);
      } else {
        resueltos.push({
          eventoId: e.id,
          marcadorA: m.candidato.golesLocal,
          marcadorB: m.candidato.golesVisita,
          fuente: "espn",
          externoId: m.candidato.id,
        });
      }
    }
  }

  return { resueltos, enCurso, cancelados, sinResolver };
}
