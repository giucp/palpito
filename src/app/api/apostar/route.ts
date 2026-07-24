import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Colocar apuesta (guía §6): sesión → validación → función atómica `apostar`
// en la base, ejecutada con la clave de servicio. El navegador nunca toca dinero.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });
  }

  let cuerpo: {
    tipo?: string;
    monto?: number;
    idempotency_key?: string;
    selecciones?: Array<{ seleccion_id?: string; cuota_vista?: number }>;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const { tipo, monto, idempotency_key, selecciones } = cuerpo;
  if (
    (tipo !== "simple" && tipo !== "combinada") ||
    typeof monto !== "number" ||
    !Number.isFinite(monto) ||
    typeof idempotency_key !== "string" ||
    !Array.isArray(selecciones) ||
    selecciones.length === 0 ||
    selecciones.some(
      (s) => typeof s.seleccion_id !== "string" || typeof s.cuota_vista !== "number"
    )
  ) {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  // Una combinada exige que todas las líneas acierten, así que dos picks del
  // mismo partido la harían imposible de ganar. Se valida aquí y no solo en la
  // interfaz: el navegador nunca es la última palabra.
  if (tipo === "combinada") {
    const ids = selecciones.map((s) => s.seleccion_id as string);
    const { data: filas } = await admin
      .from("selecciones")
      .select("id, mercados(evento_id)")
      .in("id", ids);
    const eventos = (filas ?? []).map(
      (f) => (f.mercados as unknown as { evento_id: string } | null)?.evento_id
    );
    if (new Set(eventos).size !== eventos.length) {
      return NextResponse.json({ ok: false, motivo: "mismo_partido" }, { status: 409 });
    }
  }

  const { data, error } = await admin.rpc("apostar", {
    p_usuario: user.id,
    p_tipo: tipo,
    p_monto: monto,
    p_idempotency: idempotency_key,
    p_selecciones: selecciones,
  });

  if (error) {
    console.error("[apostar] error:", error.message);
    return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
  }

  const resultado = data as { ok: boolean; motivo?: string };
  if (!resultado.ok) {
    const codigo = resultado.motivo === "saldo" || resultado.motivo === "cuotas" ? 409 : 400;
    return NextResponse.json(resultado, { status: codigo });
  }
  return NextResponse.json(resultado);
}
