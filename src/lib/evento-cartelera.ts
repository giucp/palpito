import { crearClienteAdmin } from "./supabase/admin";
import { buscarPartido, ligaPorId } from "./tablero";

// Un partido de la cartelera, convertido en evento de la base.
//
// La cartelera sale de ESPN en vivo y no está en la base; `eventos` la llenaba
// The Odds API, que está apagada. Como un desafío se cuelga de un `evento_id`,
// cualquier cosa que se apueste sobre un partido pasa primero por acá.
//
// Lo usan las dos formas de apostar contra alguien: publicar al tablero abierto
// y desafiar a un amigo.

export type Asegurado =
  | { ok: true; evento: string; equipoA: string; equipoB: string; comienzaAt: string }
  | { ok: false; motivo: "liga_desconocida" | "partido_desconocido" | "evento_cerrado" | "error_interno" };

export async function asegurarEvento(
  ligaId: string,
  partidoId: string,
  fecha: string
): Promise<Asegurado> {
  const liga = ligaPorId(ligaId);
  if (!liga) return { ok: false, motivo: "liga_desconocida" };

  // Nada de creerle al navegador: el partido se vuelve a pedir a ESPN y se usan
  // sus datos, no los que vinieron en el pedido. Si no, cualquiera podría
  // apostar sobre un partido inventado, ya empezado o con otra hora.
  const p = await buscarPartido(ligaId, partidoId, new Date(`${fecha}T12:00:00Z`));
  if (!p) return { ok: false, motivo: "partido_desconocido" };
  if (p.estado !== "programado" || new Date(p.comienzaAt).getTime() <= Date.now()) {
    return { ok: false, motivo: "evento_cerrado" };
  }

  // Si dos personas apuestan sobre el mismo partido a la vez, `espn_id` es único
  // y la segunda cae en el update en vez de duplicarlo.
  //
  // `estado` queda fuera a propósito: en el alta lo pone el valor por defecto, y
  // en el update no se toca, para no revivir un partido ya cerrado.
  const admin = crearClienteAdmin();
  const { data, error } = await admin
    .from("eventos")
    .upsert(
      {
        deporte: liga.deporte,
        liga: liga.nombre,
        equipo_a: p.local.nombre,
        equipo_b: p.visitante.nombre,
        comienza_at: p.comienzaAt,
        espn_id: p.id,
        espn_ruta: liga.ruta,
      },
      { onConflict: "espn_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    console.error("[evento-cartelera]", error?.message);
    return { ok: false, motivo: "error_interno" };
  }

  return {
    ok: true,
    evento: data.id,
    equipoA: p.local.nombre,
    equipoB: p.visitante.nombre,
    comienzaAt: p.comienzaAt,
  };
}
