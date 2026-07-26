// Resultados de los partidos que salieron de la cartelera, por id exacto.
//
// El resto de este directorio resuelve **adivinando**: le pide a la fuente los
// partidos de la fecha y empareja por parecido de nombres ("Vélez Sarsfield" vs
// "Velez"). Funciona, pero es lo más frágil que hay acá adentro.
//
// Un partido publicado desde la cartelera no necesita nada de eso: se creó a
// partir de un evento de ESPN y se le guardó su id, así que el marcador se
// busca por coincidencia exacta y no hay con qué equivocarse.
//
// De paso, esto cubre **cualquier deporte de la cartelera**. `espn.ts` es solo
// de fútbol y `mlb.ts` solo de béisbol, así que NBA, NFL, NHL y Champions no
// tenían de dónde sacar un resultado: una apuesta ahí no se habría liquidado
// nunca. Acá la ruta viene guardada en el propio evento, así que agregar una
// liga a la cartelera no obliga a tocar este archivo.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

// Los que no se van a jugar. Un "suspendido" no entra: esos suelen reanudarse.
const NO_SE_JUEGA = new Set([
  "STATUS_POSTPONED",
  "STATUS_CANCELED",
  "STATUS_CANCELLED",
  "STATUS_ABANDONED",
  "STATUS_FORFEIT",
]);

export type PartidoCartelera = {
  id: string;
  finalizado: boolean;
  cancelado: boolean;
  marcadorLocal: number | null;
  marcadorVisita: number | null;
};

type RespuestaEspn = {
  events?: Array<{
    id: string;
    competitions?: Array<{
      status?: { type?: { completed?: boolean; name?: string } };
      competitors?: Array<{ homeAway?: string; score?: string }>;
    }>;
  }>;
};

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

// Un pedido por ruta cubre todos los partidos pendientes de ese deporte.
// Devuelve un mapa por id de ESPN, que es como se los va a buscar.
export async function pedirPorRuta(
  ruta: string,
  desde: Date,
  hasta: Date
): Promise<Map<string, PartidoCartelera>> {
  // ESPN agrupa por jornada local, así que un partido de la noche aparece bajo
  // el día anterior en UTC. Un día de margen de cada lado, como en `espn.ts`.
  const margen = 86_400_000;
  const rango = `${ymd(new Date(desde.getTime() - margen))}-${ymd(new Date(hasta.getTime() + margen))}`;

  const encontrados = new Map<string, PartidoCartelera>();

  const res = await fetch(`${BASE}/${ruta}/scoreboard?dates=${rango}`, { cache: "no-store" });
  if (!res.ok) return encontrados;
  const datos = (await res.json()) as RespuestaEspn;

  for (const ev of datos.events ?? []) {
    const comp = ev.competitions?.[0];
    const local = comp?.competitors?.find((c) => c.homeAway === "home");
    const visita = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!local || !visita) continue;

    const numero = (s?: string) => {
      const n = Number(s);
      return s === undefined || s === null || Number.isNaN(n) ? null : n;
    };

    encontrados.set(ev.id, {
      id: ev.id,
      // `completed` lo marca ESPN solo cuando terminó de verdad. Un suspendido
      // queda en false y el evento sigue esperando.
      finalizado: comp?.status?.type?.completed === true,
      cancelado: NO_SE_JUEGA.has(comp?.status?.type?.name ?? ""),
      marcadorLocal: numero(local.score),
      marcadorVisita: numero(visita.score),
    });
  }

  return encontrados;
}
