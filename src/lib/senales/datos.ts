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

/** Cuántas aperturas mira el modelo de forma. Cinco es lo que se mira en el béisbol. */
const APERTURAS_RECIENTES = 5;
/**
 * Con menos de tres salidas no se habla de forma: una mala tarde no es una racha.
 *
 * Es a propósito **más bajo** que el mínimo de la temporada. Todo el sentido de
 * este modelo es cubrir al abridor que no llega a las 40 entradas del año, así
 * que exigirle la misma muestra lo dejaría inútil justo donde hace falta.
 */
const APERTURAS_MINIMAS = 3;
/** Y aun con tres salidas, si fueron cortísimas el número no dice nada. */
const ENTRADAS_MINIMAS_FORMA = 12;

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
  /**
   * El FIP de sus últimas aperturas, que es otra cosa que el de la temporada.
   *
   * Existe por dos huecos que dejaba el de temporada, los dos vistos en partidos
   * reales:
   *
   *  · **Un abridor que no llega al mínimo de entradas no se podía medir.** Con
   *    22 entradas en el año, el modelo de abridores —que pesa 30%— quedaba
   *    vacío, y el partido perdía su medida más importante. Pero sí tenía cinco
   *    aperturas, que es muestra suficiente para decir algo.
   *  · **La temporada tapa la forma.** Alguien con 4.68 en sus últimas cinco y
   *    K/BB de 0.9 está lanzando mal ahora, aunque su año entero diga otra cosa.
   */
  fipReciente: number | null;
  /** Sobre cuántas aperturas se calculó `fipReciente`. */
  aperturasRecientes: number;
  /** Entradas por apertura en esas salidas. Aguantar poco también es forma. */
  entradasPorApertura: number | null;
};

/**
 * El FIP con el que hay que juzgar a un abridor: el de la temporada, y si no
 * llega al mínimo de entradas, el de sus últimas aperturas.
 *
 * El respaldo importa más de lo que parece. Sin él, un abridor con pocas
 * entradas en el año dejaba **vacío el modelo que pesa 30%**, y el partido
 * perdía su medida más importante justo cuando el rival podía tener una ventaja
 * enorme. Con cinco aperturas hay material de sobra para decir algo.
 */
export const fipEfectivo = (a: Abridor | null | undefined): number | null =>
  a ? (a.fip ?? a.fipReciente) : null;

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

/**
 * El clima a la hora del partido.
 *
 * `empuja` es el dato que hace útil al viento y el que faltaba hasta ahora: va
 * de −1 a +1 y dice si sopla **hacia el jardín** (empuja la pelota, +1) o
 * **hacia home** (la frena, −1). Se calcula cruzando la dirección del viento con
 * el `azimuthAngle` del estadio, que es el rumbo de home al jardín central.
 *
 * Ojo con la convención: en meteorología la dirección del viento es **de dónde
 * viene**, no hacia dónde va. Así que soplar hacia el jardín central es venir
 * desde el rumbo contrario, `azimut + 180`.
 */
export type Clima = {
  temperatura: number;
  viento: number;
  direccion: number;
  lluvia: number;
  empuja: number | null;
  bajoTecho: boolean;
};

/** El total que pone el mercado, y a cómo paga cada lado. */
export type TotalMercado = { linea: number; mas: number; menos: number };

export type Partido = {
  juego: string;
  titulo: string;
  hora: string;
  local: Equipo;
  visita: Equipo;
  abridorLocal: Abridor | null;
  abridorVisita: Abridor | null;
  estadio: Estadio | null;
  clima: Clima | null;
  /** Lo que paga el mercado, si se pudo casar con Polymarket. */
  mercado: { local: number; visita: number } | null;
  /** La línea de carreras del mercado y sus dos precios. */
  total: TotalMercado | null;
  /** El −1.5 del favorito: quién y a cuánto paga. */
  paliza: { equipo: string; lado: "local" | "visita"; p: number } | null;
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
  /** Los FIP de las últimas aperturas, para medir la forma contra la del día. */
  fipsRecientes: number[];
  kbbAbridores: number[];
  erasBullpen: number[];
  carrerasOfensivas: number[];
  opsOfensivas: number[];
  difCarreras: number[];
  /** Para los totales: cada partido comparado contra los demás del día. */
  fipsSumados: number[];
  erasBullpenSumadas: number[];
  carrerasSumadas: number[];
  elevaciones: number[];
};

