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

// **No hay POST a propósito.** La curación manual se escribe con la clave de
// servicio, fuera de la aplicación, y esta pantalla solo la muestra.
//
// Son dos series independientes que existen para compararse entre sí: la del
// motor y la del análisis a mano. Si el panel pudiera editar una de las dos,
// dejaría de ser una comparación y pasaría a ser una opinión mezclada con otra,
// y ya pasó una vez: una decisión hecha desde acá se metió en la serie manual y
// hubo que sacarla.
