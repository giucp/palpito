import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Pata } from "@/lib/combos";

// La imagen del combo para compartir por WhatsApp.
//
// **Se dibuja desde lo guardado, no desde lo que tenga la pantalla.** Por eso
// es exacta: es el mismo combo que está en la base, con los precios de cuando
// se armó. Dos personas que lo compartan el mismo día mandan la misma imagen.
//
// El mensaje que acompaña lleva solo el nombre del combo: todo lo demás ya está
// escrito adentro de la imagen, y repetirlo en el texto es ruido.
//
// Se dibuja con el generador que trae Next, igual que la vieja imagen del
// ticket: sin librerías de captura ni servicios de terceros.
//
// Es información pública —los combos se leen sin sesión—, así que la imagen
// también se pide sin sesión.

const FONDO = "#0b0d10";
const PANEL = "#141821";
const LINEA = "rgba(255,255,255,0.09)";
const INK = "#edf1f3";
const INK2 = "#c3cbd1";
const MIST = "#828c96";
const LIMA = "#b6ff3d";
const SUBE = "#3ddc84";
const BAJA = "#ff5a5a";

const ZONA = "America/Caracas";
const hoyEnCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const combo = url.searchParams.get("combo") ?? "";
  const fecha = url.searchParams.get("fecha") || hoyEnCaracas();
  if (!combo) return NextResponse.json({ error: "falta_combo" }, { status: 400 });

  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("combos_dia")
    .select("nombre, regla, tipo, patas, multiplicador, probabilidad, armado_at, acerto")
    .eq("fecha", fecha)
    .eq("combo", combo)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const patas = (data.patas ?? []) as Pata[];
  const multiplicador = Number(data.multiplicador);
  const probabilidad = Number(data.probabilidad);
  const acerto = data.acerto as boolean | null;

  const armado = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).format(new Date(data.armado_at as string));

  const estado =
    acerto === true
      ? { texto: "Pegó", color: SUBE }
      : acerto === false
        ? { texto: "No pegó", color: BAJA }
        : { texto: "En juego", color: LIMA };

  // El alto se calcula a mano porque el generador necesita un tamaño fijo, y se
  // adapta a lo que trae el combo: los de mercado no llevan motivo y sus patas
  // son un renglón más cortas, y la regla ocupa una o dos líneas según el largo.
  // Con un alto fijo, el bombazo —seis patas— se cortaba o los cortos quedaban
  // con un palmo de negro abajo.
  //
  // Los números salen de medir el resultado real. Se redondea hacia arriba: lo
  // que sobre es aire al pie, y eso es mucho mejor que cortar contenido.
  const ANCHO = 820;
  const lineasRegla = Math.max(1, Math.ceil(String(data.regla).length / 56));
  const altoPatas = patas.reduce((a, p) => a + (p.motivo ? 118 : 96), 0);
  const alto = 175 + lineasRegla * 29 + altoPatas + 178;

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
            <div
              style={{ width: 11, height: 11, borderRadius: 6, background: estado.color, display: "flex" }}
            />
            <div style={{ color: estado.color, fontSize: 22, fontWeight: 600 }}>{estado.texto}</div>
          </div>
        </div>

        {/* Nombre del combo y la regla con la que se armó, que es lo que lo
            separa de un parlay al azar. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ color: INK, fontSize: 36, fontWeight: 700 }}>{data.nombre as string}</div>
            <div
              style={{
                display: "flex",
                color: data.tipo === "abridores" ? LIMA : MIST,
                border: `1px solid ${data.tipo === "abridores" ? LIMA : LINEA}`,
                borderRadius: 999,
                padding: "3px 12px",
                fontSize: 17,
              }}
            >
              {data.tipo as string}
            </div>
          </div>
          <div style={{ color: INK2, fontSize: 21, lineHeight: 1.35 }}>{data.regla as string}</div>
        </div>

        {/* Las patas */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
          {patas.map((p, i) => {
            const c = p.acerto === true ? SUBE : p.acerto === false ? BAJA : MIST;
            const apagada = p.acerto === false;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "16px 0",
                  borderTop: `1px solid ${LINEA}`,
                }}
              >
                <div
                  style={{ width: 15, height: 15, borderRadius: 8, background: c, marginTop: 8, display: "flex" }}
                />
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 3 }}>
                  {/* Un solo hijo de texto a propósito: el generador exige
                      `display: flex` en cuanto un div tiene más de uno, y dos
                      trozos de texto ya cuentan como dos. */}
                  <div style={{ color: MIST, fontSize: 17 }}>
                    {`${p.partido.replace(" vs. ", " · ")}${p.hora ? `  ${p.hora}` : ""}`}
                  </div>
                  <div style={{ color: apagada ? MIST : INK, fontSize: 25, fontWeight: 700 }}>
                    {p.pick}
                  </div>
                  {p.motivo && <div style={{ color: MIST, fontSize: 18 }}>{p.motivo}</div>}
                </div>
                <div
                  style={{ color: apagada ? MIST : INK2, fontSize: 23, fontWeight: 700, paddingTop: 20 }}
                >
                  {pct(p.probabilidad)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Cuánto paga, siempre pegado a lo probable que es. El multiplicador
            solo, sin la probabilidad al lado, miente. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            background: PANEL,
            border: `1px solid ${LINEA}`,
            borderRadius: 18,
            padding: "22px 26px",
            // Con el combo más largo el separador de arriba se come el aire y
            // el pie queda pegado a la última pata. Esto le garantiza el suyo.
            marginTop: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: MIST, fontSize: 18 }}>Paga</div>
            <div style={{ color: LIMA, fontSize: 36, fontWeight: 800 }}>
              {`x${multiplicador.toFixed(2)}`}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 44 }}>
            <div style={{ color: MIST, fontSize: 18 }}>Pega</div>
            <div style={{ color: INK, fontSize: 30, fontWeight: 700 }}>
              {`1 de cada ${Math.round(1 / probabilidad)}`}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ color: MIST, fontSize: 18 }}>{pct(probabilidad)}</div>
            <div style={{ color: MIST, fontSize: 18 }}>{`Polymarket · ${armado}`}</div>
          </div>
        </div>
      </div>
    ),
    { width: ANCHO, height: alto }
  );
}