// ---------------------------------------------------------------- el FIP

function fipDe(s: Crudo): number | null {
  const entradas = num(s.inningsPitched);
  if (!Number.isFinite(entradas) || entradas < ENTRADAS_MINIMAS_ABRIDOR) return null;
  return fipCrudo(s, entradas);
}

/** La fórmula sola, sin el mínimo de entradas. La comparten temporada y forma. */
function fipCrudo(s: Crudo, entradas: number): number {
  const hr = num(s.homeRuns) || 0;
  const bb = num(s.baseOnBalls) || 0;
  const golpeados = num(s.hitByPitch) || 0;
  const k = num(s.strikeOuts) || 0;
  return (13 * hr + 3 * (bb + golpeados) - 2 * k) / entradas + CONSTANTE_FIP;
}

/**
 * El FIP de las últimas aperturas, **sin mirar el partido que se va a predecir**.
 *
 * ## La trampa que hay acá, y que se ve con el ojo desnudo
 *
 * El `gameLog` que devuelve la MLB **incluye el partido de hoy** en cuanto
 * empieza a jugarse. Calcular la forma de un abridor para el partido del 27 con
 * un log que ya trae el 27 es dejar que el motor vea el resultado que tiene que
 * predecir: el 27/07, la apertura de Kirby de ese mismo día (4 entradas, 7
 * limpias, 4 jonrones) habría entrado en su propia "forma previa" y el número
 * habría salido precioso y falso.
 *
 * Por eso se filtra por fecha **estricta**: solo aperturas anteriores al día del
 * partido. Es la misma regla que ya estaba escrita para los backtests, aplicada
 * acá, que es donde se colaba de verdad.
 */
