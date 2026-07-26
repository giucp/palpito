import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hashDe, multiplicadores, nuevaSemilla, pasosDelMuelle } from "@/lib/muelle";

// El Muelle. Qué tablas están podridas se decide al iniciar y vive en el
// servidor; el navegador solo se entera del paso que acaba de cruzar.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: {
    accion?: string;
    monto?: number;
    partida_id?: string;
    idempotency_key?: string;
    lado?: number; // 0 izquierda, 1 derecha
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  if (cuerpo.accion === "iniciar") {
    const { monto, idempotency_key } = cuerpo;
    if (
      typeof monto !== "number" ||
      !Number.isFinite(monto) ||
      typeof idempotency_key !== "string" ||
      idempotency_key.length < 8
    ) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }

    const semilla = nuevaSemilla();
    const { data, error } = await admin.rpc("muelle_iniciar", {
      p_usuario: user.id,
      p_monto: monto,
      p_semilla: semilla,
      p_hash: hashDe(semilla),
      p_pasos: pasosDelMuelle(semilla),
      p_mults: multiplicadores(),
      p_idempotency: idempotency_key,
    });
    if (error) {
      console.error("[muelle:iniciar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    if (!r.ok) return NextResponse.json(r, { status: r.motivo === "saldo" ? 409 : 400 });
    return NextResponse.json({ ...r, hash: hashDe(semilla), mults: multiplicadores() });
  }

  // Al volver a una partida abierta: solo los multiplicadores y dónde vas.
  // Nunca qué tablas están podridas.
  if (cuerpo.accion === "estado") {
    const { partida_id } = cuerpo;
    if (typeof partida_id !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data } = await admin
      .from("partidas_muelle")
      .select("mults, posicion, estado, hash")
      .eq("id", partida_id)
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (!data) return NextResponse.json({ ok: false, motivo: "partida_inexistente" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      mults: (data.mults as number[]).map(Number),
      posicion: data.posicion,
      estado: data.estado,
      hash: data.hash,
    });
  }

  if (cuerpo.accion === "saltar") {
    const { partida_id, lado } = cuerpo;
    if (typeof partida_id !== "string" || (lado !== 0 && lado !== 1)) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("muelle_saltar", {
      p_partida: partida_id,
      p_usuario: user.id,
      p_lado: lado,
    });
    if (error) {
      console.error("[muelle:saltar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (cuerpo.accion === "cobrar") {
    const { partida_id } = cuerpo;
    if (typeof partida_id !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("muelle_cobrar", {
      p_partida: partida_id,
      p_usuario: user.id,
    });
    if (error) {
      console.error("[muelle:cobrar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
