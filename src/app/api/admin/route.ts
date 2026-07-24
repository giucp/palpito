import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Panel de administración. Dos capas de seguridad:
//   1) aquí se comprueba que quien pide sea administrador,
//   2) y cada función de la base lo vuelve a comprobar por su cuenta.
// Si alguna de las dos falla, no se devuelve nada.

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  const admin = crearClienteAdmin();

  // Capa 1: ¿es administrador?
  const { data: fila } = await admin
    .from("administradores")
    .select("usuario_id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (!fila) {
    // Mismo mensaje y mismo código que si no existiera la ruta: no se
    // confirma ni se niega que el panel exista.
    return NextResponse.json({ ok: false, motivo: "no_autorizado" }, { status: 403 });
  }

  let cuerpo: {
    accion?: string;
    busqueda?: string;
    usuario_id?: string;
    monto?: number;
    nota?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  // Capa 2: las funciones vuelven a validar con p_solicitante
  switch (cuerpo.accion) {
    case "resumen": {
      const { data, error } = await admin.rpc("admin_resumen", { p_solicitante: user.id });
      if (error) return fallo("resumen", error.message);
      return NextResponse.json(data);
    }
    case "usuarios": {
      const { data, error } = await admin.rpc("admin_usuarios", {
        p_solicitante: user.id,
        p_busqueda: typeof cuerpo.busqueda === "string" ? cuerpo.busqueda.slice(0, 120) : null,
        p_limite: 200,
      });
      if (error) return fallo("usuarios", error.message);
      return NextResponse.json(data);
    }
    case "movimientos": {
      if (typeof cuerpo.usuario_id !== "string") {
        return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
      }
      const { data, error } = await admin.rpc("admin_movimientos", {
        p_solicitante: user.id,
        p_usuario: cuerpo.usuario_id,
        p_limite: 60,
      });
      if (error) return fallo("movimientos", error.message);
      return NextResponse.json(data);
    }
    case "acreditar": {
      const { usuario_id, monto, nota } = cuerpo;
      if (
        typeof usuario_id !== "string" ||
        typeof monto !== "number" ||
        !Number.isFinite(monto) ||
        monto === 0
      ) {
        return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
      }
      const { data, error } = await admin.rpc("admin_acreditar", {
        p_solicitante: user.id,
        p_usuario: usuario_id,
        p_monto: monto,
        p_nota: typeof nota === "string" ? nota.slice(0, 160) : null,
      });
      if (error) return fallo("acreditar", error.message);
      return NextResponse.json(data);
    }
    default:
      return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  }
}

function fallo(donde: string, mensaje: string) {
  console.error(`[admin:${donde}]`, mensaje);
  return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
}
