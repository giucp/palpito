import { NextResponse } from "next/server";
import { armarCombos, ORDEN_COMBOS, traerPartidosDelDia, type Combo } from "@/lib/combos";
import { historialDeReglas } from "@/lib/combos-resultado";
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

// Los combos del día están **congelados**: se arman una vez y no cambian hasta
// mañana. Lo único que se mueve es si acertaron, y eso pasa de noche.
//
// Aun así se servían sin cachear, así que cada visita hacía su consulta a la
// base para leer lo mismo que la anterior. Un minuto de caché lo vuelve
// instantáneo para todos menos para el primero, y sigue siendo mucho más rápido
// de lo que cambian los datos.
const CACHE = "public, s-maxage=60, stale-while-revalidate=600";

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

const aCombo = (f: FilaCombo) => ({
  id: f.combo,
  nombre: f.nombre,
  regla: f.regla,
  tipo: f.tipo,
  patas: f.patas,
  multiplicador: Number(f.multiplicador),
  probabilidad: Number(f.probabilidad),
  armadoAt: f.armado_at,
  acerto: f.acerto,
  patasAcertadas: f.patas_acertadas,
});

export async function GET() {
  const fecha = hoyEnCaracas();
  const admin = crearClienteAdmin();

  // El historial de cada regla viaja siempre: es lo que convierte la regla de
  // una promesa en un dato. Se pide en paralelo con los combos del día.
  const [{ data: guardados }, historial] = await Promise.all([
    admin
      .from("combos_dia")
      .select(
        "combo, nombre, regla, tipo, patas, multiplicador, probabilidad, armado_at, acerto, patas_acertadas"
      )
      .eq("fecha", fecha),
    historialDeReglas(),
  ]);

  if (guardados && guardados.length > 0) {
    // La base no garantiza orden, y al resolverse las filas se reescriben: sin
    // ordenar acá, el carrusel cambiaría de orden entre una visita y otra.
    const puesto = (id: string) => {
      const i = ORDEN_COMBOS.indexOf(id);
      return i === -1 ? ORDEN_COMBOS.length : i;
    };
    return NextResponse.json(
      {
        ok: true,
        fecha,
        historial,
        combos: (guardados as FilaCombo[])
          .map(aCombo)
          .sort((a, b) => puesto(a.id) - puesto(b.id)),
      },
      { headers: { "Cache-Control": CACHE } }
    );
  }

  // Todavía no están: se arman una sola vez.
  const partidos = await traerPartidosDelDia(fecha);
  if (partidos.length === 0) {
    return NextResponse.json({ ok: true, fecha, historial, combos: [], motivo: "sin_jornada" });
  }

  const combos = armarCombos(partidos);
  if (combos.length === 0) {
    return NextResponse.json({ ok: true, fecha, historial, combos: [], motivo: "sin_material" });
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
    historial,
    combos: combos.map((c) => ({ ...c, armadoAt, acerto: null, patasAcertadas: null })),
  });
}
