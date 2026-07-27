import { clavePartido } from "../combos.ts";

// De dónde salen los números que miran los modelos.
//
// Todo de statsapi.mlb.com, que es gratis, oficial y sin tope. Una sola pasada
// por jornada: la cartelera, el bateo y el pitcheo de los 30 equipos, la tabla
// de posiciones, los abridores anunciados y **todos** los lanzadores de la liga
// con su equipo.
//
// Ese último pedido es el que permite separar el bullpen del abridor sin hacer
// cuatrocientas consultas: `playerPool=ALL` devuelve los 759 lanzadores de la
// liga (el listado normal solo trae los que califican por entradas, y los
// relevistas quedaban todos afuera).

const MLB = "https://statsapi.mlb.com/api/v1";

// Con menos entradas que esto, el número de un lanzador es ruido.
const ENTRADAS_MINIMAS_ABRIDOR = 40;
const ENTRADAS_MINIMAS_RELEVISTA = 10;
const CONSTANTE_FIP = 3.15;

type Crudo = Record<string, unknown>;
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {});
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

async function pedir(url: string, intentos = 3): Promise<unknown> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {}
    if (i < intentos) await new Promise((s) => setTimeout(s, 400 * i));
  }
  return null;
}

export type Abridor = {
  nombre: string;
  entradas: number;
  fip: number | null;
  era: number | null;
  whip: number | null;
  /** Ponches por boleto. Mide control y dominio a la vez. */
  kbb: number | null;
};

export type Bullpen = {
  era: number;
  whip: number;
  entradas: number;
  lanzadores: number;
};

export type Ofensiva = {
  carrerasPorJuego: number;
  ops: number;
  juegos: number;
};

export type Forma = {
  /** Victorias en los últimos diez. */
  ultimos10: number;
  /** Carreras a favor menos en contra, por juego. */
  difPorJuego: number;
  racha: string;
};

export type Equipo = {
  id: number;
  nombre: string;
  ofensiva: Ofensiva | null;
  bullpen: Bullpen | null;
  forma: Forma | null;
};

export type Partido = {
  juego: string;
  titulo: string;
  hora: string;
  local: Equipo;
  visita: Equipo;
  abridorLocal: Abridor | null;
  abridorVisita: Abridor | null;
  /** Lo que paga el mercado, si se pudo casar con Polymarket. */
  mercado: { local: number; visita: number } | null;
  /** El contexto de la jornada, para poder normalizar por posición. */
  jornada: Jornada;
};

/**
 * Los repartos del día contra los que se compara cada equipo.
 *
 * Sin esto no hay forma de decir "está en el 88% mejor": haría falta inventar
 * una escala. Con esto, el número sale de mirar a los demás.
 */
export type Jornada = {
  fipsAbridores: number[];
  kbbAbridores: number[];
  erasBullpen: number[];
  carrerasOfensivas: number[];
  opsOfensivas: number[];
  difCarreras: number[];
};

// ---------------------------------------------------------------- el FIP

function fipDe(s: Crudo): number | null {
  const entradas = num(s.inningsPitched);
  if (!Number.isFinite(entradas) || entradas < ENTRADAS_MINIMAS_ABRIDOR) return null;
  const hr = num(s.homeRuns) || 0;
  const bb = num(s.baseOnBalls) || 0;
  const golpeados = num(s.hitByPitch) || 0;
  const k = num(s.strikeOuts) || 0;
  return (13 * hr + 3 * (bb + golpeados) - 2 * k) / entradas + CONSTANTE_FIP;
}

// -------------------------------------------------------------- las piezas

/** Bateo de los 30 equipos, en una sola consulta. */
async function ofensivas(temporada: number): Promise<Map<number, Ofensiva>> {
  const j = obj(
    await pedir(`${MLB}/teams/stats?season=${temporada}&group=hitting&stats=season&sportIds=1`)
  );
  const mapa = new Map<number, Ofensiva>();
  for (const s of lista(obj(lista(j.stats)[0]).splits)) {
    const id = num(obj(s.team).id);
    const st = obj(s.stat);
    const juegos = num(st.gamesPlayed);
    if (!Number.isFinite(id) || !juegos) continue;
    mapa.set(id, {
      carrerasPorJuego: num(st.runs) / juegos,
      ops: num(st.ops),
      juegos,
    });
  }
  return mapa;
}

