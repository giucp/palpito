"use client";

import { useState } from "react";
import { CartaVista } from "./carta";
import { fmt } from "@/lib/cupon";
import type { Carta } from "@/lib/carta";

// La mesa de Carta más alta.
//
// Dos cartas boca abajo. Sacás la tuya y se da vuelta. Si tu amigo todavía no
// sacó la suya, la de él sigue boca abajo: **no se ve hasta que los dos
// jugaron**. Eso no es una decisión de esta pantalla, es lo que devuelve el
// servidor — acá no hay nada que esconder porque nunca llegó.

type Resultado = "ganaste" | "perdiste" | "empate";

type Props = {
  desafioId: string;
  monto: number;
  comisionBps: number;
  aliasRival: string;
  // Lo ya jugado, si se vuelve a entrar a una partida a medio resolver.
  miCartaInicial?: Carta | null;
  suCartaInicial?: Carta | null;
  resultadoInicial?: Resultado | null;
  onCambio?: () => void;
};

export function CartaMesa({
  desafioId,
  monto,
  comisionBps,
  aliasRival,
  miCartaInicial = null,
  suCartaInicial = null,
  resultadoInicial = null,
  onCambio,
}: Props) {
  const [mia, setMia] = useState<Carta | null>(miCartaInicial);
  const [suya, setSuya] = useState<Carta | null>(suCartaInicial);
  const [resultado, setResultado] = useState<Resultado | null>(resultadoInicial);
  const [sacando, setSacando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pozo = monto * 2;
  const comision = Math.round(pozo * (comisionBps / 10000) * 100) / 100;

  async function sacar() {
    if (sacando || mia) return;
    setSacando(true);
    setError(null);
    try {
      const r = await fetch("/api/juego", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "jugar", desafio: desafioId }),
      }).then((x) => x.json());

      if (!r.ok) {
        const motivos: Record<string, string> = {
          no_jugable: "Este desafío ya no se puede jugar.",
          ya_jugaste: "Ya sacaste tu carta.",
          no_es_tuyo: "Este desafío no es tuyo.",
          sesion: "Entrá a tu cuenta primero.",
        };
        setError(motivos[r.motivo] ?? "No se pudo sacar la carta. Probá de nuevo.");
        return;
      }

      setMia(r.mia);
      if (r.estado === "resuelto") {
        // Un respiro antes de dar vuelta la del rival: si se voltean las dos a
        // la vez no se entiende cuál es cuál.
        setTimeout(() => {
          setSuya(r.suya);
          setResultado(r.resultado);
          onCambio?.();
        }, 700);
      }
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
    } finally {
      setSacando(false);
    }
  }

  const textoResultado =
    resultado === "ganaste"
      ? { titulo: "Ganaste", detalle: `Te llevás ${fmt(pozo - comision)}` }
      : resultado === "perdiste"
        ? { titulo: "Perdiste", detalle: `Se los lleva @${aliasRival}` }
        : { titulo: "Empataron", detalle: `Vuelve ${fmt(monto - comision / 2)} a cada uno` };

  return (
    <div className="cma">
      <div className="cma-mesa">
        <div className="cma-lado yo">
          <span className="cma-quien">Vos</span>
          <CartaVista
            carta={mia}
            volteada={mia !== null}
            destacada={
              resultado === "ganaste" ? "gana" : resultado === "perdiste" ? "pierde" : null
            }
          />
        </div>

        <span className="cma-vs">VS</span>

        <div className="cma-lado">
          <span className="cma-quien">@{aliasRival}</span>
          <CartaVista
            carta={suya}
            volteada={suya !== null}
            destacada={
              resultado === "perdiste" ? "gana" : resultado === "ganaste" ? "pierde" : null
            }
          />
        </div>
      </div>

      {error && <p className="cma-pista cma-fallo">{error}</p>}

      {!mia ? (
        <>
          <button className="cma-sacar" onClick={sacar} disabled={sacando}>
            {sacando ? "Sacando…" : "Sacar mi carta"}
          </button>
          <p className="cma-pista">
            Tu carta ya está decidida. La de @{aliasRival} no se ve hasta que saquen los dos.
          </p>
        </>
      ) : resultado ? (
        <div className={`cma-resultado ${resultado}`}>
          <b>{textoResultado.titulo}</b>
          <span>{textoResultado.detalle}</span>
        </div>
      ) : (
        <p className="cma-pista">
          Listo. Falta que @{aliasRival} saque la suya y se revelan las dos.
        </p>
      )}
    </div>
  );
}
