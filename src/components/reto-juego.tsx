"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "./iconos";
import { CartaVista } from "./carta";
import { ParDados } from "./dado";
import { fmt } from "@/lib/dinero";

// Crear un reto contra un amigo: elegís a quién, ponés el monto y se lo mandás.
// El enlace vive una hora.
//
// Al crearlo se te retienen las fichas, pero **tu jugada no se ve todavía**:
// recién cuando tu amigo acepta. Es la única protección contra la trampa
// evidente — si vieras tu carta (o tus dados) antes de mandar el enlace, no
// mandarías las malas, dejarías vencer el reto y repetirías hasta que saliera
// buena.
//
// Esto era `reto-carta.tsx` y valía solo para un juego. Ahora el flujo es el
// mismo para todos y lo único que cambia es el texto y el dibujo de arriba:
// agregar un juego no obliga a copiar estas 250 líneas.

const RAPIDOS = [10, 25, 50, 100];

type Amigo = { id: string; alias: string };

export type JuegoDef = {
  id: string;
  nombre: string;
  resumen: string;
  tag: string;
  // Cómo se gana, en una línea. Va debajo de "¿A quién retás?".
  comoSeGana: string;
  // El reto tal como llega por WhatsApp.
  invitacion: string;
  // Qué va a tener que hacer cuando acepte.
  queHacer: string;
};

type Props = {
  juego: JuegoDef;
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

type Paso = "amigo" | "monto" | "listo";

/** El dibujo de arriba: dos jugadas tapadas, del juego que sea. */
function Anticipo({ juego, alias }: { juego: string; alias: string }) {
  const lados = (contenido: React.ReactNode) => (
    <div className="cma-mesa" style={{ marginBottom: 4 }}>
      <div className="cma-lado yo">
        <span className="cma-quien">Vos</span>
        {contenido}
      </div>
      <span className="cma-vs">VS</span>
      <div className="cma-lado">
        <span className="cma-quien">@{alias}</span>
        {contenido}
      </div>
    </div>
  );
  return juego === "dados"
    ? lados(<ParDados tirada={null} />)
    : lados(<CartaVista carta={null} volteada={false} />);
}

export function RetoJuego({ juego, usuario, saldo, onAviso, onEntrar }: Props) {
  const router = useRouter();
  const [amigos, setAmigos] = useState<Amigo[] | null>(null);
  const [paso, setPaso] = useState<Paso>("amigo");
  const [amigo, setAmigo] = useState<Amigo | null>(null);
  const [montoTexto, setMontoTexto] = useState("25");
  const [enviando, setEnviando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  const monto = Number(montoTexto.replace(",", ".")) || 0;

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/amigos").then((x) => x.json());
      return (r.ok ? r.amigos : []) as Amigo[];
    } catch {
      return [] as Amigo[];
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      const a = await cargar();
      if (vivo) setAmigos(a);
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, cargar]);

  async function crear() {
    if (!amigo) return;
    if (monto < 1) return onAviso("Poné un monto");
    if (saldo !== null && monto > saldo) return onAviso("No te alcanzan las fichas");

    setEnviando(true);
    try {
      const r = await fetch("/api/juego", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "crear", tipo: juego.id, rival: amigo.id, monto }),
      }).then((x) => x.json());

      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas",
          no_son_amigos: "Primero tienen que ser amigos",
        };
        onAviso(motivos[r.motivo] ?? "No se pudo crear el reto");
        return;
      }
      setEnlace(`${window.location.origin}/desafio/${r.desafio}`);
      setPaso("listo");
      // El saldo de la cabecera lo pinta el servidor: sin esto seguía mostrando
      // las fichas que ya se retuvieron.
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  function compartir() {
    if (!enlace || !amigo) return;
    const texto =
      `${juego.invitacion}\n` +
      `Ponemos ${monto} fichas cada uno.\n` +
      `Tenés una hora para aceptar.\n\n${enlace}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>Entrá para jugar</b>
        <p>Creá tu cuenta y te regalamos 1000 fichas de prueba.</p>
        <button className="bapostar" style={{ maxWidth: 240, margin: "16px auto 0" }} onClick={onEntrar}>
          Entrar
        </button>
      </div>
    );
  }

  if (paso === "listo") {
    return (
      <div className="am-flujo">
        <div className="am-listo">
          <Anticipo juego={juego.id} alias={amigo?.alias ?? "?"} />

          <h3 className="am-titulo">Reto listo</h3>
          <p className="am-sub">
            Se te retuvieron {fmt(monto)}. Mandáselo a @{amigo?.alias}: tiene una hora para
            aceptar, y si no acepta se te devuelven enteras.
            <br />
            {juego.queHacer}
          </p>

          <button className="bapostar am-wa" onClick={compartir}>
            Enviar por WhatsApp
          </button>
          <button
            className="am-copiar"
            onClick={() => {
              if (enlace) navigator.clipboard?.writeText(enlace);
              onAviso("Enlace copiado");
            }}
          >
            Copiar enlace
          </button>
          <button
            className="am-copiar"
            onClick={() => {
              setPaso("amigo");
              setAmigo(null);
              setEnlace(null);
            }}
          >
            Retar a otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="am-flujo">
      {paso === "monto" && (
        <button className="am-volver" onClick={() => setPaso("amigo")}>
          <Icono id="i-back" />
          Volver
        </button>
      )}

      {paso === "amigo" && (
        <>
          <h3 className="am-titulo">¿A quién retás?</h3>
          <p className="am-sub">{juego.comoSeGana}</p>
          {amigos === null ? (
            <p className="am-vacio">Cargando…</p>
          ) : amigos.length === 0 ? (
            <p className="am-vacio">
              Todavía no tenés amigos en Pálpito. Agregá uno desde Cuenta → Amigos.
            </p>
          ) : (
            <div className="am-lista">
              {amigos.map((a) => (
                <button
                  key={a.id}
                  className="am-item"
                  onClick={() => {
                    setAmigo(a);
                    setPaso("monto");
                  }}
                >
                  <span className="am-avatar">{a.alias.slice(0, 2).toUpperCase()}</span>
                  <b>@{a.alias}</b>
                  <Icono id="i-arr" className="ir" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {paso === "monto" && amigo && (
        <>
          <h3 className="am-titulo">¿Cuánto ponen?</h3>
          <p className="am-sub">Los dos ponen lo mismo. El ganador se lleva el pozo.</p>
          <div className="am-monto">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
            />
          </div>
          <div className="am-rapidos">
            {RAPIDOS.map((n) => (
              <button
                key={n}
                className={montoTexto === String(n) ? "on" : ""}
                onClick={() => setMontoTexto(String(n))}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="am-resumen">
            <div className="fila">
              <span>Vos y @{amigo.alias}</span>
              <b>{fmt(monto)} cada uno</b>
            </div>
            <div className="fila total">
              <span>El ganador se lleva</span>
              <b className="mono">{fmt(monto * 2 * 0.995)}</b>
            </div>
          </div>
          <button className="bapostar" disabled={enviando} onClick={crear}>
            {enviando ? "Creando…" : `Retar y poner ${fmt(monto)}`}
          </button>
        </>
      )}
    </div>
  );
}