/**
 * Bullpen de cada equipo: se suman los lanzadores que **no abren**.
 *
 * "Relevista puro" es el que tiene cero aperturas y al menos diez apariciones.
 * Con menos, un par de entradas malas le mueven la efectividad medio punto y el
 * promedio del equipo se distorsiona.
 */
async function bullpens(temporada: number): Promise<Map<number, Bullpen>> {
  const j = obj(
    await pedir(
      `${MLB}/stats?stats=season&group=pitching&sportId=1&season=${temporada}&limit=1500&playerPool=ALL`
    )
  );
  const acum = new Map<number, { er: number; ip: number; h: number; bb: number; n: number }>();

  for (const s of lista(obj(lista(j.stats)[0]).splits)) {
    const st = obj(s.stat);
    const id = num(obj(s.team).id);
    if (!Number.isFinite(id)) continue;
    if (num(st.gamesStarted) !== 0) continue;
    if (num(st.gamesPlayed) < ENTRADAS_MINIMAS_RELEVISTA) continue;

    const ip = num(st.inningsPitched);
    if (!Number.isFinite(ip) || ip <= 0) continue;

    const a = acum.get(id) ?? { er: 0, ip: 0, h: 0, bb: 0, n: 0 };
    a.er += num(st.earnedRuns) || 0;
    a.ip += ip;
    a.h += num(st.hits) || 0;
    a.bb += num(st.baseOnBalls) || 0;
    a.n++;
    acum.set(id, a);
  }

  const mapa = new Map<number, Bullpen>();
  for (const [id, a] of acum) {
    if (a.ip < 50) continue; // un bullpen entero con menos de 50 entradas no es medible
    mapa.set(id, {
      era: (a.er * 9) / a.ip,
      whip: (a.h + a.bb) / a.ip,
      entradas: a.ip,
      lanzadores: a.n,
    });
  }
  return mapa;
}

/** Últimos diez y diferencial de carreras, de la tabla de posiciones. */
async function formas(temporada: number): Promise<Map<number, Forma>> {
  const j = obj(
    await pedir(`${MLB}/standings?leagueId=103,104&season=${temporada}&standingsTypes=regularSeason`)
  );
  const mapa = new Map<number, Forma>();
  for (const r of lista(j.records)) {
    for (const t of lista(obj(r).teamRecords)) {
      const id = num(obj(t.team).id);
      const juegos = num(t.gamesPlayed);
      if (!Number.isFinite(id) || !juegos) continue;

      const splits = lista(obj(obj(t.records).splitRecords));
      const diez = splits.find((s) => txt(s.type) === "lastTen");
      mapa.set(id, {
        ultimos10: diez ? num(diez.wins) : NaN,
        difPorJuego: (num(t.runsScored) - num(t.runsAllowed)) / juegos,
        racha: txt(obj(t.streak).streakCode),
      });
    }
  }
  return mapa;
}

