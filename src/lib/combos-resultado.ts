// Resolver los combos del día: decir si pegaron.
//
// Es lo que le da sentido a guardarlos. Un combo que nadie resuelve es un
// pronóstico que nunca se cobra, y ahí la regla escrita en la tarjeta no vale
// nada: cualquiera puede decir "los cuatro con mejor pitcheo" si después no hay
// que enseñar cuántas veces salió bien.
//
// Los resultados salen de statsapi.mlb.com, gratis y sin tope, igual que la
// liquidación de las apuestas. Corre pegado al mismo cron de cada 10 minutos
// (`/api/resultados`), así que un combo queda resuelto a los pocos minutos de
// terminar el último de sus partidos.
//
// **Idempotente:** un combo ya resuelto no se vuelve a tocar, y uno cuyos
// partidos siguen en juego se deja pendiente y se reintenta en la próxima
// vuelta.

// Con ruta relativa y extensión .ts a propósito, igual que `resultados/index.ts`:
// así `scripts/probar-combos-resultado.ts` puede importar este archivo con node
// y probar el código que de verdad corre, en vez de una copia.
import { crearClienteAdmin } from "./supabase/admin.ts";
import { clavePartido, type Apuesta, type Pata } from "./combos.ts";

const MLB = "https://statsapi.mlb.com/api/v1";

// Después de este tiempo se cierra el combo con lo que haya. Un partido
// pospuesto se juega otro día y su pata ya no se puede decidir; sin este corte,
// el combo quedaría pendiente para siempre y nunca entraría en la estadística.
const DIAS_PARA_CERRAR = 2;

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
    mapa.set(clavePartido(visita, local), res);
  }
  return mapa;
}

// ¿Pegó esta pata?
//
// `null` quiere decir **no se puede decidir**, y no es lo mismo que fallar: el
// partido no se jugó, o el total cayó justo en la línea. Una pata así se cae
// del combo en vez de hundirlo, que es lo que hace cualquier casa con un empate
// dentro de un parlay.
export function resolverPata(apuesta: Apuesta, r: ResultadoJuego): boolean | null {
  if (r.cancelado || !r.finalizado) return null;
  const total = r.carrerasLocal + r.carrerasVisita;

  switch (apuesta.mercado) {
    case "gana": {
      const gana =
        apuesta.lado === "local"
          ? r.carrerasLocal > r.carrerasVisita
          : r.carrerasVisita > r.carrerasLocal;
      return gana;
    }
    case "paliza": {
      const ventaja =
        apuesta.lado === "local"
          ? r.carrerasLocal - r.carrerasVisita
          : r.carrerasVisita - r.carrerasLocal;
      return ventaja >= 2;
    }
    case "total": {
      // Las líneas de Polymarket son de media carrera, así que esto casi nunca
      // pasa. Si pasa, es empate y la pata se anula: no se puede decir que
      // "menos de 9" pegó cuando se anotaron exactamente 9.
      if (total === apuesta.linea) return null;
      return apuesta.mas ? total > apuesta.linea : total < apuesta.linea;
    }
    case "primera": {
      if (r.primera === null) return null;
      return apuesta.anota ? r.primera > 0 : r.primera === 0;
    }
  }
}

// El apodo del partido a partir del título de Polymarket ("Visita vs. Local").
// Plan B para las patas que se guardaron sin `gamePk`.
function claveDelTitulo(titulo: string): string | null {
  const partes = titulo.split(" vs. ");
  if (partes.length !== 2) return null;
  return clavePartido(partes[0], partes[1]);
}

type FilaPendiente = { id: string; fecha: string; patas: Pata[] };

export type ResumenCombos = {
  resueltos: number;
  pendientes: number;
  anulados: number;
};

