// Polymarket: mercados de predicción, sin clave ni registro.
//
// Es otra forma de mirar un partido. En vez de la cuota que pone una casa,
// muestra a cuánto lo está pagando la gente que puso plata: el precio de cada
// resultado es directamente su probabilidad (0,595 = 59,5 %).
//
// Se usa la API pública "Gamma", que devuelve eventos con sus mercados y los
// precios actuales. Primera versión: se traen los deportes y se ordenan por
// movimiento de las últimas 24 h. Falta decidir con el dueño qué se destaca.

const BASE = "https://gamma-api.polymarket.com";

export const CATEGORIAS = [
  { id: "mlb", nombre: "MLB" },
  { id: "soccer", nombre: "Fútbol" },
  { id: "nba", nombre: "NBA" },
  { id: "nfl", nombre: "NFL" },
  { id: "sports", nombre: "Todo el deporte" },
] as const;

export type Opcion = { nombre: string; probabilidad: number };

export type MercadoPoly = {
  id: string;
  pregunta: string;
  opciones: Opcion[];
  volumen: number;
};

// En qué está el evento. Los mercados de temporada (campeón 2027, a qué equipo
// va tal jugador) no tienen partido, así que no tienen ni hora ni estado.
export type EstadoPoly = "en_juego" | "por_jugar" | "temporada" | "terminado";

export type EventoPoly = {
  id: string;
  titulo: string;
  slug: string;
  imagen: string | null;
  volumen24h: number;
  estado: EstadoPoly;
  // La hora de verdad del partido. **No es `startDate`**, que es cuándo se abrió
  // el mercado: un partido del 7 de marzo tenía `startDate` del 8 de febrero.
  arrancaAt: string | null;
  // "5-3", en el mismo orden que el título; el primero del título es el
  // visitante. Comprobado contra ESPN en seis partidos.
  marcador: string | null;
  // "Top 5th", "Mid 8th". Solo sirve en vivo: al terminar trae "VFT" o "FT".
  periodo: string | null;
  mercados: MercadoPoly[];
};

type CrudoMercado = {
  id: string;
  question?: string;
  outcomes?: string; // llegan como texto JSON, no como lista
  outcomePrices?: string;
  volume?: string;
  active?: boolean;
  closed?: boolean;
};

type CrudoEvento = {
  id: string;
  title?: string;
  slug?: string;
  image?: string;
  volume24hr?: number;
  // Campos propios de un evento deportivo. Los de temporada no los traen.
  startTime?: string;
  live?: boolean;
  ended?: boolean;
  score?: string;
  period?: string;
  markets?: CrudoMercado[];
};

// En qué está el evento, con lo que Polymarket ya dice de sí mismo.
//
// La única regla nuestra es la última: los mercados acompañantes ("— More
// Markets", "— Player Props") traen hora pero no la marca de terminado, así que
// si la hora ya pasó se los cuenta como terminados. Falla del lado seguro: como
// mucho, un mercado queda un rato más abajo de lo que le tocaba.
function estadoDe(e: CrudoEvento): EstadoPoly {
  if (e.live === true) return "en_juego";
  if (e.ended === true) return "terminado";
  if (!e.startTime) return "temporada";
  return new Date(e.startTime).getTime() > Date.now() ? "por_jugar" : "terminado";
}

// El mismo patrón que la cartelera de Deportes: primero lo que está pasando, al
// final lo que ya terminó. Dentro de cada grupo, por hora.
//
// Los de temporada no tienen hora, así que caen al desempate por volumen y
// conservan exactamente el orden que traían. Por eso los deportes fuera de
// temporada se ven igual que antes sin necesidad de una excepción: sus mercados
// son todos de temporada.
const PRIORIDAD: Record<EstadoPoly, number> = {
  en_juego: 0,
  por_jugar: 1,
  temporada: 2,
  terminado: 3,
};

// `outcomes` y `outcomePrices` vienen como cadenas con JSON adentro.
function listar(texto: string | undefined): string[] {
  if (!texto) return [];
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function traerEventos(categoria: string, limite = 24): Promise<EventoPoly[]> {
  const url =
    `${BASE}/events?tag_slug=${encodeURIComponent(categoria)}` +
    `&closed=false&limit=${limite}&order=volume24hr&ascending=false`;

  let datos: CrudoEvento[] = [];
  try {
    // Los precios se mueven de verdad, pero medio minuto de cache alcanza y
    // evita machacar la API si varios miran a la vez.
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const j = await res.json();
    datos = Array.isArray(j) ? j : [];
  } catch {
    return [];
  }

  return datos
    .map((e) => {
      const mercados: MercadoPoly[] = (e.markets ?? [])
        .filter((m) => m.active !== false && m.closed !== true)
        .map((m) => {
          const nombres = listar(m.outcomes);
          const precios = listar(m.outcomePrices);
          return {
            id: m.id,
            pregunta: m.question ?? "",
            volumen: Number(m.volume ?? 0),
            opciones: nombres.map((n, i) => ({
              nombre: n,
              probabilidad: Number(precios[i] ?? 0),
            })),
          };
        })
        .filter((m) => m.opciones.length > 0 && m.opciones.some((o) => o.probabilidad > 0))
        // Lo más negociado primero: es lo que la gente está mirando.
        .sort((a, b) => b.volumen - a.volumen);

      return {
        id: e.id,
        titulo: e.title ?? "",
        slug: e.slug ?? "",
        imagen: e.image ?? null,
        volumen24h: Number(e.volume24hr ?? 0),
        estado: estadoDe(e),
        arrancaAt: e.startTime ?? null,
        marcador: e.score ?? null,
        periodo: e.period ?? null,
        mercados,
      };
    })
    .filter((e) => e.mercados.length > 0)
    .sort(
      (a, b) =>
        PRIORIDAD[a.estado] - PRIORIDAD[b.estado] ||
        (a.arrancaAt ?? "").localeCompare(b.arrancaAt ?? "") ||
        b.volumen24h - a.volumen24h
    );
}