/** Los abridores anunciados y su temporada. Una consulta por lanzador. */
async function abridores(fecha: string): Promise<{
  juegos: Crudo[];
  porJuego: Map<string, { local: Abridor | null; visita: Abridor | null }>;
}> {
  const j = obj(await pedir(`${MLB}/schedule?sportId=1&date=${fecha}&hydrate=probablePitcher,team`));
  const juegos = lista(obj(lista(j.dates)[0]).games);
  const porJuego = new Map<string, { local: Abridor | null; visita: Abridor | null }>();

  await Promise.all(
    juegos.map(async (g) => {
      const equipos = obj(g.teams);
      const salida: Record<string, Abridor | null> = { away: null, home: null };

      for (const lado of ["away", "home"] as const) {
        const p = obj(obj(equipos[lado]).probablePitcher);
        if (!p.id) continue;
        const info = obj(
          await pedir(`${MLB}/people/${p.id}?hydrate=stats(group=[pitching],type=[season])`)
        );
        const primero = obj(lista(info.people)[0]);
        const st = obj(lista(obj(lista(primero.stats)[0]).splits)[0]).stat;
        const s = obj(st);
        const k = num(s.strikeOuts) || 0;
        const bb = num(s.baseOnBalls) || 0;
        salida[lado] = {
          nombre: txt(p.fullName),
          entradas: num(s.inningsPitched) || 0,
          fip: fipDe(s),
          era: Number.isFinite(num(s.era)) ? num(s.era) : null,
          whip: Number.isFinite(num(s.whip)) ? num(s.whip) : null,
          kbb: bb > 0 ? k / bb : null,
        };
      }
      porJuego.set(String(g.gamePk), { local: salida.home, visita: salida.away });
    })
  );

  return { juegos, porJuego };
}

// ------------------------------------------------------------ la jornada

/**
 * Todo lo de un día, listo para que los modelos opinen.
 *
 * `mercado` es un mapa opcional de `clavePartido()` a los precios de Polymarket:
 * se pasa desde afuera para que esta capa no dependa de nada que no sea la MLB.
 */
export async function traerJornada(
  fecha: string,
  mercado?: Map<string, { local: number; visita: number }>
): Promise<Partido[]> {
  const temporada = Number(fecha.slice(0, 4));
  const [{ juegos, porJuego }, ofe, bull, form] = await Promise.all([
    abridores(fecha),
    ofensivas(temporada),
    bullpens(temporada),
    formas(temporada),
  ]);

  const equipoDe = (t: Crudo): Equipo => {
    const id = num(obj(t).id);
    return {
      id,
      nombre: txt(obj(t).name),
      ofensiva: ofe.get(id) ?? null,
      bullpen: bull.get(id) ?? null,
      forma: form.get(id) ?? null,
    };
  };

  const partidos: Partido[] = [];
  for (const g of juegos) {
    const equipos = obj(g.teams);
    const local = equipoDe(obj(obj(equipos.home).team));
    const visita = equipoDe(obj(obj(equipos.away).team));
    if (!local.nombre || !visita.nombre) continue;

    const par = porJuego.get(String(g.gamePk));
    partidos.push({
      juego: String(g.gamePk),
      titulo: `${visita.nombre} vs. ${local.nombre}`,
      hora: txt(g.gameDate),
      local,
      visita,
      abridorLocal: par?.local ?? null,
      abridorVisita: par?.visita ?? null,
      mercado: mercado?.get(clavePartido(visita.nombre, local.nombre)) ?? null,
      // Se rellena abajo, cuando ya están todos los partidos.
      jornada: {
        fipsAbridores: [],
        kbbAbridores: [],
        erasBullpen: [],
        carrerasOfensivas: [],
        opsOfensivas: [],
        difCarreras: [],
      },
    });
  }

  // El contexto contra el que se mide todo. Se arma una vez y lo comparten
  // todos los partidos: es el mismo reparto para los treinta equipos.
  const jornada: Jornada = {
    fipsAbridores: partidos
      .flatMap((p) => [p.abridorLocal?.fip, p.abridorVisita?.fip])
      .filter((x): x is number => typeof x === "number"),
    kbbAbridores: partidos
      .flatMap((p) => [p.abridorLocal?.kbb, p.abridorVisita?.kbb])
      .filter((x): x is number => typeof x === "number"),
    erasBullpen: [...bull.values()].map((b) => b.era),
    carrerasOfensivas: [...ofe.values()].map((o) => o.carrerasPorJuego),
    opsOfensivas: [...ofe.values()].map((o) => o.ops),
    difCarreras: [...form.values()].map((f) => f.difPorJuego).filter(Number.isFinite),
  };
  for (const p of partidos) p.jornada = jornada;

  return partidos;
}
