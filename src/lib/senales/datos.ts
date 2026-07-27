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
  /** "L" o "R". Es lo que permite cruzarlo con el split del rival. */
  mano: "L" | "R" | null;
};

/** Lo que rindió un equipo contra lanzadores de cada mano. */
export type Splits = { vsZurdo: number | null; vsDerecho: number | null };

/**
 * Cuánto trabajó el bullpen en los últimos días.
 *
 * No es lo mismo un bullpen bueno descansado que el mismo bullpen después de
 * tirar nueve entradas en dos días. Se cuentan solo las entradas de los
 * relevistas: las del abridor no cansan a nadie más.
 */
export type Desgaste = {
  entradas3dias: number;
  lanzamientos3dias: number;
  /** Cuántos relevistas lanzaron ayer. Si fueron muchos, hoy quedan menos. */
  relevistasAyer: number;
};

/** Bajas de peso: jugadores en lista de lesionados. */
export type Bajas = { lesionados: number; nombres: string[] };

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
  splits: Splits | null;
  desgaste: Desgaste | null;
  bajas: Bajas | null;
};

/**
 * El estadio, con lo que hace falta para el clima.
 *
 * `azimut` es hacia dónde mira el campo: el rumbo, en grados, de home hacia el
 * jardín central. Lo publica la propia MLB, así que **no hace falta una tabla
 * escrita a mano**. Con eso y la dirección del viento se sabe si sopla hacia
 * afuera (empuja la pelota) o hacia adentro (la frena), que es lo único que
 * hace útil al viento; la velocidad sola no dice nada.
 */
export type Estadio = {
  nombre: string;
  lat: number;
  lon: number;
  azimut: number | null;
  elevacion: number | null;
  /** "Open", "Dome", "Retractable". Bajo techo el clima no importa. */
  techo: string | null;
};

export type Partido = {
  juego: string;
  titulo: string;
  hora: string;
  local: Equipo;
  visita: Equipo;
  abridorLocal: Abridor | null;
  abridorVisita: Abridor | null;
  estadio: Estadio | null;
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
  const j = obj(
    await pedir(
      `${MLB}/schedule?sportId=1&date=${fecha}&hydrate=probablePitcher,team,venue(location,fieldInfo)`
    )
  );
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
        const mano = txt(obj(primero.pitchHand).code);
        salida[lado] = {
          nombre: txt(p.fullName),
          entradas: num(s.inningsPitched) || 0,
          fip: fipDe(s),
          era: Number.isFinite(num(s.era)) ? num(s.era) : null,
          whip: Number.isFinite(num(s.whip)) ? num(s.whip) : null,
          kbb: bb > 0 ? k / bb : null,
          mano: mano === "L" || mano === "R" ? mano : null,
        };
      }
      porJuego.set(String(g.gamePk), { local: salida.home, visita: salida.away });
    })
  );

  return { juegos, porJuego };
}

/**
 * Cuánto rinde cada equipo contra zurdos y contra derechos.
 *
 * Solo para los que juegan hoy: son unas veinticuatro consultas en vez de
 * treinta, y las otras seis no se usarían.
 */
async function splitsDe(equipos: number[], temporada: number): Promise<Map<number, Splits>> {
  const mapa = new Map<number, Splits>();
  await Promise.all(
    equipos.map(async (id) => {
      const j = obj(
        await pedir(
          `${MLB}/teams/${id}/stats?season=${temporada}&group=hitting&stats=statSplits&sitCodes=vl,vr`
        )
      );
      let vsZurdo: number | null = null;
      let vsDerecho: number | null = null;
      for (const s of lista(obj(lista(j.stats)[0]).splits)) {
        const codigo = txt(obj(s.split).code);
        const ops = num(obj(s.stat).ops);
        if (!Number.isFinite(ops)) continue;
        if (codigo === "vl") vsZurdo = ops;
        if (codigo === "vr") vsDerecho = ops;
      }
      if (vsZurdo !== null || vsDerecho !== null) mapa.set(id, { vsZurdo, vsDerecho });
    })
  );
  return mapa;
}

/**
 * Cuánto trabajó cada bullpen en los últimos tres días.
 *
 * Se recorren los box scores de esos días y se suman las entradas de todos los
 * lanzadores **menos el que abrió**, que es el primero de la lista. Las entradas
 * del abridor no cansan al bullpen.
 */