function formaDe(
  splits: Crudo[],
  fecha: string
): { fip: number | null; aperturas: number; entradasPorApertura: number | null } {
  const previas = splits
    .filter((s) => obj(s.stat).gamesStarted === 1)
    .filter((s) => txt(s.date) && txt(s.date) < fecha)
    .sort((a, b) => txt(b.date).localeCompare(txt(a.date)))
    .slice(0, APERTURAS_RECIENTES);

  if (previas.length < APERTURAS_MINIMAS) {
    return { fip: null, aperturas: previas.length, entradasPorApertura: null };
  }

  // Se suman los totales y se calcula el FIP una vez sobre la suma. Promediar
  // los FIP de cada salida daría el mismo peso a una salida de 2 entradas que a
  // una de 8, y son cosas muy distintas.
  const suma = { homeRuns: 0, baseOnBalls: 0, hitByPitch: 0, strikeOuts: 0 };
  let entradas = 0;
  for (const s of previas) {
    const st = obj(s.stat);
    entradas += num(st.inningsPitched) || 0;
    suma.homeRuns += num(st.homeRuns) || 0;
    suma.baseOnBalls += num(st.baseOnBalls) || 0;
    suma.hitByPitch += num(st.hitByPitch) || 0;
    suma.strikeOuts += num(st.strikeOuts) || 0;
  }
  if (entradas < ENTRADAS_MINIMAS_FORMA) {
    return { fip: null, aperturas: previas.length, entradasPorApertura: null };
  }

  return {
    fip: fipCrudo(suma as unknown as Crudo, entradas),
    aperturas: previas.length,
    entradasPorApertura: entradas / previas.length,
  };
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
        // El `gameLog` viaja en el mismo hydrate que la temporada: sigue siendo
        // **una sola consulta por lanzador**, no dos.
        const info = obj(
          await pedir(
            `${MLB}/people/${p.id}?hydrate=stats(group=[pitching],type=[season,gameLog],season=${fecha.slice(0, 4)})`
          )
        );
        const primero = obj(lista(info.people)[0]);
        const bloques = lista(primero.stats);
        const tipo = (t: string) =>
          bloques.find((b) => txt(obj(b.type).displayName) === t);
        const s = obj(obj(lista(obj(tipo("season")).splits)[0]).stat);
        const forma = formaDe(lista(obj(tipo("gameLog")).splits), fecha);
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
          fipReciente: forma.fip,
          aperturasRecientes: forma.aperturas,
          entradasPorApertura: forma.entradasPorApertura,
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

/**
 * El clima en el estadio, a la hora del partido.
 *
 * Open-Meteo, gratis y sin clave. Es la única fuente de fuera de la MLB que
 * necesita el motor de totales, y entró porque da **dirección** de viento: ESPN
 * da ráfagas y sin dirección el viento no sirve para nada, porque 20 km/h hacia
 * el jardín y 20 km/h hacia home son lo contrario el uno del otro.
 */
async function climaDe(e: Estadio, horaISO: string): Promise<Clima | null> {
  // Bajo techo cerrado el clima da igual. "Retractable" no dice si hoy estará
  // abierto o cerrado, así que se trata como abierto: es lo más frecuente.
  const bajoTecho = /dome|fixed/i.test(e.techo ?? "");
  if (bajoTecho) {
    return { temperatura: 22, viento: 0, direccion: 0, lluvia: 0, empuja: 0, bajoTecho: true };
  }

  const j = obj(
    await pedir(
      `https://api.open-meteo.com/v1/forecast?latitude=${e.lat}&longitude=${e.lon}` +
        `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability` +
        `&forecast_days=2&timezone=UTC`
    )
  );
  const h = obj(j.hourly);
  const horas = Array.isArray(h.time) ? (h.time as string[]) : [];
  if (horas.length === 0) return null;

  // La hora del pronóstico más cercana al primer lanzamiento.
  const objetivo = new Date(horaISO).getTime();
  let i = 0;
  let mejor = Infinity;
  for (let k = 0; k < horas.length; k++) {
    const d = Math.abs(new Date(`${horas[k]}Z`).getTime() - objetivo);
    if (d < mejor) {
      mejor = d;
      i = k;
    }
  }

  const lee = (campo: string) => {
    const a = h[campo];
    return Array.isArray(a) ? num(a[i]) : NaN;
  };
  const direccion = lee("wind_direction_10m");

  // Cuánto empuja: +1 sopla hacia el jardín central, −1 hacia home.
  //
  // La dirección meteorológica es de dónde VIENE el viento, así que soplar hacia
  // el jardín es venir desde `azimut + 180`.
  let empuja: number | null = null;
  if (e.azimut !== null && Number.isFinite(direccion)) {
    const desdeQueEmpuja = (e.azimut + 180) % 360;
    const angulo = (((direccion - desdeQueEmpuja) % 360) + 360) % 360;
    empuja = Math.cos((angulo * Math.PI) / 180);
  }

  return {
    temperatura: lee("temperature_2m"),
    viento: lee("wind_speed_10m"),
    direccion,
    lluvia: lee("precipitation_probability"),
    empuja,
    bajoTecho: false,
  };
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
 * Busca un dato de mercado por el id oficial del partido, y si no está, por el
 * par de apodos.
 *
 * El respaldo existe porque no todo partido de la MLB tiene evento en
 * Polymarket, y porque las filas guardadas de antes usan la clave vieja.
 */
function buscar<T>(
  mapa: Map<string, T> | undefined,
  gamePk: string,
  visita: string,
  local: string
): T | null {
  if (!mapa) return null;
  return mapa.get(gamePk) ?? mapa.get(clavePartido(visita, local)) ?? null;
}

/**
 * Todo lo de un día, listo para que los modelos opinen.
 *
 * `mercado` es un mapa opcional de los precios de Polymarket, **con el `gamePk`
 * de clave** (o el par de apodos, para los partidos que no se pudieron casar con
 * la cartelera). Se pasa desde afuera para que esta capa no dependa de nada que
 * no sea la MLB.
 */
export async function traerJornada(
  fecha: string,
  mercado?: Map<string, { local: number; visita: number }>,
  totales?: Map<string, TotalMercado>,
  palizas?: Map<string, { equipo: string; lado: "local" | "visita"; p: number }>
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
      clima: null, // se pide abajo, ya sabiendo el estadio y la hora
      // Por `gamePk` primero, que es único, y por apodos solo como respaldo
      // para los partidos que Polymarket no publicó. En una doble jornada los
      // apodos son los mismos para los dos juegos y se llevaban la línea del
      // otro; el id no se confunde.
      mercado: buscar(mercado, String(g.gamePk), visita.nombre, local.nombre),
      total: buscar(totales, String(g.gamePk), visita.nombre, local.nombre),
      paliza: buscar(palizas, String(g.gamePk), visita.nombre, local.nombre),
      // Se rellena abajo, cuando ya están todos los partidos.
      jornada: {
        fipsAbridores: [],
        fipsRecientes: [],
        kbbAbridores: [],
        erasBullpen: [],
        carrerasOfensivas: [],
        opsOfensivas: [],
        difCarreras: [],
        fipsSumados: [],
        erasBullpenSumadas: [],
        carrerasSumadas: [],
        elevaciones: [],
      },
    });
  }

  // El clima, uno por estadio y a la hora de su partido.
  await Promise.all(
    partidos.map(async (p) => {
      if (!p.estadio || !p.hora) return;
      p.clima = await climaDe(p.estadio, p.hora);
    })
  );

  // Con `fipEfectivo`, para que la lista contra la que se mide la posición
  // contenga los mismos partidos que el modelo puede medir. Si acá se usara
  // `.fip` y allá el efectivo, un partido se compararía contra una jornada que
  // no lo incluye.
  const sumaFip = (p: Partido) => {
    const l = fipEfectivo(p.abridorLocal);
    const v = fipEfectivo(p.abridorVisita);
    return l !== null && v !== null ? l + v : NaN;
  };
  const sumaBullpen = (p: Partido) =>
    p.local.bullpen && p.visita.bullpen ? p.local.bullpen.era + p.visita.bullpen.era : NaN;
  const sumaCarreras = (p: Partido) =>
    p.local.ofensiva && p.visita.ofensiva
      ? p.local.ofensiva.carrerasPorJuego + p.visita.ofensiva.carrerasPorJuego
      : NaN;

  // El contexto contra el que se mide todo. Se arma una vez y lo comparten
  // todos los partidos: es el mismo reparto para los treinta equipos.
  const jornada: Jornada = {
    fipsAbridores: partidos
      .flatMap((p) => [fipEfectivo(p.abridorLocal), fipEfectivo(p.abridorVisita)])
      .filter((x): x is number => typeof x === "number"),
    kbbAbridores: partidos
      .flatMap((p) => [p.abridorLocal?.kbb, p.abridorVisita?.kbb])
      .filter((x): x is number => typeof x === "number"),
    fipsRecientes: partidos
      .flatMap((p) => [fipEfectivo(p.abridorLocal), fipEfectivo(p.abridorVisita)])
      .filter((x): x is number => typeof x === "number"),
    erasBullpen: [...bull.values()].map((b) => b.era),
    carrerasOfensivas: [...ofe.values()].map((o) => o.carrerasPorJuego),
    opsOfensivas: [...ofe.values()].map((o) => o.ops),
    difCarreras: [...form.values()].map((f) => f.difPorJuego).filter(Number.isFinite),
    fipsSumados: partidos.map(sumaFip).filter(Number.isFinite),
    erasBullpenSumadas: partidos.map(sumaBullpen).filter(Number.isFinite),
    carrerasSumadas: partidos.map(sumaCarreras).filter(Number.isFinite),
    elevaciones: partidos
      .map((p) => p.estadio?.elevacion ?? NaN)
      .filter((x): x is number => Number.isFinite(x)),
  };
  for (const p of partidos) p.jornada = jornada;

  return partidos;
}
