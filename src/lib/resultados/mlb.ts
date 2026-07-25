// Resultados de béisbol desde statsapi.mlb.com — la API oficial de la MLB.
// Sin clave, sin registro y sin tope de consultas: por eso los resultados de
// béisbol salen gratis y se pueden pedir cada pocos minutos.
//
// Regalo: los nombres de equipo son idénticos a los de The Odds API (se
// comprobaron los 30, uno por uno), así que el emparejamiento acá es exacto.

import type { CandidatoExterno } from "./nombres";

const BASE = "https://statsapi.mlb.com/api/v1";

export type PartidoMlb = CandidatoExterno & {
  finalizado: boolean;
  cancelado: boolean;
  carrerasLocal: number | null;
  carrerasVisita: number | null;
};

// Un juego suspendido en la MLB casi siempre se reanuda y cuenta, así que no
// entra acá: solo los que no se van a jugar.
const NO_SE_JUEGA = /postponed|cancell?ed/i;

type RespuestaMlb = {
  dates?: Array<{
    games?: Array<{
      gamePk: number;
      gameDate: string;
      status?: { abstractGameState?: string; detailedState?: string };
      teams?: {
        home?: { team?: { name?: string }; score?: number };
        away?: { team?: { name?: string }; score?: number };
      };
    }>;
  }>;
};

// Un solo pedido cubre todo el rango de días pendientes.
export async function pedirPartidos(desde: Date, hasta: Date): Promise<PartidoMlb[]> {
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const url = `${BASE}/schedule?sportId=1&startDate=${dia(desde)}&endDate=${dia(hasta)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const datos = (await res.json()) as RespuestaMlb;

  const partidos: PartidoMlb[] = [];
  for (const fecha of datos.dates ?? []) {
    for (const j of fecha.games ?? []) {
      const local = j.teams?.home?.team?.name;
      const visitante = j.teams?.away?.team?.name;
      if (!local || !visitante) continue;
      partidos.push({
        id: String(j.gamePk),
        local,
        visitante,
        comienzaAt: j.gameDate,
        // "Final" cubre los estados F (final) y O (game over). Un partido
        // suspendido no llega acá, y así debe ser: se deja pendiente en vez de
        // liquidarlo mal.
        finalizado: j.status?.abstractGameState === "Final",
        cancelado: NO_SE_JUEGA.test(j.status?.detailedState ?? ""),
        carrerasLocal: j.teams?.home?.score ?? null,
        carrerasVisita: j.teams?.away?.score ?? null,
      });
    }
  }
  return partidos;
}
