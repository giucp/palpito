import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cartaDe, repartir } from "@/lib/carta";
import { jugarDados } from "@/lib/dados";
import { hashDe, nuevaSemilla } from "@/lib/azar";

// Los juegos que existen. Agregar uno es agregarlo acá y darle su rama en
// "jugar"; el resto del flujo —crear, aceptar, vencer, pagar— es el mismo para
// todos y no hay que tocarlo.
const JUEGOS = ["carta", "dados"] as const;
type Juego = (typeof JUEGOS)[number];
const esJuego = (t: unknown): t is Juego => JUEGOS.includes(t as Juego);

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
      !esJuego(tipo)
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

  // ---- Jugar: sacar la carta o tirar los dados ----
  if (cuerpo.accion === "jugar") {
    if (typeof cuerpo.desafio !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }

    const { data: d } = await admin
      .from("desafios")
      .select("id, creador_id, rival_id, tipo, semilla, estado")
      .eq("id", cuerpo.desafio)
      .maybeSingle();
    if (!d || !esJuego(d.tipo)) {
      return NextResponse.json({ ok: false, motivo: "no_existe" }, { status: 404 });
    }
    const soyCreador = d.creador_id === user.id;
    if (!soyCreador && d.rival_id !== user.id) {
      return NextResponse.json({ ok: false, motivo: "no_es_tuyo" }, { status: 403 });
    }

    const semilla = d.semilla as string;
    const quien = soyCreador ? "creador" : "rival";

    // La jugada sale de la semilla, no del navegador: ya estaba decidida.
    //
    // En dados, la partida entera —incluidos los desempates— también, así que
    // acá no se sortea nada: solo se lee la ronda que terminó decidiendo.
    const partida = d.tipo === "dados" ? jugarDados(semilla) : null;
    const decisiva = partida ? partida.rondas[partida.rondas.length - 1] : null;
    const cartas = d.tipo === "carta" ? repartir(semilla) : null;

    const mia = cartas ? cartas[quien] : decisiva![quien];
    const jugada = cartas
      ? { indice: cartas[quien].indice, valor: cartas[quien].valor }
      : { dados: decisiva![quien].dados, suma: decisiva![quien].suma };

    const { data, error } = await admin.rpc("jugar_desafio", {
      p_desafio: d.id,
      p_usuario: user.id,
      p_jugada: jugada,
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

    // Todavía falta el otro: se devuelve lo propio y nada más. Ojo con las
    // rondas de desempate: tampoco se mandan todavía, porque dejarían ver qué
    // sacó el otro en ellas.
    if (r.estado === "esperando") {
      return NextResponse.json({ ok: true, estado: "esperando", mia });
    }

    // Jugaron los dos: recién ahora se revela todo.
    const otro = soyCreador ? "rival" : "creador";
    const suya = cartas
      ? cartaDe((soyCreador ? r.jugada_rival! : r.jugada_creador!).indice)
      : decisiva![otro];
    const gane = r.gana === (soyCreador ? "creador" : "rival");

    return NextResponse.json({
      ok: true,
      estado: "resuelto",
      mia,
      suya,
      // El camino completo, para poder mostrar los empates que hubo antes.
      rondas: partida?.rondas.map((x) => ({ mia: x[quien], suya: x[otro] })),
      resultado: r.gana === "empate" ? "empate" : gane ? "ganaste" : "perdiste",
      semilla: r.semilla,
    });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
