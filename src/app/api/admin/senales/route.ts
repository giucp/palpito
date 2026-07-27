import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { balanceSenales } from "@/lib/senales/guardar";

// Las señales del motor, solo para el administrador.
//
// Mientras se afina, esto **no se le muestra a nadie más**. Un score de 91 sin
// meses de resultados detrás es una opinión con pinta de dato, y enseñarlo antes
// de tiempo es la forma más rápida de que alguien lo tome por bueno.
//
// Misma doble comprobación que el resto del panel: acá se mira que sea
// administrador, y la tabla no tiene política de lectura, así que solo se llega
// con la clave de servicio.

const ZONA = "America/Caracas";
const hoyEnCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

async function esAdmin(): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("administradores")
    .select("usuario_id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  return data ? user.id : null;
}

export async function GET(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, motivo: "no_autorizado" }, { status: 403 });
  }

  const fecha = req.nextUrl.searchParams.get("fecha") || hoyEnCaracas();
  const admin = crearClienteAdmin();

  const [{ data: senales }, { data: dias }, balance] = await Promise.all([
    admin
      .from("senales_dia")
      .select(
        "id, juego, partido, hora, lado, equipo, score, midieron, total_modelos, acuerdo, entra, motivo_descarte, contradice, detalle, curado, curado_nota, gano, resuelto_at"
      )
      .eq("fecha", fecha)
      .order("score", { ascending: false }),
    // Los días que ya tienen algo guardado, para poder moverse hacia atrás.
    admin.from("senales_dia").select("fecha").order("fecha", { ascending: false }).limit(400),
    balanceSenales(),
  ]);

  const fechas = [...new Set((dias ?? []).map((d) => d.fecha as string))];

  return NextResponse.json({ ok: true, fecha, fechas, senales: senales ?? [], balance });
}

/** La curación a mano: se guarda aparte de lo que decidió el motor. */
export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, motivo: "no_autorizado" }, { status: 403 });
  }

  let cuerpo: { id?: string; curado?: boolean | null; nota?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }
  if (typeof cuerpo.id !== "string") {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  // Nunca se toca `entra`: esa es la decisión del motor y tiene que quedar tal
  // como fue, o se pierde la comparación entre las dos series.
  const admin = crearClienteAdmin();
  const { error } = await admin
    .from("senales_dia")
    .update({
      curado: cuerpo.curado ?? null,
      curado_nota: cuerpo.nota ?? null,
      curado_at: cuerpo.curado === null || cuerpo.curado === undefined ? null : new Date().toISOString(),
    })
    .eq("id", cuerpo.id);

  if (error) {
    console.error("[admin:senales]", error.message);
    return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
