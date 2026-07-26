import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cartaDe, hashDe, nuevaSemilla, repartir } from "@/lib/carta";

// Juegos entre amigos. Todo el dinero se mueve en funciones atómicas de la base;
// acá se comprueba la sesión, se arma la jugada desde la semilla y —lo más
// importante— **se decide qué se le deja ver a cada uno**.
//
// La regla que sostiene el juego: nadie ve la carta del otro hasta haber sacado
// la suya. Se cumple acá y en la base, no en la pantalla: aunque alguien
// manipule la app, esta ruta no le va a mandar lo que no le toca.

const MINUTOS_DE_VIDA = 60; // el enlace vive una hora

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

  let cuerpo: { accion?: string; rival?: string; monto?: number; desafio?: string; tipo?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  // ---- Crear ----
  if (cuerpo.accion === "crear") {
    const { rival, monto, tipo } = cuerpo;
    if (
      typeof rival !== "string" ||
      typeof monto !== "number" ||
      !Number.isFinite(monto) ||
      tipo !== "carta"
    ) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }

    // La semilla se decide acá y no se le muestra a nadie hasta el final; su
    // hash sí, para que después se pueda comprobar que no se cambió.
    const semilla = nuevaSemilla();
    const { data, error } = await admin.rpc("crear_desafio_juego", {
      p_creador: user.id,
      p_rival: rival,
      p_tipo: tipo,
      p_monto: monto,
      p_semilla: semilla,
      p_hash: hashDe(semilla),
      p_minutos: MINUTOS_DE_VIDA,
    });
    if (error) {
      console.error("[juego:crear]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(
      { ...r, hash: hashDe(semilla) },
      { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 }
    );
  }

  // ---- Aceptar ----
  if (cuerpo.accion === "aceptar") {
    if (typeof cuerpo.desafio !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("aceptar_desafio_juego", {
      p_desafio: cuerpo.desafio,
      p_usuario: user.id,
    });
    if (error) {
      console.error("[juego:aceptar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 });
  }

  // ---- Sacar la carta ----
  if (cuerpo.accion === "jugar") {
    if (typeof cuerpo.desafio !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }

    const { data: d } = await admin
      .from("desafios")
      .select("id, creador_id, rival_id, tipo, semilla, estado")
      .eq("id", cuerpo.desafio)
      .maybeSingle();
    if (!d || d.tipo !== "carta") {
      return NextResponse.json({ ok: false, motivo: "no_existe" }, { status: 404 });
    }
    const soyCreador = d.creador_id === user.id;
    if (!soyCreador && d.rival_id !== user.id) {
      return NextResponse.json({ ok: false, motivo: "no_es_tuyo" }, { status: 403 });
    }

    // La carta sale de la semilla, no del navegador: ya estaba decidida.
    const cartas = repartir(d.semilla as string);
    const mia = soyCreador ? cartas.creador : cartas.rival;

    const { data, error } = await admin.rpc("jugar_desafio", {
      p_desafio: d.id,
      p_usuario: user.id,
      p_jugada: { indice: mia.indice, valor: mia.valor },
    });
    if (error) {
      console.error("[juego:jugar]", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }

    const r = data as {
      ok: boolean;
      estado?: string;
      gana?: string;
      jugada_creador?: { indice: number };
      jugada_rival?: { indice: number };
      semilla?: string;
    };
    if (!r.ok) return NextResponse.json(r, { status: 400 });

    // Todavía falta el otro: se devuelve la carta propia y nada más.
    if (r.estado === "esperando") {
      return NextResponse.json({ ok: true, estado: "esperando", mia });
    }

    // Jugaron los dos: recién ahora se revela todo.
    const suya = soyCreador
      ? cartaDe(r.jugada_rival!.indice)
      : cartaDe(r.jugada_creador!.indice);
    const gane = r.gana === (soyCreador ? "creador" : "rival");
    return NextResponse.json({
      ok: true,
      estado: "resuelto",
      mia,
      suya,
      resultado: r.gana === "empate" ? "empate" : gane ? "ganaste" : "perdiste",
      semilla: r.semilla,
    });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
