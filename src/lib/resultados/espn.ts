// Resultados de fútbol desde la API pública de ESPN. Sin clave, sin registro y
// sin tope, y cubre las seis ligas de la cartelera.
//
// Se eligió sobre TheSportsDB tras medirlas contra la misma jornada: con la
// clave libre `3`, TheSportsDB devuelve como mucho 1 evento en
// `eventspastleague` y 5 en `eventsseason`, y en un día de Primera División
// argentina veía 3 partidos donde ESPN veía los 5 reales. Con esos huecos había
// apuestas que no se liquidaban nunca.

import type { CandidatoExterno } from "./nombres";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// Liga de Pálpito → código de liga en ESPN.
export const LIGAS_ESPN: Record<string, string> = {
  "Argentina · Primera División": "arg.1",
  "Brasil · Serie A": "bra.1",
  "Colombia · Primera A": "col.1",
  "Chile · Primera División": "chi.1",
  "USA · MLS": "usa.1",
  "México · Liga MX": "mex.1",
};

export type PartidoEspn = CandidatoExterno & {
  finalizado: boolean;
  cancelado: boolean;
  golesLocal: number | null;
  golesVisita: number | null;
};

// Partidos que no se van a jugar. Saberlo permite devolver lo apostado enseguida
// en vez de esperar a que venza el plazo. Un "suspendido" no entra acá: esos
// suelen reanudarse y cuentan.
const NO_SE_JUEGA = new Set([
  "STATUS_POSTPONED",
  "STATUS_CANCELED",
  "STATUS_CANCELLED",
  "STATUS_ABANDONED",
  "STATUS_FORFEIT",
]);

type RespuestaEspn = {
  events?: Array<{
    id: string;
    date: string;
    competitions?: Array<{
      status?: { type?: { completed?: boolean; name?: string } };
      competitors?: Array<{
        homeAway?: string;
        score?: string;
        team?: { displayName?: string };
      }>;
    }>;
  }>;
};

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

// Un pedido por liga cubre todo el rango de días pendientes.
export async function pedirPartidos(
  codigoLiga: string,
  desde: Date,
  hasta: Date
): Promise<PartidoEspn[]> {
  // ESPN agrupa por jornada local, así que un partido de las 21 h en Argentina
  // aparece bajo el día anterior en UTC. Se pide un día extra de cada lado.
  const margen = 86_400_000;
  const rango = `${ymd(new Date(desde.getTime() - margen))}-${ymd(new Date(hasta.getTime() + margen))}`;

  const res = await fetch(`${BASE}/${codigoLiga}/scoreboard?dates=${rango}`, { cache: "no-store" });
  if (!res.ok) return [];
  const datos = (await res.json()) as RespuestaEspn;

  const partidos: PartidoEspn[] = [];
  for (const ev of datos.events ?? []) {
    const comp = ev.competitions?.[0];
    const local = comp?.competitors?.find((c) => c.homeAway === "home");
    const visitante = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!local?.team?.displayName || !visitante?.team?.displayName) continue;

    const numero = (s?: string) => {
      const n = Number(s);
      return s === undefined || s === null || Number.isNaN(n) ? null : n;
    };

    partidos.push({
      id: ev.id,
      local: local.team.displayName,
      visitante: visitante.team.displayName,
      comienzaAt: ev.date,
      // `completed` lo marca ESPN solo cuando el partido terminó de verdad.
      // Un suspendido queda en false y el evento sigue esperando.
      finalizado: comp?.status?.type?.completed === true,
      cancelado: NO_SE_JUEGA.has(comp?.status?.type?.name ?? ""),
      golesLocal: numero(local.score),
      golesVisita: numero(visitante.score),
    });
  }
  return partidos;
}
