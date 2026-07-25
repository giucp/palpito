import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Desafíos: apuestas entre amigos, plata pareja. Todo el dinero se mueve en las
// funciones atómicas de la base (crear_desafio, aceptar_desafio, cancelar_desafio);
// acá solo se comprueba la sesión y se pasa el pedido.

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
  const { data } = await admin
    .from("desafios")
    // Una sola cadena, sin concatenar: supabase-js la lee como tipo literal para
    // inferir la forma del resultado, y partirla en dos rompe esa inferencia.
    .select(
      "id, creador_id, rival_id, lado_creador, monto, comision_bps, estado, created_at, eventos(id, liga, equipo_a, equipo_b, comienza_at, estado, marcador_a, marcador_b)"
    )
    .or(`creador_id.eq.${user.id},rival_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const ids = [...new Set((data ?? []).flatMap((d) => [d.creador_id, d.rival_id]))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("usuario_id, alias")
    .in("usuario_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const alias = new Map((perfiles ?? []).map((p) => [p.usuario_id, p.alias]));

  const desafios = (data ?? []).map((d) => ({
    ...d,
    soyCreador: d.creador_id === user.id,
    aliasCreador: alias.get(d.creador_id) ?? "?",
    aliasRival: alias.get(d.rival_id) ?? "?",
  }));

  return NextResponse.json({ ok: true, desafios });
}

export async function POST(req: NextRequest) {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: {
    accion?: string;
    rival?: string;
    evento?: string;
    lado?: string;
    monto?: number;
    desafio?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  if (cuerpo.accion === "crear") {
    const { rival, evento, lado, monto } = cuerpo;
    if (
      typeof rival !== "string" ||
      typeof evento !== "string" ||
      (lado !== "local" && lado !== "visitante") ||
      typeof monto !== "number" ||
      !Number.isFinite(monto)
    ) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("crear_desafio", {
      p_creador: user.id,
      p_rival: rival,
      p_evento: evento,
      p_lado: lado,
      p_monto: monto,
    });
    if (error) {
      console.error("[desafios] crear:", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 });
  }

  if (cuerpo.accion === "aceptar" || cuerpo.accion === "cancelar") {
    if (typeof cuerpo.desafio !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const fn = cuerpo.accion === "aceptar" ? "aceptar_desafio" : "cancelar_desafio";
    const { data, error } = await admin.rpc(fn, {
      p_desafio: cuerpo.desafio,
      p_usuario: user.id,
    });
    if (error) {
      console.error(`[desafios] ${cuerpo.accion}:`, error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
