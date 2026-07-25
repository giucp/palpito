import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Amigos: tu alias, tu lista, las invitaciones que te llegaron y las que mandaste.
// Los correos no salen nunca de acá: entre amigos uno se identifica por alias.

async function sesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  const admin = crearClienteAdmin();

  const { data: yo } = await admin
    .from("perfiles")
    .select("alias")
    .eq("usuario_id", user.id)
    .maybeSingle();

  const { data: filas } = await admin
    .from("amistades")
    .select("id, solicitante_id, destinatario_id, estado, created_at")
    .or(`solicitante_id.eq.${user.id},destinatario_id.eq.${user.id}`)
    .neq("estado", "rechazada")
    .order("created_at", { ascending: false });

  // Un solo viaje por los alias de todos los involucrados.
  const otros = (filas ?? []).map((f) =>
    f.solicitante_id === user.id ? f.destinatario_id : f.solicitante_id
  );
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("usuario_id, alias")
    .in("usuario_id", otros.length > 0 ? otros : ["00000000-0000-0000-0000-000000000000"]);
  const alias = new Map((perfiles ?? []).map((p) => [p.usuario_id, p.alias]));

  const amigos: Array<{ id: string; alias: string }> = [];
  const recibidas: Array<{ id: string; alias: string }> = [];
  const enviadas: Array<{ id: string; alias: string }> = [];

  for (const f of filas ?? []) {
    const otroId = f.solicitante_id === user.id ? f.destinatario_id : f.solicitante_id;
    const fila = { id: f.id, alias: alias.get(otroId) ?? "?", usuarioId: otroId };
    if (f.estado === "aceptada") amigos.push({ ...fila, id: otroId });
    else if (f.destinatario_id === user.id) recibidas.push(fila);
    else enviadas.push(fila);
  }

  return NextResponse.json({ ok: true, alias: yo?.alias ?? null, amigos, recibidas, enviadas });
}

export async function POST(req: NextRequest) {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: { accion?: string; alias?: string; amistad?: string; aceptar?: boolean };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  if (cuerpo.accion === "invitar") {
    if (typeof cuerpo.alias !== "string" || cuerpo.alias.trim().length < 3) {
      return NextResponse.json({ ok: false, motivo: "alias_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("solicitar_amistad", {
      p_usuario: user.id,
      p_alias: cuerpo.alias,
    });
    if (error) {
      console.error("[amigos] invitar:", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean };
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  if (cuerpo.accion === "responder") {
    if (typeof cuerpo.amistad !== "string" || typeof cuerpo.aceptar !== "boolean") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("responder_amistad", {
      p_usuario: user.id,
      p_amistad: cuerpo.amistad,
      p_aceptar: cuerpo.aceptar,
    });
    if (error) {
      console.error("[amigos] responder:", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean };
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  if (cuerpo.accion === "alias") {
    if (typeof cuerpo.alias !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("cambiar_alias", {
      p_usuario: user.id,
      p_alias: cuerpo.alias,
    });
    if (error) {
      console.error("[amigos] alias:", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean };
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
