import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ZONA } from "@/lib/eventos";
import { esFormato, formatearCuota, FORMATO_POR_DEFECTO } from "@/lib/cuota";

// La imagen del ticket para compartir por WhatsApp.
//
// Se dibuja en el servidor con el generador que ya trae Next, igual que la
// tarjeta del desafío: sin librerías de captura ni servicios de terceros. El
// navegador la pide, la recibe como archivo y la adjunta al mensaje con la API
// de compartir del teléfono.
//
// Solo se puede pedir el ticket propio: la sesión y el dueño se comprueban acá.

const FONDO = "#0b0d10";
const PANEL = "#141821";
const LINEA = "rgba(255,255,255,0.09)";
const INK = "#edf1f3";
const INK2 = "#c3cbd1";
const MIST = "#828c96";
const LIMA = "#b6ff3d";
const SUBE = "#3ddc84";
const BAJA = "#ff5a5a";

const ETIQUETA: Record<string, string> = {
  abierta: "En juego",
  ganada: "Ganada",
  perdida: "Perdida",
  anulada: "Anulada",
};

const SELECT =
  "id, tipo, monto, cuota_total, ganancia_posible, estado, created_at, usuario_id, apuesta_lineas(id, cuota, estado, selecciones(nombre, mercados(nombre, eventos(equipo_a, equipo_b, liga, comienza_at, estado, marcador_a, marcador_b))))";

const dinero = (n: number) => "$" + n.toFixed(2);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // El formato de cuota es una preferencia del navegador, así que el cliente lo
  // manda. Si la pantalla dice +310 y la imagen que compartís dice 4.10, parecen
  // dos apuestas distintas.
  const pedido = new URL(req.url).searchParams.get("formato");
  const formato = esFormato(pedido) ? pedido : FORMATO_POR_DEFECTO;

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sesion" }, { status: 401 });

  const admin = crearClienteAdmin();
  const { data } = await admin.from("apuestas").select(SELECT).eq("id", id).maybeSingle();
  if (!data || data.usuario_id !== user.id) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  }

  const monto = Number(data.monto);
  const cuotaTotal = Number(data.cuota_total);
  const gananciaPosible = Number(data.ganancia_posible);
  const estado = data.estado as string;

  const lineas = (data.apuesta_lineas ?? []).map((l) => {
    const sel = l.selecciones as unknown as {
      nombre: string;
      mercados: {
        nombre: string;
        eventos: {
          equipo_a: string;
          equipo_b: string;
          liga: string;
          estado: string;
          marcador_a: number | null;
          marcador_b: number | null;
        };
      };
    } | null;
    const ev = sel?.mercados?.eventos;
    const pick =
      sel?.nombre === "Local"
        ? (ev?.equipo_a ?? "Local")
        : sel?.nombre === "Visitante"
          ? (ev?.equipo_b ?? "Visitante")
          : (sel?.nombre ?? "—");
    return {
      id: l.id,
      cuota: Number(l.cuota),
      estado: (l.estado as string) ?? "abierta",
      liga: ev?.liga ?? "",
      partido: `${ev?.equipo_a ?? ""} vs ${ev?.equipo_b ?? ""}`,
      apuesta: `${sel?.mercados?.nombre ?? ""} · ${pick}`,
      marcador:
        ev?.estado === "finalizado" && ev.marcador_a !== null && ev.marcador_b !== null
          ? `Final ${ev.marcador_a} — ${ev.marcador_b}`
          : "",
    };
  });

  // Mismo criterio que en pantalla: el número siempre es plata que se movió.
  const desenlace =
    estado === "ganada"
      ? { etiqueta: "Cobraste", monto: dinero(gananciaPosible), color: SUBE }
      : estado === "perdida"
        ? { etiqueta: "Perdiste", monto: `−${dinero(monto)}`, color: BAJA }
        : estado === "anulada"
          ? { etiqueta: "Devuelto", monto: dinero(monto), color: INK }
          : { etiqueta: "A cobrar", monto: dinero(gananciaPosible), color: INK };

  const colorEstado =
    estado === "ganada" ? SUBE : estado === "perdida" ? BAJA : estado === "abierta" ? LIMA : MIST;

  const titulo =
    data.tipo === "combinada"
      ? `Combinada · ${lineas.length} selecciones`
      : "Apuesta simple";
  const fecha = new Date(data.created_at).toLocaleString("es", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
  const cuotaTexto = formatearCuota(cuotaTotal, formato);

  // El alto se calcula a mano porque el generador necesita un tamaño fijo. Los
  // números salen de medir el resultado real; se deja un poco de holgura porque
  // un nombre de equipo largo puede pasar a dos renglones, y que sobre aire es
  // mucho mejor que cortar contenido.
  const ANCHO = 820;
  const alto = 200 + lineas.length * 130 + 175;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FONDO,
          padding: 40,
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: LIMA, display: "flex" }} />
          <div style={{ color: INK, fontSize: 27, fontWeight: 700 }}>Pálpito</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 11, height: 11, borderRadius: 6, background: colorEstado, display: "flex" }} />
            <div style={{ color: colorEstado, fontSize: 22, fontWeight: 600 }}>
              {ETIQUETA[estado] ?? estado}
            </div>
          </div>
        </div>

        {/* Encabezado del ticket */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 30 }}>
          <div style={{ color: INK, fontSize: 32, fontWeight: 700 }}>{titulo}</div>
          <div style={{ color: MIST, fontSize: 20 }}>{fecha}</div>
        </div>

        {/* Selecciones */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
          {lineas.map((l) => {
            const c = l.estado === "ganada" ? SUBE : l.estado === "perdida" ? BAJA : MIST;
            const apagada = l.estado === "perdida";
            return (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "18px 0",
                  borderTop: `1px solid ${LINEA}`,
                }}
              >
                <div
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 8,
                    background: c,
                    marginTop: 8,
                    display: "flex",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 3 }}>
                  <div style={{ color: MIST, fontSize: 17 }}>{l.liga}</div>
                  <div
                    style={{ color: apagada ? MIST : INK, fontSize: 26, fontWeight: 700 }}
                  >
                    {l.partido}
                  </div>
                  <div style={{ color: apagada ? MIST : INK2, fontSize: 20 }}>{l.apuesta}</div>
                  {l.marcador !== "" && (
                    <div style={{ color: MIST, fontSize: 18 }}>{l.marcador}</div>
                  )}
                </div>
                <div
                  style={{
                    color: apagada ? MIST : INK,
                    fontSize: 25,
                    fontWeight: 700,
                    paddingTop: 22,
                  }}
                >
                  {formatearCuota(l.cuota, formato)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Cierre */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 20,
            background: PANEL,
            border: `1px solid ${LINEA}`,
            borderRadius: 18,
            padding: "22px 26px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: MIST, fontSize: 18 }}>Apostado</div>
            <div style={{ color: INK, fontSize: 30, fontWeight: 700 }}>{dinero(monto)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 40 }}>
            <div style={{ color: MIST, fontSize: 18 }}>Cuota</div>
            <div style={{ color: INK, fontSize: 30, fontWeight: 700 }}>{cuotaTexto}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ color: MIST, fontSize: 18 }}>{desenlace.etiqueta}</div>
            <div style={{ color: desenlace.color, fontSize: 36, fontWeight: 800 }}>
              {desenlace.monto}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: ANCHO, height: alto }
  );
}
