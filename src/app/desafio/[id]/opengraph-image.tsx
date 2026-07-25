import { ImageResponse } from "next/og";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { ZONA } from "@/lib/eventos";

// La tarjeta que WhatsApp muestra al pegar el enlace del desafío.
//
// Se genera acá, en el servidor, con el generador de imágenes que ya trae Next:
// nada de librerías ni servicios de terceros. Es la primera impresión que se
// lleva quien recibe el desafío, así que lleva la identidad de Pálpito: fondo
// oscuro, acento lima y los números en mono.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Desafío en Pálpito";

const LIMA = "#b6ff3d";
const FONDO = "#08090b";
const PANEL = "#101319";
const LINEA = "rgba(255,255,255,0.10)";
const INK = "#edf1f3";
const MIST = "#828c96";

export default async function Imagen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = crearClienteAdmin();

  const { data: d } = await admin
    .from("desafios")
    .select(
      "monto, lado_creador, estado, creador_id, rival_id, eventos(liga, equipo_a, equipo_b, comienza_at)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!d) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: FONDO,
            color: INK,
            fontSize: 56,
          }}
        >
          Pálpito
        </div>
      ),
      size
    );
  }

  const ev = d.eventos as unknown as {
    liga: string;
    equipo_a: string;
    equipo_b: string;
    comienza_at: string;
  };

  const { data: perfiles } = await admin
    .from("perfiles")
    .select("usuario_id, alias")
    .in("usuario_id", [d.creador_id, d.rival_id]);
  const alias = new Map((perfiles ?? []).map((p) => [p.usuario_id, p.alias]));
  const retador = alias.get(d.creador_id) ?? "alguien";
  const rival = alias.get(d.rival_id) ?? "vos";

  const elegido = d.lado_creador === "local" ? ev.equipo_a : ev.equipo_b;
  const elOtro = d.lado_creador === "local" ? ev.equipo_b : ev.equipo_a;

  // Satori exige `display` explícito en todo div con más de un hijo, y al
  // interpolar dos variables en una línea de texto quedan varios nodos. Se
  // arman las cadenas acá para que cada div tenga un único hijo de texto.
  const titular = `@${retador} desafía a @${rival}`;
  const partido = `${ev.equipo_a} vs ${ev.equipo_b}`;
  const vaCon = `@${retador} va con`;

  const cuando = new Date(ev.comienza_at).toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FONDO,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: LIMA,
              display: "flex",
            }}
          />
          <div style={{ color: INK, fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            Pálpito
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ color: MIST, fontSize: 24 }}>{ev.liga}</div>
        </div>

        {/* Titular */}
        <div style={{ display: "flex", marginTop: 46 }}>
          <div style={{ color: MIST, fontSize: 30 }}>{titular}</div>
        </div>

        {/* El partido */}
        <div style={{ display: "flex", marginTop: 14 }}>
          <div style={{ color: INK, fontSize: 62, fontWeight: 800, letterSpacing: -1.5 }}>
            {partido}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 10 }}>
          <div style={{ color: MIST, fontSize: 26 }}>{cuando}</div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Los dos lados y el monto */}
        <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              background: PANEL,
              border: `2px solid ${LIMA}`,
              borderRadius: 20,
              padding: "22px 26px",
            }}
          >
            <div style={{ color: LIMA, fontSize: 22, fontWeight: 600 }}>{vaCon}</div>
            <div style={{ color: INK, fontSize: 38, fontWeight: 700, marginTop: 6 }}>
              {elegido}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              background: PANEL,
              border: `2px solid ${LINEA}`,
              borderRadius: 20,
              padding: "22px 26px",
            }}
          >
            <div style={{ color: MIST, fontSize: 22, fontWeight: 600 }}>Te toca</div>
            <div style={{ color: INK, fontSize: 38, fontWeight: 700, marginTop: 6 }}>{elOtro}</div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              background: LIMA,
              borderRadius: 20,
              padding: "22px 34px",
            }}
          >
            <div style={{ color: "rgba(8,9,11,0.65)", fontSize: 20, fontWeight: 600 }}>
              Cada uno pone
            </div>
            <div style={{ color: FONDO, fontSize: 46, fontWeight: 800, marginTop: 2 }}>
              {Number(d.monto).toFixed(0)}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
