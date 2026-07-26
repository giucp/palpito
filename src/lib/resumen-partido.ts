// El resumen de un partido: lo que se ve al tocarlo en la cartelera.
//
// Sale del endpoint `/summary` de ESPN, que es distinto del `/scoreboard` que
// usa la liquidación. Eso importa: **esto no toca la automatización**. Si
// `/summary` se cae, se cae un dibujo, no un pago.
//
// El crudo pesa muchísimo —924 kB en un partido de béisbol, con 516 jugadas,
// los rosters completos y el box score entero—, así que se recorta acá, en el
// servidor, y al celular le llegan uno o dos kB.
//
// Todo el texto se arma en español desde los campos **estructurados**. ESPN
// escribe su prosa en inglés y no la usamos: los nombres de jugada salen de una
// tabla fija y lo demás son números y nombres propios.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

// ---------------------------------------------------------------- diccionarios

// Tipos de jugada. Si aparece uno que no está, se muestra como viene: es feo
// por un rato, pero no rompe nada y se agrega después.
const JUGADA: Record<string, string> = {
  "Home Run": "Jonrón",
  "Grand Slam": "Grand Slam",
  Single: "Sencillo",
  "Bunt Single": "Sencillo de toque",
  "Infield Single": "Sencillo al cuadro",
  Double: "Doble",
  Triple: "Triple",
  "Field Error": "Error de campo",
  "Catcher Interference": "Interferencia del receptor",
  "Stolen Base": "Base robada",
  "Sac Fly": "Elevado de sacrificio",
  "Sacrifice Fly": "Elevado de sacrificio",
  "Sacrifice Bunt": "Toque de sacrificio",
  Walk: "Base por bolas",
  "Intentional Walk": "Base por bolas intencional",
  "Hit By Pitch": "Golpeado por lanzamiento",
  Strikeout: "Ponche",
  "Fielder's Choice": "Selección del cuadro",
  "Batters Fielders Choice - Runner Out": "Selección del cuadro",
  Forceout: "Out forzado",
  Groundout: "Rodado",
  "Ground Out": "Rodado",
  "Double Play": "Doble matanza",
  Error: "Error",
  "Wild Pitch": "Lanzamiento descontrolado",
  "Passed Ball": "Pelota pasada",
  Balk: "Balk",
  // Fútbol
  Goal: "Gol",
  "Penalty - Scored": "Gol de penal",
  "Penalty - Missed": "Penal errado",
  "Own Goal": "Gol en contra",
  "Penalty - Saved": "Penal atajado",
  "Yellow Card": "Amarilla",
  "Red Card": "Roja",
  "Second Yellow Card": "Doble amarilla",
  Substitution: "Cambio",
};

// Los de trámite: arranque, entretiempo, y las pausas del juego. No cuentan
// nada y llenaban la línea de tiempo de renglones vacíos.
const TRAMITE = new Set([
  "Kickoff",
  "Halftime",
  "Start 2nd Half",
  "End Regular Time",
  "Start Delay",
  "End Delay",
  "Game End",
]);
const GOLES = new Set(["Goal", "Penalty - Scored", "Own Goal"]);
const jugada = (t: string | undefined) => (t ? (JUGADA[t] ?? t) : "");

// Las estadísticas que vale la pena comparar, y cómo se llaman en español.
// El resto se descarta: en un box score entran cuarenta y no se leen.
const NUMEROS: Record<string, string> = {
  // Béisbol
  hits: "Hits",
  runs: "Carreras",
  homeRuns: "Jonrones",
  RBIs: "Impulsadas",
  strikeouts: "Ponches",
  walks: "Bases por bolas",
  avg: "Promedio",
  // Fútbol (acá ESPN manda la etiqueta ya escrita, no el nombre corto)
  "Possession Pct": "Posesión",
  "Total Shots": "Remates",
  "Shots On Goal": "Al arco",
  "Shots on Goal": "Al arco",
  Fouls: "Faltas",
  "Yellow Cards": "Amarillas",
  "Red Cards": "Rojas",
  "Corner Kicks": "Córners",
  Offsides: "Offsides",
  Saves: "Atajadas",
};

// El historial entre los dos equipos viene escrito en inglés y con tres formas
// distintas. Son tres reemplazos, no hace falta un traductor.
function serieEnEspanol(texto: string | undefined): string | null {
  if (!texto) return null;
  // El marcador de la serie puede traer tres números en fútbol, porque cuenta
  // los empates: "Series tied 2-2-1".
  const marcador = "(\\d+-\\d+(?:-\\d+)?)";
  const empate = texto.match(new RegExp(`^Series tied ${marcador}$`, "i"));
  if (empate) return `Empatados ${empate[1]}`;
  const gana = texto.match(new RegExp(`^(.+?) leads? series ${marcador}$`, "i"));
  if (gana) return `${gana[1]} gana la serie ${gana[2]}`;
  const gano = texto.match(new RegExp(`^(.+?) wins? series ${marcador}$`, "i"));
  if (gano) return `${gano[1]} ganó la serie ${gano[2]}`;
  return texto;
}

