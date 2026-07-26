// El tablero: todos los partidos del día con sus líneas, para mirar.
//
// No es para apostar contra la casa: es la cartelera pública, al estilo de las
// apps que llevan la cuenta de tus apuestas (Juice Reel, Pikkit). Por eso sale
// entera de la API pública de ESPN, que ya usábamos para los resultados y que
// además trae las líneas de DraftKings: dinero (moneyline), hándicap y total,
// en cuota americana y ya formateadas.
//
// Ventaja de fondo: no gasta un solo crédito. The Odds API deja de hacer falta
// para esto.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export type Liga = {
  id: string; // clave interna, va en la URL
  ruta: string; // ruta en ESPN
  deporte: string; // agrupador de la barra de arriba
  nombre: string; // como se muestra
};

// Qué se muestra y en qué orden. Se agregan ligas sin tocar nada más: acá y ya.
export const LIGAS: Liga[] = [
  { id: "mlb", ruta: "baseball/mlb", deporte: "Béisbol", nombre: "MLB" },
  { id: "arg", ruta: "soccer/arg.1", deporte: "Fútbol", nombre: "Argentina" },
  { id: "bra", ruta: "soccer/bra.1", deporte: "Fútbol", nombre: "Brasil" },
  { id: "mex", ruta: "soccer/mex.1", deporte: "Fútbol", nombre: "Liga MX" },
  { id: "col", ruta: "soccer/col.1", deporte: "Fútbol", nombre: "Colombia" },
  { id: "chi", ruta: "soccer/chi.1", deporte: "Fútbol", nombre: "Chile" },
  { id: "mls", ruta: "soccer/usa.1", deporte: "Fútbol", nombre: "MLS" },
  { id: "ucl", ruta: "soccer/uefa.champions", deporte: "Fútbol", nombre: "Champions" },
  { id: "nba", ruta: "basketball/nba", deporte: "Baloncesto", nombre: "NBA" },
  { id: "nfl", ruta: "football/nfl", deporte: "Fútbol americano", nombre: "NFL" },
  { id: "nhl", ruta: "hockey/nhl", deporte: "Hockey", nombre: "NHL" },
];

export const ligaPorId = (id: string) => LIGAS.find((l) => l.id === id);
// Al revés: de la ruta guardada en el evento a la liga de la cartelera. Lo usa
// el tablero de apuestas para volver a encontrar el partido de una publicación.
export const ligaPorRuta = (ruta: string) => LIGAS.find((l) => l.ruta === ruta);

// Una celda de línea: el número grande y su precio debajo, como en la cartelera.
export type Linea = {
  valor: string | null; // "-1.5", "o7"; en el dinero no hay línea
  precio: string | null; // cuota americana ya formateada: "-142"
};

export type Lado = {
  nombre: string;
  abrev: string;
  escudo: string | null;
  marcador: number | null;
  ganador: boolean;
  dinero: Linea;
  handicap: Linea;
  total: Linea;
};

export type PartidoTablero = {
  id: string;
  comienzaAt: string;
  estado: "programado" | "en_juego" | "final" | "otro";
  detalle: string; // "Final", "7º inning", la hora…
  liga: string;
  local: Lado;
  visitante: Lado;
  hayLineas: boolean;
};

type CrudoCompetidor = {
  homeAway?: string;
  score?: string;
  winner?: boolean;
  team?: { displayName?: string; abbreviation?: string; logo?: string; shortDisplayName?: string };
};

type CrudoCierre = { line?: string; odds?: string };
type CrudoMercado = {
  home?: { close?: CrudoCierre };
  away?: { close?: CrudoCierre };
  over?: { close?: CrudoCierre };
  under?: { close?: CrudoCierre };
};

type CrudoEvento = {
  id: string;
  date: string;
  competitions?: Array<{
    status?: { type?: { name?: string; state?: string; shortDetail?: string; detail?: string } };
    competitors?: CrudoCompetidor[];
    odds?: Array<{ moneyline?: CrudoMercado; pointSpread?: CrudoMercado; total?: CrudoMercado }>;
  }>;
};

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

const cierre = (m: CrudoMercado | undefined, lado: keyof CrudoMercado): Linea => {
  const c = m?.[lado]?.close;
  return { valor: c?.line ?? null, precio: c?.odds ?? null };
};