// Resuelve todos los combos que estén esperando resultado.
export async function resolverCombosPendientes(): Promise<ResumenCombos> {
  const supabase = crearClienteAdmin();
  const resumen: ResumenCombos = { resueltos: 0, pendientes: 0, anulados: 0 };

  const { data, error } = await supabase
    .from("combos_dia")
    .select("id, fecha, patas")
    .is("resuelto_at", null)
    .order("fecha", { ascending: true })
    .limit(200);

  if (error || !data || data.length === 0) return resumen;

  // Se agrupan por día para pedirle a la MLB una sola cartelera por fecha, y no
  // una por combo.
  const porFecha = new Map<string, FilaPendiente[]>();
  for (const f of data as FilaPendiente[]) {
    porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f]);
  }

  const hoy = Date.now();
  for (const [fecha, filas] of porFecha) {
    const resultados = await traerResultados(fecha);
    // Los partidos de este día ya no van a cambiar más: se cierra con lo que haya.
    const seAcabo = (hoy - new Date(`${fecha}T00:00:00Z`).getTime()) / 86_400_000 > DIAS_PARA_CERRAR;

    for (const fila of filas) {
      const patas = fila.patas ?? [];
      let faltan = false;

      const resueltas: Pata[] = patas.map((p) => {
        // Una pata sin `apuesta` es de antes de que se empezara a guardar qué
        // mirar del resultado. No se adivina: se anula y queda fuera de la
        // estadística, que es preferible a inventar un acierto.
        if (!p.apuesta) return { ...p, acerto: null };

        const clave = p.juego ?? claveDelTitulo(p.partido);
        const r = clave ? resultados.get(clave) : undefined;
        if (!r || (!r.finalizado && !r.cancelado)) {
          // Sin resultado todavía. Pasado el plazo, la pata se anula.
          if (!seAcabo) faltan = true;
          return { ...p, acerto: null };
        }
        return { ...p, acerto: resolverPata(p.apuesta, r) };
      });

      if (faltan) {
        // El combo sigue esperando a algún partido, pero las patas que **ya**
        // terminaron se guardan igual.
        //
        // Antes se descartaban: se calculaban acá arriba y este `continue` se
        // las llevaba puestas, así que la tarjeta no marcaba nada hasta que
        // terminara el último partido del combo. Con partidos que empiezan a
        // horas distintas eso son horas mirando un combo sin pintar, con uno de
        // sus partidos terminado hace rato.
        //
        // `resuelto_at` NO se toca: es lo que marca el combo como pendiente, y
        // así la próxima corrida lo vuelve a mirar.
        const cambio = resueltas.some((p, i) => p.acerto !== patas[i]?.acerto);
        if (cambio) {
          await supabase.from("combos_dia").update({ patas: resueltas }).eq("id", fila.id);
        }
        resumen.pendientes++;
        continue;
      }

      const decididas = resueltas.filter((p) => p.acerto !== null);
      const acertadas = resueltas.filter((p) => p.acerto === true).length;
      // Con todas las patas anuladas no hay nada que juzgar: el combo se cierra
      // sin resultado y queda fuera de la estadística.
      const acerto = decididas.length === 0 ? null : decididas.every((p) => p.acerto === true);

      await supabase
        .from("combos_dia")
        .update({
          patas: resueltas,
          acerto,
          patas_acertadas: acertadas,
          resuelto_at: new Date().toISOString(),
        })
        .eq("id", fila.id);

      if (acerto === null) resumen.anulados++;
      else resumen.resueltos++;
    }
  }

  return resumen;
}

// Cuántas veces pegó cada regla, de todo lo que lleva resuelto.
//
// Es el número que el dueño quería ver: "el duelo de pitcheo pegó 3 de 30". Va
// en la tarjeta, al lado de la regla, porque una regla sin su historial es una
// promesa y con él es un dato.
export type Historial = Record<string, { jugados: number; acertados: number }>;

export async function historialDeReglas(): Promise<Historial> {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("combos_dia")
    .select("combo, acerto")
    .not("acerto", "is", null)
    .limit(5000);

  const historial: Historial = {};
  for (const f of (data ?? []) as { combo: string; acerto: boolean }[]) {
    const h = (historial[f.combo] ??= { jugados: 0, acertados: 0 });
    h.jugados++;
    if (f.acerto) h.acertados++;
  }
  return historial;
}