// ---------------------------------------------------------------------- tipos

export type LadoPartido = {
  nombre: string;
  abrev: string;
  escudo: string | null;
  marcador: string | null;
  record: string | null;
  ganador: boolean;
};

export type Hito = {
  cuando: string; // "9º alta", "63'"
  que: string; // "Jonrón", "Amarilla"
  quien: string | null;
  va: string | null; // "3-2"
  decisivo: boolean; // cambió quién va ganando
};

export type Numero = { etiqueta: string; local: string; visita: string };

export type Situacion = {
  bolas: number;
  strikes: number;
  outs: number;
  bases: [boolean, boolean, boolean];
  lanzador: string | null;
  lanzadorLinea: string | null;
  bateador: string | null;
  bateadorLinea: string | null;
};

export type ResumenPartido = {
  estado: "programado" | "en_juego" | "final" | "otro";
  detalle: string;
  local: LadoPartido;
  visita: LadoPartido;
  sede: string | null;
  publico: number | null;
  // Cabeza
  pronostico: { local: number; visita: number } | null;
  probabilidadLocal: number | null;
  situacion: Situacion | null;
  hitos: Hito[];
  innings: { visita: (number | null)[]; local: (number | null)[] } | null;
  // Cuerpo
  numeros: Numero[];
  forma: { equipo: string; juegos: string[] }[];
  bajas: { equipo: string; cuantos: number; quienes: string[] }[];
  serie: string | null;
  linea: { local: string; visita: string } | null;
};

// ------------------------------------------------------------------- el crudo

type Crudo = Record<string, unknown>;
const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {});
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const txt = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || Number.isNaN(n) ? null : n;
};

function estadoDe(nombre: string): ResumenPartido["estado"] {
  if (nombre === "STATUS_SCHEDULED") return "programado";
  if (nombre === "STATUS_FINAL" || nombre === "STATUS_FULL_TIME") return "final";
  if (nombre.includes("IN_PROGRESS") || nombre.includes("HALFTIME") || nombre.includes("HALF"))
    return "en_juego";
  return "otro";
}

// ------------------------------------------------------------------ el trabajo

