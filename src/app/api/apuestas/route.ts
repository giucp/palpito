import { NextResponse, type NextRequest } from "next/server";
import { asegurarEvento } from "@/lib/evento-cartelera";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ligaPorRuta, traerTablero } from "@/lib/tablero";

// El tablero abierto: apuestas publicadas sobre un partido, esperando a que
// alguien se las tome (palpito_guia.md §6.e).
//
// Como todo lo que mueve dinero, acá solo se comprueba la sesión y se valida
// contra ESPN; retener, cobrar y devolver pasa dentro de las funciones atómicas
// de la base (`publicar_apuesta`, `tomar_apuesta`, `cancelar_desafio`).

async function sesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// El día del partido en la zona de la app, que es la que usa la cartelera para
// repartir los partidos por fecha.
const ZONA = "America/Caracas";
const diaDe = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

type EventoFila = {
  id: string;
  liga: string;
  equipo_a: string;
  equipo_b: string;
  comienza_at: string;
  espn_id: string | null;
  espn_ruta: string | null;
};

// ============ El tablero ============
export async function GET() {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("desafios")
    // Una sola cadena, sin concatenar: supabase-js la lee como tipo literal
    // para inferir la forma del resultado.
    .select(
      "id, creador_id, lado_creador, monto, created_at, eventos(id, liga, equipo_a, equipo_b, comienza_at, espn_id, espn_ruta)"
    )
    .eq("estado", "pendiente")
    .is("rival_id", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const ahora = Date.now();
  // El partido viene como objeto (es una clave foránea, no una lista), pero sin
  // los tipos generados de la base supabase-js lo infiere como arreglo. Se
  // normaliza una vez acá y el resto del código trabaja con `evento` a secas.
  const filas = (data ?? []).map((d) => ({
    ...d,
    evento: (Array.isArray(d.eventos) ? d.eventos[0] : d.eventos) as EventoFila | undefined,
  }));

  // Las de un partido que ya empezó no se pueden tomar: siguen ahí solo hasta
  // que la próxima pasada de resultados las caduque y devuelva lo retenido.
  const abiertas = filas.filter(
    (d) => d.evento && new Date(d.evento.comienza_at).getTime() > ahora
  );

  const ids = [...new Set(abiertas.map((d) => d.creador_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("usuario_id, alias")
    .in("usuario_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const alias = new Map((perfiles ?? []).map((p) => [p.usuario_id, p.alias]));

  // La línea del partido, al lado de cada publicación. No cambia la matemática
  // —los dos ponen lo mismo— pero deja ver qué lado te están ofreciendo.
  //
  // Un pedido por liga y día, no uno por apuesta: la cartelera ya la cachea
  // Next medio minuto, así que diez publicaciones del mismo partido cuestan una
  // sola consulta a ESPN.
  const jornadas = new Map<string, { ligaId: string; fecha: Date }>();
  for (const d of abiertas) {
    const e = d.evento!;
    if (!e.espn_ruta || !e.espn_id) continue;
    const liga = ligaPorRuta(e.espn_ruta);
    if (!liga) continue;
    const dia = diaDe(e.comienza_at);
    jornadas.set(`${liga.id}|${dia}`, { ligaId: liga.id, fecha: new Date(`${dia}T12:00:00Z`) });
  }

  const lineas = new Map<string, { local: string | null; visitante: string | null }>();
  await Promise.all(
    [...jornadas.values()].map(async ({ ligaId, fecha }) => {
      try {
        const { partidos } = await traerTablero(ligaId, fecha);
        for (const p of partidos) {
          lineas.set(p.id, { local: p.local.dinero.precio, visitante: p.visitante.dinero.precio });
        }
      } catch {
        // Sin línea se muestra igual: es un adorno informativo, no un requisito.
      }
    })
  );

  const apuestas = abiertas.map((d) => {
    const e = d.evento!;
    return {
      id: d.id,
      monto: Number(d.monto),
      lado: d.lado_creador as "local" | "visitante",
      alias: alias.get(d.creador_id) ?? "?",
      esMia: d.creador_id === user.id,
      creadaAt: d.created_at,
      evento: {
        liga: e.liga,
        equipoA: e.equipo_a,
        equipoB: e.equipo_b,
        comienzaAt: e.comienza_at,
      },
      linea: (e.espn_id && lineas.get(e.espn_id)) || null,
    };
  });

  return NextResponse.json({ ok: true, apuestas });
}

// ============ Publicar, tomar, retirar ============
export async function POST(req: NextRequest) {
  const user = await sesion();
  if (!user) return NextResponse.json({ ok: false, motivo: "sesion" }, { status: 401 });

  let cuerpo: {
    accion?: string;
    liga?: string;
    partido?: string;
    fecha?: string;
    lado?: string;
    monto?: number;
    apuesta?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  if (cuerpo.accion === "publicar") {
    const { liga: ligaId, partido, fecha, lado, monto } = cuerpo;
    if (
      typeof ligaId !== "string" ||
      typeof partido !== "string" ||
      typeof fecha !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      (lado !== "local" && lado !== "visitante") ||
      typeof monto !== "number" ||
      !Number.isFinite(monto)
    ) {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    // El partido tiene que existir en la base para colgarle la apuesta, y se
    // comprueba contra ESPN antes de crearlo.
    const evento = await asegurarEvento(ligaId, partido, fecha);
    if (!evento.ok) {
      return NextResponse.json(evento, { status: evento.motivo === "error_interno" ? 500 : 400 });
    }

    const { data, error } = await admin.rpc("publicar_apuesta", {
      p_creador: user.id,
      p_evento: evento.evento,
      p_lado: lado,
      p_monto: monto,
    });
    if (error) {
      console.error("[apuestas] publicar:", error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 });
  }

  if (cuerpo.accion === "tomar" || cuerpo.accion === "retirar") {
    if (typeof cuerpo.apuesta !== "string") {
      return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
    }
    const fn = cuerpo.accion === "tomar" ? "tomar_apuesta" : "cancelar_desafio";
    const { data, error } = await admin.rpc(fn, {
      p_desafio: cuerpo.apuesta,
      p_usuario: user.id,
    });
    if (error) {
      console.error(`[apuestas] ${cuerpo.accion}:`, error.message);
      return NextResponse.json({ ok: false, motivo: "error_interno" }, { status: 500 });
    }
    const r = data as { ok: boolean; motivo?: string };
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "saldo" ? 409 : 400 });
  }

  return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
}
