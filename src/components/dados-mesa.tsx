"use client";

import { useState } from "react";
import { ParDados } from "./dado";
import { Volver } from "./volver";
import { fmt } from "@/lib/dinero";
import type { Tirada } from "@/lib/dados";

// La mesa de Dados.
//
// Tirás los tuyos y se quedan a la vista. Los de tu amigo no se ven hasta que
// tira él: eso no lo decide esta pantalla, lo decide el servidor — acá no hay
// nada que esconder porque nunca llegó.
//
// Si empatan, se vuelve a tirar, y las tiradas de desempate aparecen arriba en
// chico para que se entienda de dónde salió el resultado.

type Resultado = "ganaste" | "perdiste" | "empate";

type Props = {
  desafioId: string;
  monto: number;
  comisionBps: number;
  aliasRival: string;
  miTiradaInicial?: Tirada | null;
  suTiradaInicial?: Tirada | null;
  rondasIniciales?: { mia: Tirada; suya: Tirada }[] | null;
  resultadoInicial?: Resultado | null;
  onCambio?: () => void;
};

// Cuánto rueda el dado antes de mostrarse. Lo justo para que se sienta una
// tirada y no una respuesta de servidor: más largo aburre y más corto no se ve.
const RUEDA_MS = 900;

export function DadosMesa({
  desafioId,
  monto,
  comisionBps,
  aliasRival,
  miTiradaInicial = null,
  suTiradaInicial = null,
  rondasIniciales = null,
  resultadoInicial = null,
  onCambio,
}: Props) {
  const [mia, setMia] = useState<Tirada | null>(miTiradaInicial);
  const [suya, setSuya] = useState<Tirada | null>(suTiradaInicial);
  const [rondas, setRondas] = useState(rondasIniciales);
  const [resultado, setResultado] = useState<Resultado | null>(resultadoInicial);
  const [rodando, setRodando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pozo = monto * 2;
  const comision = Math.round(pozo * (comisionBps / 10000) * 100) / 100;

  // Las rondas que empataron antes de la que decidió.
  const empatadas = (rondas ?? []).slice(0, -1);

  async function tirar() {
    if (rodando || mia) return;
    setRodando(true);
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
          ya_jugaste: "Ya tiraste tus dados.",
          no_es_tuyo: "Este desafío no es tuyo.",
          sesion: "Entrá a tu cuenta primero.",
        };
        setError(motivos[r.motivo] ?? "No se pudieron tirar los dados. Probá de nuevo.");
        setRodando(false);
        return;
      }

      // Los dados ruedan un momento antes de mostrar el número.
      setTimeout(() => {
        setRodando(false);
        setMia(r.mia);
        if (r.estado === "resuelto") {
          // Un respiro antes de los del rival: si aparecen los cuatro a la vez
          // no se entiende cuáles son de quién.
          setTimeout(() => {
            setSuya(r.suya);
            setRondas(r.rondas ?? null);
            setResultado(r.resultado);
            onCambio?.();
          }, 700);
        }
      }, RUEDA_MS);
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
      setRodando(false);
    }
  }

  const textoResultado =
    resultado === "ganaste"
      ? { titulo: "Ganaste", detalle: `Te llevás ${fmt(pozo - comision)}` }
      : resultado === "perdiste"
        ? { titulo: "Perdiste", detalle: `Se los lleva @${aliasRival}` }
        : { titulo: "Empataron", detalle: `Vuelve ${fmt(monto - comision / 2)} a cada uno` };

  return (
    <div className="dma">
      {/* Las tiradas que empataron, en chico y arriba: son el camino, no el
          resultado. Solo aparecen cuando la partida ya se resolvió. */}
      {empatadas.length > 0 && (
        <div className="dma-previas">
          {empatadas.map((r, i) => (
            <div key={i} className="dma-previa">
              <span className="dma-previa-n">{i + 1}ª</span>
              <b className="mono">{r.mia.suma}</b>
              <span>iguales</span>
              <b className="mono">{r.suya.suma}</b>
            </div>
          ))}
        </div>
      )}

      <div className="dma-mesa">
        <div className="dma-lado yo">
          <span className="dma-quien">Vos</span>
          <ParDados
            tirada={mia}
            rodando={rodando}
            destacado={resultado === "ganaste" ? "gana" : resultado === "perdiste" ? "pierde" : null}
          />
        </div>

        <span className="dma-vs">VS</span>

        <div className="dma-lado">
          <span className="dma-quien">@{aliasRival}</span>
          <ParDados
            tirada={suya}
            destacado={resultado === "perdiste" ? "gana" : resultado === "ganaste" ? "pierde" : null}
          />
        </div>
      </div>

      {error && <p className="dma-pista dma-fallo">{error}</p>}

      {!mia ? (
        <>
          <button className="dma-tirar" onClick={tirar} disabled={rodando}>
            {rodando ? "Rodando…" : "Tirar mis dados"}
          </button>
          <p className="dma-pista">
            Tus dados ya están decididos. Los de @{aliasRival} no se ven hasta que tiren los dos.
          </p>
        </>
      ) : resultado ? (
        <div className={`dma-resultado ${resultado}`}>
          <b>{textoResultado.titulo}</b>
          <span>{textoResultado.detalle}</span>
          <Volver texto="Volver a Pálpito" />
        </div>
      ) : (
        <p className="dma-pista">
          Listo. Falta que @{aliasRival} tire los suyos y se ven los cuatro.
        </p>
      )}

      {/* Lo que pediste explicado, corto: cómo funciona el desempate. */}
      <p className="dma-reglas">
        <b>Si empatan, se vuelve a tirar.</b> Las tiradas de desempate no se sortean en el momento:
        ya estaban decididas desde que se creó el reto, igual que la primera. Por eso da lo mismo
        quién tire antes y cuánto tarde el otro.
      </p>
    </div>
  );
}