async function desgastes(fecha: string, equipos: Set<number>): Promise<Map<number, Desgaste>> {
  const dias = [1, 2, 3].map((d) => {
    const t = new Date(`${fecha}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - d);
    return t.toISOString().slice(0, 10);
  });

  const acum = new Map<number, Desgaste>();
  const juegosDe = await Promise.all(
    dias.map(async (d) => {
      const j = obj(await pedir(`${MLB}/schedule?sportId=1&date=${d}`));
      return { dia: d, juegos: lista(obj(lista(j.dates)[0]).games) };
    })
  );

  for (const { dia, juegos } of juegosDe) {
    const relevantes = juegos.filter((g) => {
      const t = obj(g.teams);
      return (
        equipos.has(num(obj(obj(t.home).team).id)) || equipos.has(num(obj(obj(t.away).team).id))
      );
    });

    await Promise.all(
      relevantes.map(async (g) => {
        const box = obj(await pedir(`${MLB}/game/${g.gamePk}/boxscore`));
        for (const lado of ["home", "away"] as const) {
          const eq = obj(obj(box.teams)[lado]);
          const id = num(obj(obj(eq.team).id ? eq.team : {}).id);
          if (!equipos.has(id)) continue;

          const ids = Array.isArray(eq.pitchers) ? (eq.pitchers as number[]) : [];
          // El primero es el abridor: se salta.
          const relevistas = ids.slice(1);
          const a = acum.get(id) ?? { entradas3dias: 0, lanzamientos3dias: 0, relevistasAyer: 0 };
          for (const pid of relevistas) {
            const jugador = obj(obj(eq.players)[`ID${pid}`]);
            const st = obj(obj(jugador.stats).pitching);
            a.entradas3dias += num(st.inningsPitched) || 0;
            a.lanzamientos3dias += num(st.numberOfPitches) || num(st.pitchesThrown) || 0;
          }
          if (dia === dias[0]) a.relevistasAyer += relevistas.length;
          acum.set(id, a);
        }
      })
    );
  }
  return acum;
}

/** Quiénes están en la lista de lesionados de cada equipo. */
async function bajasDe(equipos: number[]): Promise<Map<number, Bajas>> {
  const mapa = new Map<number, Bajas>();
  await Promise.all(
    equipos.map(async (id) => {
      const j = obj(await pedir(`${MLB}/teams/${id}/roster?rosterType=fullSeason`));
      const lesionados = lista(j.roster).filter((r) =>
        /injur/i.test(txt(obj(r.status).description))
      );
      mapa.set(id, {
        lesionados: lesionados.length,
        nombres: lesionados.slice(0, 4).map((r) => txt(obj(r.person).fullName)),
      });
    })
  );
  return mapa;
}

/** El estadio del partido, con lo que hace falta para el clima. */
function estadioDe(g: Crudo): Estadio | null {
  const v = obj(g.venue);
  const loc = obj(v.location);
  const c = obj(loc.defaultCoordinates);
  const lat = num(c.latitude);
  const lon = num(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    nombre: txt(v.name),
    lat,
    lon,
    azimut: Number.isFinite(num(loc.azimuthAngle)) ? num(loc.azimuthAngle) : null,
    elevacion: Number.isFinite(num(loc.elevation)) ? num(loc.elevation) : null,
    techo: txt(obj(v.fieldInfo).roofType) || null,
  };
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

  // Lo que solo hace falta de los equipos que juegan hoy se pide después, ya
  // sabiendo quiénes son: unas veinticuatro consultas en vez de treinta, y las
  // otras seis no se usarían.
  const queJuegan = new Set<number>();
  for (const g of juegos) {
    const t = obj(g.teams);
    queJuegan.add(num(obj(obj(t.home).team).id));
    queJuegan.add(num(obj(obj(t.away).team).id));
  }
  const listaEquipos = [...queJuegan].filter(Number.isFinite);
  const [spl, desg, baj] = await Promise.all([
    splitsDe(listaEquipos, temporada),
    desgastes(fecha, queJuegan),
    bajasDe(listaEquipos),
  ]);

  const equipoDe = (t: Crudo): Equipo => {
    const id = num(obj(t).id);
    return {
      id,
      nombre: txt(obj(t).name),
      ofensiva: ofe.get(id) ?? null,
      bullpen: bull.get(id) ?? null,
      forma: form.get(id) ?? null,
      splits: spl.get(id) ?? null,
      desgaste: desg.get(id) ?? null,
      bajas: baj.get(id) ?? null,
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
      estadio: estadioDe(g),
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
