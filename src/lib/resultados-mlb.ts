// El marcador oficial de un día, por `gamePk`.
//
// Sale de statsapi.mlb.com, gratis y sin tope, igual que la liquidación de las
// apuestas. Era la mitad de arriba de `combos-resultado.ts`; **los combos se
// quitaron el 2026-07-29** y lo único que sobrevive es esto, que es lo que el
// motor de señales usa para saber si un candidato ganó.
//
// Se indexa **solo por `gamePk`**. Antes había un segundo índice por el par de
// apodos, como plan B para las patas de combo que se guardaron antes de que se
// anotara el id; ya no hace falta, y quitarlo cierra la puerta a resolver un
// partido con el marcador de otro, que es justo lo que el apodo se presta a
// hacer cuando dos equipos comparten ciudad.

const MLB = "https://statsapi.mlb.com/api/v1";

// Un juego suspendido en la MLB casi siempre se reanuda y cuenta; solo los que
// no se van a jugar anulan la pata. Mismo criterio que `resultados/mlb.ts`.
const NO_SE_JUEGA = /postponed|cancell?ed/i;

type ResultadoJuego = {
  finalizado: boolean;
  cancelado: boolean;
  carrerasLocal: number;
  carrerasVisita: number;
  // Carreras de los dos equipos en la primera entrada. `null` si el partido no
  // llegó a jugarse.
  primera: number | null;
};

type Crudo = Record<string, unknown>;
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {});
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);

// La cartelera oficial de un día, con el marcador por entrada.
//
// Se indexa dos veces: por `gamePk`, que es como vienen las patas nuevas, y por
// el par de apodos, que es el plan B para las que se guardaron antes de que se
// empezara a anotar el id.
export async function traerResultados(fecha: string): Promise<Map<string, ResultadoJuego>> {
  const mapa = new Map<string, ResultadoJuego>();
  const r = await fetch(`${MLB}/schedule?sportId=1&date=${fecha}&hydrate=linescore`, {
    cache: "no-store",
  });
  if (!r.ok) return mapa;

  const j = obj(await r.json());
  for (const g of lista(obj(lista(j.dates)[0]).games)) {
    const equipos = obj(g.teams);
    const visita = txt(obj(obj(equipos.away).team).name);
    const local = txt(obj(obj(equipos.home).team).name);
    if (!visita || !local) continue;

    const ls = obj(g.linescore);
    const primeraEntrada = obj(lista(ls.innings)[0]);
    const hayPrimera = lista(ls.innings).length > 0;

    const res: ResultadoJuego = {
      // "Final" cubre los estados F (final) y O (game over).
      finalizado: txt(obj(g.status).abstractGameState) === "Final",
      cancelado: NO_SE_JUEGA.test(txt(obj(g.status).detailedState)),
      carrerasLocal: num(obj(equipos.home).score),
      carrerasVisita: num(obj(equipos.away).score),
      primera: hayPrimera
        ? num(obj(primeraEntrada.away).runs) + num(obj(primeraEntrada.home).runs)
        : null,
    };

    const pk = String(g.gamePk ?? "");
    if (pk) mapa.set(pk, res);
  }
  return mapa;
}
