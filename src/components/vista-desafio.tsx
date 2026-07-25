"use client";

import { useState } from "react";
import Link from "next/link";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { ZONA } from "@/lib/eventos";

type Props = {
  desafio: {
    id: string;
    monto: number;
    comisionBps: number;
    ladoCreador: "local" | "visitante";
    estado: string;
    aliasCreador: string;
    aliasRival: string;
    evento: {
      liga: string;
      equipoA: string;
      equipoB: string;
      comienzaAt: string;
      estado: string;
      marcadorA: number | null;
      marcadorB: number | null;
    };
  };
  soyRival: boolean;
  soyCreador: boolean;
  entrado: boolean;
};

// Misma zona que el resto de la app y que la tarjeta de WhatsApp: si acá se
// usara la del navegador, la imagen y la pantalla dirían horas distintas.
const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA,
  });

export function VistaDesafio({ desafio: d, soyRival, soyCreador, entrado }: Props) {
  const [enviando, setEnviando] = useState<"aceptar" | "cancelar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const elegido = d.ladoCreador === "local" ? d.evento.equipoA : d.evento.equipoB;
  const elOtro = d.ladoCreador === "local" ? d.evento.equipoB : d.evento.equipoA;
  const pozo = d.monto * 2;
  const comision = Math.round(pozo * (d.comisionBps / 10000) * 100) / 100;

  async function accion(cual: "aceptar" | "cancelar") {
    setEnviando(cual);
    setError(null);
    try {
      const res = await fetch("/api/desafios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: cual, desafio: d.id }),
      });
      const r = await res.json();
      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas para aceptar este desafío.",
          evento_cerrado: "El partido ya empezó, así que este desafío venció.",
          ya_resuelto: "Este desafío ya se había resuelto.",
          no_es_tuyo: "Este desafío no es para vos.",
          sesion: "Tenés que entrar a tu cuenta primero.",
        };
        setError(motivos[r.motivo] ?? "No se pudo completar. Probá de nuevo.");
        return;
      }
      setHecho(cual === "aceptar" ? "aceptado" : "cancelado");
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
    } finally {
      setEnviando(null);
    }
  }

  const estado = hecho === "aceptado" ? "aceptado" : hecho === "cancelado" ? "cancelado" : d.estado;
  const terminado = d.evento.estado === "finalizado";
  const ganadorLado =
    terminado && d.evento.marcadorA !== null && d.evento.marcadorB !== null
      ? d.evento.marcadorA > d.evento.marcadorB
        ? "local"
        : d.evento.marcadorA < d.evento.marcadorB
          ? "visitante"
          : "empate"
      : null;

  return (
    <main className="desafio-pagina">
      <Link className="dsf-marca" href="/">
        <span className="dsf-punto" />
        Pálpito
      </Link>

      <div className="dsf-card">
        <div className="dsf-liga">{d.evento.liga}</div>
        <h1 className="dsf-partido">
          {d.evento.equipoA} <span>vs</span> {d.evento.equipoB}
        </h1>
        <div className="dsf-cuando">{cuando(d.evento.comienzaAt)}</div>

        {terminado && d.evento.marcadorA !== null && (
          <div className="dsf-marcador mono">
            {d.evento.marcadorA} — {d.evento.marcadorB}
          </div>
        )}

        <div className="dsf-lados">
          <div className={`dsf-lado elegido ${ganadorLado === d.ladoCreador ? "gano" : ""}`}>
            <span className="q">@{d.aliasCreador} va con</span>
            <b>{elegido}</b>
          </div>
          <div className="dsf-vs">vs</div>
          <div
            className={`dsf-lado ${ganadorLado && ganadorLado !== d.ladoCreador && ganadorLado !== "empate" ? "gano" : ""}`}
          >
            <span className="q">{soyRival ? "Te toca" : `@${d.aliasRival} va con`}</span>
            <b>{elOtro}</b>
          </div>
        </div>

        <div className="dsf-pozo">
          <div className="dsf-fila">
            <span>Cada uno pone</span>
            <b className="mono">{fmt(d.monto)}</b>
          </div>
          <div className="dsf-fila">
            <span>Pozo</span>
            <b className="mono">{fmt(pozo)}</b>
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
          Si empatan, cada uno recupera sus fichas menos la mitad de la comisión.
        </p>

        {error && <div className="dsf-error">{error}</div>}

        {/* ---- Qué se puede hacer ---- */}
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
            <button className="bapostar" disabled={enviando !== null} onClick={() => accion("aceptar")}>
              {enviando === "aceptar" ? "Aceptando…" : `Aceptar y poner ${fmt(d.monto)}`}
            </button>
            <button className="dsf-rechazar" disabled={enviando !== null} onClick={() => accion("cancelar")}>
              {enviando === "cancelar" ? "…" : "Rechazar"}
            </button>
          </div>
        )}

        {estado === "pendiente" && soyCreador && (
          <div className="dsf-acciones">
            <div className="dsf-esperando">
              <Icono id="i-reloj" />
              Esperando que @{d.aliasRival} responda
            </div>
            <button className="dsf-rechazar" disabled={enviando !== null} onClick={() => accion("cancelar")}>
              {enviando === "cancelar" ? "…" : "Cancelar desafío"}
            </button>
          </div>
        )}

        {estado === "pendiente" && entrado && !soyRival && !soyCreador && (
          <p className="dsf-nota">Este desafío es entre @{d.aliasCreador} y @{d.aliasRival}.</p>
        )}

        {estado === "aceptado" && (
          <div className="dsf-estado on">
            Desafío aceptado. Se resuelve solo al terminar el partido.
          </div>
        )}
        {estado === "cancelado" && (
          <div className="dsf-estado">Este desafío se canceló y se devolvieron las fichas.</div>
        )}
        {estado === "empate" && (
          <div className="dsf-estado">Empataron: cada uno recuperó sus fichas.</div>
        )}
        {(estado === "ganado_creador" || estado === "ganado_rival") && (
          <div className="dsf-estado on">
            Ganó @{estado === "ganado_creador" ? d.aliasCreador : d.aliasRival}, y se llevó{" "}
            <b className="mono">{fmt(pozo - comision)}</b>.
          </div>
        )}
      </div>
    </main>
  );
}
