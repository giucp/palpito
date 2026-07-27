import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Apuestas libres: apostar por cualquier cosa.
//
// Todo el dinero se mueve en funciones atómicas de la base; acá se comprueba la
// sesión y poco más. La lógica de quién gana —los votos, el 2 de 3, el silencio
// que confirma— vive en el SQL a propósito: es donde puede ser atómica, y donde
// nadie la puede saltar manipulando la app.

const MINUTOS_PARA_ACEPTAR = 1440; // un día

async function sesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: {
    accion?: string;
    rival?: string;
    monto?: number;
    descripcion?: string;
    mediador?: string | null;
    desafio?: string;
    gana?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const estado = (r: { ok: boolean; motivo?: string }) =>
    r.ok ? 200 : r.motivo === "saldo" ? 409 : 400;

  // ---- Crear ----
  if (cuerpo.accion === "crear") {
    const { rival, monto, descripcion, mediador } = cuerpo;
    if (
      typeof rival !== "string" ||
      typeof monto !== "number" ||
      !Number.isFinite(monto) ||
      typeof descripcion !== "string"
    ) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("crear_apuesta_libre", {
      p_creador: user.id,
      p_rival: rival,
      p_monto: monto,
      p_descripcion: descripcion,
      p_mediador: typeof mediador === "string" && mediador ? mediador : null,
      p_minutos: MINUTOS_PARA_ACEPTAR,
    });
    if (error) {
      console.error("[libre:crear]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: estado(r) });
  }

  // ---- Aceptar: el rival entra, o el mediador acepta el rol ----
  if (cuerpo.accion === "aceptar") {
    if (typeof cuerpo.desafio !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("aceptar_apuesta_libre", {
      p_desafio: cuerpo.desafio,
      p_usuario: user.id,
    });
    if (error) {
      console.error("[libre:aceptar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: estado(r) });
  }

  // ---- Declarar quién ganó ----
  if (cuerpo.accion === "declarar") {
    if (typeof cuerpo.desafio !== "string" || (cuerpo.gana !== "creador" && cuerpo.gana !== "rival")) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("declarar_apuesta", {
      p_desafio: cuerpo.desafio,
      p_usuario: user.id,
      p_gana: cuerpo.gana,
    });
    if (error) {
      console.error("[libre:declarar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: estado(r) });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
