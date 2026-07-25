// Integración con The Odds API (the-odds-api.com).
// Trae partidos próximos con cuotas reales de casas de apuestas, y resultados
// para cerrar eventos. Plan gratis: 500 créditos/mes — cada sincronización de
// una liga cuesta ~1-3 créditos, así que se usa con moderación.

export type Fuente = {
  clave: string; // sport key de The Odds API
  deporte: string; // id de deporte en Pálpito
  liga: string; // nombre visible
  nombres: { h2h: string; totals: string; spreads: string };
};

const FUTBOL = { h2h: "Resultado final", totals: "Total de goles", spreads: "Hándicap" };
const BEISBOL = { h2h: "Ganador", totals: "Total de carreras", spreads: "Línea de carreras" };

// Ligas que sincronizamos. Si una no está activa en la API se salta sola.
export const FUENTES: Fuente[] = [
  { clave: "baseball_mlb", deporte: "beisbol", liga: "Estados Unidos · MLB", nombres: BEISBOL },
  { clave: "soccer_argentina_primera_division", deporte: "futbol", liga: "Argentina · Primera División", nombres: FUTBOL },
  { clave: "soccer_brazil_campeonato", deporte: "futbol", liga: "Brasil · Serie A", nombres: FUTBOL },
  { clave: "soccer_colombia_primera_a", deporte: "futbol", liga: "Colombia · Primera A", nombres: FUTBOL },
  { clave: "soccer_chile_campeonato", deporte: "futbol", liga: "Chile · Primera División", nombres: FUTBOL },
  { clave: "soccer_usa_mls", deporte: "futbol", liga: "USA · MLS", nombres: FUTBOL },
  { clave: "soccer_mexico_ligamx", deporte: "futbol", liga: "México · Liga MX", nombres: FUTBOL },
];

export type EventoApi = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: "h2h" | "totals" | "spreads";
      outcomes: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
};

export type MarcadorApi = {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
};

const BASE = "https://api.the-odds-api.com/v4";

export async function pedirCuotas(clave: string, apiKey: string) {
  const url = `${BASE}/sports/${clave}/odds?apiKey=${apiKey}&regions=eu&markets=h2h,totals,spreads&oddsFormat=decimal`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { eventos: null, restantes: null, status: res.status };
  return {
    eventos: (await res.json()) as EventoApi[],
    restantes: res.headers.get("x-requests-remaining"),
    status: res.status,
  };
}

export async function pedirMarcadores(clave: string, apiKey: string) {
  const url = `${BASE}/sports/${clave}/scores?apiKey=${apiKey}&daysFrom=2`;
  const res = await fetch(url, { cache: "no-store" });
  // `restantes` sale de la cabecera que devuelve la propia API: es el crédito
  // que queda de verdad, mejor que estimar a mano cuánto cuesta cada consulta.
  const restantes = res.headers.get("x-requests-remaining");
  if (!res.ok) return { marcadores: null, restantes, status: res.status };
  return { marcadores: (await res.json()) as MarcadorApi[], restantes, status: res.status };
}

export type SeleccionMapeada = {
  nombre: string;
  cuota: number;
  orden: number;
  // Metadatos de liquidación (ver migración liquidacion.sql)
  lado: "local" | "visitante" | "empate" | "mas" | "menos";
  punto: number | null;
};

// Convierte los mercados del primer bookmaker disponible al formato de Pálpito.
export function mapearMercados(ev: EventoApi, nombres: Fuente["nombres"]) {
  const libro = ev.bookmakers[0];
  if (!libro) return [];

  const mercados: Array<{
    tipo: string;
    nombre: string;
    selecciones: SeleccionMapeada[];
  }> = [];

  for (const m of libro.markets) {
    if (m.key === "h2h") {
      const sel = m.outcomes
        .map((o): SeleccionMapeada => {
          if (o.name === ev.home_team)
            return { nombre: "Local", cuota: o.price, orden: 0, lado: "local", punto: null };
          if (o.name === ev.away_team)
            return { nombre: "Visitante", cuota: o.price, orden: 2, lado: "visitante", punto: null };
          return { nombre: "Empate", cuota: o.price, orden: 1, lado: "empate", punto: null };
        })
        .sort((a, b) => a.orden - b.orden);
      mercados.push({ tipo: "h2h", nombre: nombres.h2h, selecciones: sel });
    }
    if (m.key === "totals") {
      const sel = m.outcomes.map((o): SeleccionMapeada => {
        const esMas = o.name === "Over";
        return {
          nombre: `${esMas ? "Más de" : "Menos de"} ${o.point}`,
          cuota: o.price,
          orden: esMas ? 0 : 1,
          lado: esMas ? "mas" : "menos",
          punto: o.point ?? null,
        };
      });
      mercados.push({ tipo: "totals", nombre: nombres.totals, selecciones: sel });
    }
    if (m.key === "spreads") {
      const sel = m.outcomes.map((o): SeleccionMapeada => {
        const punto = o.point ?? 0;
        const signo = punto > 0 ? `+${punto}` : `${punto}`;
        const esLocal = o.name === ev.home_team;
        return {
          nombre: `${esLocal ? "Local" : "Visitante"} ${signo}`,
          cuota: o.price,
          orden: esLocal ? 0 : 1,
          lado: esLocal ? "local" : "visitante",
          punto,
        };
      });
      mercados.push({ tipo: "spreads", nombre: nombres.spreads, selecciones: sel });
    }
  }
  return mercados;
}
