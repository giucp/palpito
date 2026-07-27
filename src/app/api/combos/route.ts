import { NextResponse } from "next/server";
import { armarCombos, traerPartidosDelDia, type Combo } from "@/lib/combos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Los combos del día.
//
// El primero que entra en el día los arma y los guarda; todos los demás los
// leen de la base. Eso resuelve dos cosas a la vez: armarlos son unas treinta
// consultas a MLB StatsAPI y tardan, y además congelarlos hace que **todos vean
// lo mismo** durante el día, que es lo que permite compartirlos por WhatsApp.
//
// Guardar desde el primer día es lo que le da historia a la estadística de
// aciertos, aunque la pantalla del historial todavía no exista.

export const maxDuration = 60;

const ZONA = "America/Caracas";
const hoyEnCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

type FilaCombo = {
  combo: string;
  nombre: string;
  regla: string;
  tipo: Combo["tipo"];
  patas: Combo["patas"];
  multiplicador: number;
  probabilidad: number;
  armado_at: string;
  acerto: boolean | null;
  patas_acertadas: number | null;
};

const aCombo = (f: FilaCombo): Combo & { armadoAt: string; acerto: boolean | null } => ({
  id: f.combo,
  nombre: f.nombre,
  regla: f.regla,
  tipo: f.tipo,
  patas: f.patas,
  multiplicador: Number(f.multiplicador),
  probabilidad: Number(f.probabilidad),
  armadoAt: f.armado_at,
  acerto: f.acerto,
});

export async function GET() {
  const fecha = hoyEnCaracas();
  const admin = crearClienteAdmin();

  const { data: guardados } = await admin
    .from("combos_dia")
    .select("combo, nombre, regla, tipo, patas, multiplicador, probabilidad, armado_at, acerto, patas_acertadas")
    .eq("fecha", fecha);

  if (guardados && guardados.length > 0) {
    return NextResponse.json({ ok: true, fecha, combos: (guardados as FilaCombo[]).map(aCombo) });
  }

  // Todavía no están: se arman una sola vez.
  const partidos = await traerPartidosDelDia(fecha);
  if (partidos.length === 0) {
    return NextResponse.json({ ok: true, fecha, combos: [], motivo: "sin_jornada" });
  }

  const combos = armarCombos(partidos);
  if (combos.length === 0) {
    return NextResponse.json({ ok: true, fecha, combos: [], motivo: "sin_material" });
  }

  const { error } = await admin.from("combos_dia").insert(
    combos.map((c) => ({
      fecha,
      combo: c.id,
      nombre: c.nombre,
      regla: c.regla,
      tipo: c.tipo,
      patas: c.patas,
      multiplicador: c.multiplicador,
      probabilidad: c.probabilidad,
    }))
  );

  // Si dos personas entran en el mismo segundo, la segunda choca con la clave
  // única y no pasa nada: los combos ya quedaron guardados por la primera.
  if (error && !error.message.includes("un_combo_por_dia")) {
    console.error("[combos] guardar:", error.message);
  }

  const armadoAt = new Date().toISOString();
  return NextResponse.json({
    ok: true,
    fecha,
    combos: combos.map((c) => ({ ...c, armadoAt, acerto: null })),
  });
}