export async function traerResumen(
  ruta: string,
  partidoId: string
): Promise<ResumenPartido | null> {
  let crudo: Crudo;
  try {
    // Medio minuto de cache, igual que la cartelera: alcanza para que un
    // marcador en vivo se vea fresco y hace que diez personas mirando el mismo
    // partido sean una sola consulta a ESPN.
    const res = await fetch(`${BASE}/${ruta}/summary?event=${partidoId}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    crudo = (await res.json()) as Crudo;
  } catch {
    return null;
  }

  const comp = obj(lista(obj(crudo.header).competitions)[0]);
  const competidores = lista(comp.competitors);
  const crudoLocal = obj(competidores.find((c) => c.homeAway === "home"));
  const crudoVisita = obj(competidores.find((c) => c.homeAway === "away"));
  if (!crudoLocal.team || !crudoVisita.team) return null;

  const tipoEstado = obj(obj(comp.status).type);
  const estado = estadoDe(txt(tipoEstado.name) ?? "");

  const lado = (c: Crudo): LadoPartido => {
    const eq = obj(c.team);
    return {
      nombre: txt(eq.displayName) ?? txt(eq.name) ?? "",
      abrev: txt(eq.abbreviation) ?? (txt(eq.shortDisplayName) ?? "").slice(0, 3).toUpperCase(),
      escudo: txt(eq.logo) ?? txt(obj(lista(eq.logos)[0]).href),
      marcador: txt(c.score) ?? (num(c.score) !== null ? String(c.score) : null),
      record: txt(obj(lista(c.record)[0]).displayValue),
      ganador: c.winner === true,
    };
  };

  // ---- Nombres de jugador: vienen solo con id, hay que resolverlos ----
  const nombres = new Map<string, string>();
  for (const equipo of lista(crudo.rosters)) {
    for (const j of lista(equipo.roster)) {
      const a = obj(j.athlete);
      const id = txt(a.id) ?? (num(a.id) !== null ? String(a.id) : null);
      if (id) nombres.set(id, txt(a.displayName) ?? txt(a.shortName) ?? "");
    }
  }
  const nombreDe = (id: unknown): string | null => {
    const k = id === null || id === undefined ? null : String(id);
    return k ? (nombres.get(k) ?? null) : null;
  };

  // ---- Hitos: las jugadas que anotaron (béisbol) o los eventos clave (fútbol) ----
  const hitos: Hito[] = [];

  for (const p of lista(crudo.plays)) {
    if (p.scoringPlay !== true) continue;
    const periodo = obj(p.period);
    const alta = txt(periodo.type) === "Top";
    const bateador = lista(p.participants).find((x) => x.type === "batter");
    const anterior = hitos[hitos.length - 1]?.va ?? null;
    const va = `${num(p.awayScore) ?? ""}-${num(p.homeScore) ?? ""}`;
    hitos.push({
      cuando: `${num(periodo.number) ?? ""}º ${alta ? "alta" : "baja"}`,
      // El tipo bueno está en `alternativeType`: en `type` viene el genérico
      // "Play Result", que no le dice nada a nadie.
      que: jugada(txt(obj(p.alternativeType).text) ?? txt(obj(p.type).text) ?? undefined),
      quien: nombreDe(obj(obj(bateador).athlete).id),
      va,
      decisivo: tomaLaDelantera(anterior, va),
    });
  }

  for (const k of lista(crudo.keyEvents)) {
    const tipo = txt(obj(k.type).text) ?? "";
    if (TRAMITE.has(tipo)) continue;

    const quienes = lista(k.participants)
      .map((x) => txt(obj(x.athlete).displayName))
      .filter((x): x is string => Boolean(x));

    // Los dos participantes significan cosas distintas según el evento: en un
    // cambio son el que entra y el que sale; en un gol, el goleador y quien
    // asistió. Ponerlos siempre como "X por Y" hacía que un gol se leyera como
    // una sustitución.
    let quien: string | null = quienes[0] ?? null;
    if (tipo === "Substitution" && quienes.length > 1) {
      quien = `${quienes[0]} por ${quienes[1]}`;
    } else if (GOLES.has(tipo) && quienes.length > 1) {
      quien = `${quienes[0]} · asistencia de ${quienes[1]}`;
    }

    hitos.push({
      cuando: txt(obj(k.clock).displayValue) ?? "",
      que: jugada(tipo),
      quien,
      // En fútbol no se arma el marcador corriendo: habría que contar los goles
      // a mano y los goles en contra se acreditan al revés. El resultado está
      // arriba y el gol ya se distingue por el color.
      va: null,
      decisivo: GOLES.has(tipo),
    });
  }

  // ---- Carreras por inning: solo béisbol ----
  //
  // El fútbol usa el mismo campo `linescores` para los goles de cada tiempo, y
  // sin este filtro a un partido de fútbol le aparecía un cuadro titulado
  // "Carreras por inning" con dos ceros.
  //
  // Ojo también: el número está en `displayValue`, no en `value`. Leyendo
  // `value` da null siempre y el bloque no aparecía nunca.
  const esBeisbol = ruta.startsWith("baseball");
  const porInning = (c: Crudo) =>
    lista(c.linescores).map((x) => num(x.displayValue) ?? num(x.value));
  const iv = esBeisbol ? porInning(crudoVisita) : [];
  const il = esBeisbol ? porInning(crudoLocal) : [];
  const innings =
    iv.some((x) => x !== null) || il.some((x) => x !== null) ? { visita: iv, local: il } : null;

  // ---- Los números del partido ----
  const numeros: Numero[] = [];
  const equiposBox = lista(obj(crudo.boxscore).teams);
  if (equiposBox.length === 2 && estado !== "programado") {
    // Antes de empezar, ESPN manda los totales de la temporada acá. 940 ponches
    // no dicen nada de este partido, así que ese bloque no se arma.
    const deEquipo = (t: Crudo): Map<string, string> => {
      const m = new Map<string, string>();
      for (const g of lista(t.statistics)) {
        const internas = lista(g.stats);
        if (internas.length) {
          // Béisbol: vienen agrupadas (batting / pitching / fielding)
          if (txt(g.name) !== "batting") continue;
          for (const s of internas) {
            const clave = txt(s.name) ?? "";
            if (NUMEROS[clave]) m.set(NUMEROS[clave], txt(s.displayValue) ?? "");
          }
        } else {
          // Fútbol: lista plana de etiqueta y valor
          const clave = txt(g.label) ?? txt(g.name) ?? "";
          if (NUMEROS[clave]) m.set(NUMEROS[clave], txt(g.displayValue) ?? "");
        }
      }
      return m;
    };
    const esLocal = (t: Crudo) => t.homeAway === "home";
    const mLocal = deEquipo(equiposBox.find(esLocal) ?? equiposBox[1]);
    const mVisita = deEquipo(equiposBox.find((t) => !esLocal(t)) ?? equiposBox[0]);
    for (const etiqueta of new Set([...mLocal.keys(), ...mVisita.keys()])) {
      const l = mLocal.get(etiqueta);
      const v = mVisita.get(etiqueta);
      if (l !== undefined && v !== undefined) numeros.push({ etiqueta, local: l, visita: v });
    }
  }

  // ---- Situación: béisbol en vivo. Entre innings no viene y el bloque se cae. ----
  const s = obj(comp.situation);
  const lanzador = obj(s.pitcher);
  const bateador = obj(s.batter);
  const situacion: Situacion | null =
    estado === "en_juego" && (txt(obj(lanzador.athlete).displayName) || num(s.outs) !== null)
      ? {
          bolas: num(s.balls) ?? 0,
          strikes: num(s.strikes) ?? 0,
          outs: num(s.outs) ?? 0,
          bases: [s.onFirst === true, s.onSecond === true, s.onThird === true],
          lanzador: txt(obj(lanzador.athlete).displayName),
          lanzadorLinea: txt(lanzador.summary),
          bateador: txt(obj(bateador.athlete).displayName),
          bateadorLinea: txt(bateador.summary),
        }
      : null;

  // ---- Probabilidad. La última medición es la de ahora. ----
  const probabilidades = lista(crudo.winprobability);
  const ultima = probabilidades[probabilidades.length - 1];
  const probabilidadLocal =
    estado === "en_juego" && ultima
      ? Math.round((num(ultima.homeWinPercentage) ?? 0) * 100)
      : null;

  const pred = obj(crudo.predictor);
  const pronostico =
    estado === "programado" && num(obj(pred.homeTeam).gameProjection) !== null
      ? {
          local: num(obj(pred.homeTeam).gameProjection) ?? 0,
          visita: num(obj(pred.awayTeam).gameProjection) ?? 0,
        }
      : null;

  // ---- Cómo vienen. ESPN no lo manda para partidos ya jugados. ----
  const forma = lista(crudo.lastFiveGames)
    .map((eq) => ({
      equipo: txt(obj(eq.team).abbreviation) ?? txt(obj(eq.team).displayName) ?? "",
      juegos: lista(eq.events)
        .slice(0, 5)
        .map((g) => (txt(g.gameResult) === "W" ? "G" : txt(g.gameResult) === "L" ? "P" : "E")),
    }))
    .filter((x) => x.juegos.length > 0);

  const bajas = lista(crudo.injuries)
    .map((eq) => ({
      equipo: txt(obj(eq.team).abbreviation) ?? txt(obj(eq.team).displayName) ?? "",
      cuantos: lista(eq.injuries).length,
      quienes: lista(eq.injuries)
        .slice(0, 3)
        .map((x) => txt(obj(x.athlete).displayName) ?? "")
        .filter(Boolean),
    }))
    .filter((x) => x.cuantos > 0);

  const apuesta = obj(lista(crudo.pickcenter)[0]);
  const dineroLocal = num(obj(apuesta.homeTeamOdds).moneyLine);
  const dineroVisita = num(obj(apuesta.awayTeamOdds).moneyLine);
  const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n));

  const info = obj(crudo.gameInfo);

  return {
    estado,
    detalle: txt(tipoEstado.shortDetail) ?? txt(tipoEstado.detail) ?? "",
    local: lado(crudoLocal),
    visita: lado(crudoVisita),
    sede: txt(obj(info.venue).fullName),
    publico: num(info.attendance),
    pronostico,
    probabilidadLocal,
    situacion,
    hitos,
    innings,
    numeros,
    forma,
    bajas,
    serie: serieEnEspanol(txt(obj(lista(crudo.seasonseries)[0]).summary) ?? undefined),
    linea:
      dineroLocal !== null && dineroVisita !== null
        ? { local: conSigno(dineroLocal), visita: conSigno(dineroVisita) }
        : null,
  };
}

// ¿Esta anotación puso a alguien adelante? Son las que uno recuerda.
//
// Se probó primero con "cambió quién va ganando", pero en un partido de ida y
// vuelta eso marca todas las anotaciones, y si se destaca todo no se destaca
// nada. Empatar no cuenta: cuenta pasar al frente.
function tomaLaDelantera(antes: string | null, ahora: string): boolean {
  const quien = (m: string | null) => {
    if (!m) return 0;
    const [v, l] = m.split("-").map(Number);
    if (Number.isNaN(v) || Number.isNaN(l)) return 0;
    return v === l ? 0 : v > l ? 1 : -1;
  };
  const a = quien(antes);
  const b = quien(ahora);
  return b !== 0 && b !== a;
}
