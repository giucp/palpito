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

export type EventoPoly = {
  id: string;
  titulo: string;
  slug: string;
  imagen: string | null;
  comienzaAt: string | null;
  volumen24h: number;
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
  startDate?: string;
  volume24hr?: number;
  markets?: CrudoMercado[];
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
        comienzaAt: e.startDate ?? null,
        volumen24h: Number(e.volume24hr ?? 0),
        mercados,
      };
    })
    .filter((e) => e.mercados.length > 0);
}
