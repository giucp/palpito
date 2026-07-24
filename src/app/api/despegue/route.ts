import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hashDe, nuevaSemilla, puntoCrash } from "@/lib/despegue";

// Juego Despegue. Igual que las apuestas: la sesión manda, el dinero se mueve
// solo en funciones de la base y el punto de estrellada nunca viaja al
// navegador antes de tiempo.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: { accion?: string; monto?: number; ronda_id?: string; idempotency_key?: string };
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

    // La semilla se guarda ahora y se revela al terminar: así se puede
    // comprobar que el resultado estaba decidido desde el principio.
    const semilla = nuevaSemilla();
    const { data, error } = await admin.rpc("despegue_iniciar", {
      p_usuario: user.id,
      p_monto: monto,
      p_semilla: semilla,
      p_hash: hashDe(semilla),
      p_crash: puntoCrash(semilla),
      p_idempotency: idempotency_key,
    });
    if (error) {
      console.error("[despegue:iniciar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string; ronda_id?: string };
    if (!r.ok) return NextResponse.json(r, { status: r.motivo === "saldo" ? 409 : 400 });
    // Se devuelve el hash (compromiso), nunca el punto de estrellada.
    return NextResponse.json({ ...r, hash: hashDe(semilla) });
  }

  if (cuerpo.accion === "estado" || cuerpo.accion === "retirar") {
    const { ronda_id } = cuerpo;
    if (typeof ronda_id !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const fn = cuerpo.accion === "retirar" ? "despegue_retirar" : "despegue_estado";
    const { data, error } = await admin.rpc(fn, { p_ronda: ronda_id, p_usuario: user.id });
    if (error) {
      console.error(`[despegue:${cuerpo.accion}]`, error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
