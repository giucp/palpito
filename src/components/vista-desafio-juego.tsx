"use client";

import { useState } from "react";
import Link from "next/link";
import { Icono } from "./iconos";
import { Volver } from "./volver";
import { CartaMesa } from "./carta-mesa";
import { fmt } from "@/lib/cupon";
import { cartaDe } from "@/lib/carta";

// La pantalla de un desafío de juego: la que abre tu amigo desde WhatsApp y la
// que ves vos al volver a jugar la tuya.

type Props = {
  desafio: {
    id: string;
    tipo: string;
    monto: number;
    comisionBps: number;
    estado: string;
    expiraAt: string | null;
    aliasCreador: string;
    aliasRival: string;
  };
  soyRival: boolean;
  soyCreador: boolean;
  entrado: boolean;
  miIndice: number | null;
  suIndice: number | null;
  gano: "ganaste" | "perdiste" | "empate" | null;
};

// Cuánto le queda de vida al enlace. Se calcula al pintar y no con un reloj que
// corra: un minuto arriba o abajo no cambia nada y un temporizador metería una
// animación permanente a cambio de nada.
function tiempoRestante(expiraAt: string | null): string | null {
  if (!expiraAt) return null;
  const min = Math.floor((new Date(expiraAt).getTime() - Date.now()) / 60_000);
  if (min <= 0) return null;
  if (min < 60) return `${min} min`;
  return "1 hora";
}

export function VistaDesafioJuego({
  desafio: d,
  soyRival,
  soyCreador,
  entrado,
  miIndice,
  suIndice,
  gano,
}: Props) {
  const [estado, setEstado] = useState(d.estado);
  const [aceptando, setAceptando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pozo = d.monto * 2;
  const comision = Math.round(pozo * (d.comisionBps / 10000) * 100) / 100;
  const queda = tiempoRestante(d.expiraAt);
  const rival = soyCreador ? d.aliasRival : d.aliasCreador;

  async function aceptar() {
    setAceptando(true);
    setError(null);
    try {
      const r = await fetch("/api/juego", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "aceptar", desafio: d.id }),
      }).then((x) => x.json());
      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas para aceptar.",
          vencido: "Este desafío venció: los desafíos duran una hora.",
          ya_resuelto: "Este desafío ya se había resuelto.",
          no_es_tuyo: "Este desafío no es para vos.",
          sesion: "Entrá a tu cuenta primero.",
        };
        setError(motivos[r.motivo] ?? "No se pudo aceptar. Probá de nuevo.");
        return;
      }
      setEstado("aceptado");
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
    } finally {
      setAceptando(false);
    }
  }

  const jugable = estado === "aceptado" || gano !== null;

  return (
    <main className="desafio-pagina">
      <div className="dsf-barra">
        <Volver />
        <Link className="dsf-marca" href="/">
          <span className="dsf-punto" />
          Pálpito
        </Link>
      </div>

      <div className="dsf-card">
        <div className="dsf-liga">Carta más alta</div>
        <h1 className="dsf-partido">
          @{d.aliasCreador} <span>vs</span> @{d.aliasRival}
        </h1>

        {/* La mesa solo aparece cuando hay algo que jugar o que mirar */}
        {jugable && (soyCreador || soyRival) && (
          <CartaMesa
            desafioId={d.id}
            monto={d.monto}
            comisionBps={d.comisionBps}
            aliasRival={rival}
            miCartaInicial={miIndice !== null ? cartaDe(miIndice) : null}
            suCartaInicial={suIndice !== null ? cartaDe(suIndice) : null}
            resultadoInicial={gano}
          />
        )}

        <div className="dsf-pozo">
          <div className="dsf-fila">
            <span>Cada uno pone</span>
            <b className="mono">{fmt(d.monto)}</b>
          </div>
          <div className="dsf-fila menor">
            <span>Comisión de Pálpito ({(d.comisionBps / 100).toFixed(1)}%)</span>
            <b className="mono">−{fmt(comision)}</b>
          </div>
          <div className="dsf-fila total">
            <span>El ganador se lleva</span>
            <b className="mono">{fmt(pozo - comision)}</b>
          </div>
        </div>

        <p className="dsf-empate">
          Si sale la misma figura, cada uno recupera lo suyo menos la mitad de la comisión.
        </p>

        {error && <div className="dsf-error">{error}</div>}

        {/* ---- Qué puede hacer cada uno ---- */}
        {estado === "pendiente" && !entrado && (
          <>
            <p className="dsf-nota">
              Entrá a tu cuenta de Pálpito para responder. Si todavía no tenés, te regalamos 1000
              fichas de prueba.
            </p>
            <Link className="bapostar" href="/">
              Entrar a Pálpito
            </Link>
          </>
        )}

        {estado === "pendiente" && soyRival && (
          <div className="dsf-acciones">
            <button className="bapostar" disabled={aceptando} onClick={aceptar}>
              {aceptando ? "Aceptando…" : `Aceptar y poner ${fmt(d.monto)}`}
            </button>
            {queda && <p className="dsf-empate">Te queda {queda} para responder.</p>}
          </div>
        )}

        {estado === "pendiente" && soyCreador && (
          <div className="dsf-esperando">
            <Icono id="i-reloj" />
            {queda
              ? `Esperando a @${d.aliasRival} · quedan ${queda}`
              : "El desafío venció y se te devolvieron las fichas"}
          </div>
        )}

        {estado === "cancelado" && (
          <div className="dsf-estado">
            Este desafío venció sin respuesta y se devolvieron las fichas.
          </div>
        )}

        {estado === "pendiente" && entrado && !soyRival && !soyCreador && (
          <p className="dsf-nota">
            Este desafío es entre @{d.aliasCreador} y @{d.aliasRival}.
          </p>
        )}
      </div>
    </main>
  );
}