function estadoDe(nombre: string): PartidoTablero["estado"] {
  if (nombre === "STATUS_SCHEDULED") return "programado";
  if (nombre === "STATUS_FINAL" || nombre === "STATUS_FULL_TIME") return "final";
  if (
    nombre === "STATUS_IN_PROGRESS" ||
    nombre === "STATUS_HALFTIME" ||
    nombre === "STATUS_END_PERIOD" ||
    nombre === "STATUS_FIRST_HALF" ||
    nombre === "STATUS_SECOND_HALF"
  )
    return "en_juego";
  return "otro";
}

export async function traerTablero(
  ligaId: string,
  fecha: Date
): Promise<{ liga: Liga | null; partidos: PartidoTablero[] }> {
  const liga = ligaPorId(ligaId);
  if (!liga) return { liga: null, partidos: [] };

  // Se pide el día y el siguiente: un partido nocturno cae al día siguiente en
  // UTC, y si no aparecería en la pantalla equivocada.
  const desde = ymd(fecha);
  const hasta = ymd(new Date(fecha.getTime() + 86_400_000));

  let datos: { events?: CrudoEvento[] } = {};
  try {
    const res = await fetch(`${BASE}/${liga.ruta}/scoreboard?dates=${desde}-${hasta}`, {
      // Medio minuto de cache: suficiente para que un marcador en vivo se vea
      // fresco, y suficiente para que ESPN reciba una sola consulta aunque haya
      // muchos mirando a la vez. Pedir más seguido que esto no traería nada
      // nuevo, así que el navegador tampoco lo hace.
      next: { revalidate: 30 },
    });
    if (!res.ok) return { liga, partidos: [] };
    datos = await res.json();
  } catch {
    return { liga, partidos: [] };
  }

  const partidos: PartidoTablero[] = [];

  for (const ev of datos.events ?? []) {
    const comp = ev.competitions?.[0];
    const local = comp?.competitors?.find((c) => c.homeAway === "home");
    const visitante = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!local?.team?.displayName || !visitante?.team?.displayName) continue;

    const od = comp?.odds?.[0];
    const marcador = (c: CrudoCompetidor) => {
      const n = Number(c.score);
      return c.score === undefined || Number.isNaN(n) ? null : n;
    };

    const arma = (c: CrudoCompetidor, cual: "home" | "away"): Lado => ({
      nombre: c.team?.displayName ?? "",
      abrev: c.team?.abbreviation ?? (c.team?.shortDisplayName ?? "").slice(0, 3).toUpperCase(),
      escudo: c.team?.logo ?? null,
      marcador: marcador(c),
      ganador: c.winner === true,
      dinero: cierre(od?.moneyline, cual),
      handicap: cierre(od?.pointSpread, cual),
      // El total no tiene lado propio. Las carteleras lo reparten poniendo el
      // "over" en el renglón de arriba (la visita) y el "under" abajo (el local).
      total: cierre(od?.total, cual === "away" ? "over" : "under"),
    });

    const nombreEstado = comp?.status?.type?.name ?? "";
    partidos.push({
      id: ev.id,
      comienzaAt: ev.date,
      estado: estadoDe(nombreEstado),
      detalle: comp?.status?.type?.shortDetail ?? comp?.status?.type?.detail ?? "",
      liga: liga.nombre,
      local: arma(local, "home"),
      visitante: arma(visitante, "away"),
      hayLineas: Boolean(od),
    });
  }

  partidos.sort((a, b) => a.comienzaAt.localeCompare(b.comienzaAt));

  // Se pidieron dos días para no perder los nocturnos, así que ahora se recorta
  // al día que de verdad se está mirando, en la zona de la app.
  const dia = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(iso));
  const objetivo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(fecha);

  return { liga, partidos: partidos.filter((p) => dia(p.comienzaAt) === objetivo) };
}

// Un partido concreto de la cartelera, por su id de ESPN.
//
// Existe para no creerle al navegador: cuando alguien publica una apuesta, el
// servidor vuelve a pedirle el partido a ESPN y usa **estos** datos —equipos,
// hora, estado— en vez de los que vinieron en el pedido. Si no, cualquiera
// podría publicar una apuesta sobre un partido inventado o ya empezado.
export async function buscarPartido(
  ligaId: string,
  partidoId: string,
  fecha: Date
): Promise<PartidoTablero | null> {
  const { partidos } = await traerTablero(ligaId, fecha);
  return partidos.find((p) => p.id === partidoId) ?? null;
}
