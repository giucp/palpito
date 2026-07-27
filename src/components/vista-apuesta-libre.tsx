"use client";

import { useState } from "react";
import Link from "next/link";
import { Icono } from "./iconos";
import { Volver } from "./volver";
import { fmt } from "@/lib/dinero";

// La pantalla de una apuesta libre: la que abre tu amigo, y la que ven los tres
// cuando toca declarar quién ganó.
//
// Lo que más importa acá no es el código sino **que la regla quede clara antes
// de que haga falta**. Si alguien se entera de que el silencio confirma recién
// cuando ya perdió por no contestar, la app le mintió por omisión. Así que se
// dice desde el principio, en la misma pantalla donde se acepta.

type Papel = "creador" | "rival" | "mediador" | "nadie";

type Props = {
  desafio: {
    id: string;
    monto: number;
    comisionBps: number;
    estado: string;
    descripcion: string;
    aliasCreador: string;
    aliasRival: string;
    aliasMediador: string | null;
    conMediador: boolean;
    mediadorAcepto: boolean;
    aceptado: boolean;
    expiraAt: string | null;
    declaraHasta: string | null;
    miVoto: "creador" | "rival" | null;
    votos: number;
  };
  papel: Papel;
  entrado: boolean;
};

const cuanto = (iso: string | null) => {
  if (!iso) return null;
  const min = Math.floor((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min <= 0) return null;
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} días`;
};

export function VistaApuestaLibre({ desafio: d, papel, entrado }: Props) {
  const [estado, setEstado] = useState(d.estado);
  const [miVoto, setMiVoto] = useState(d.miVoto);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const pozo = d.monto * 2;
  const comision = Math.round(pozo * (d.comisionBps / 10000) * 100) / 100;
  const soyParte = papel === "creador" || papel === "rival";

  async function llamar(cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/apuesta-libre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }).then((x) => x.json());
      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas para aceptar.",
          vencido: "Esta apuesta venció y se devolvieron las fichas.",
          ya_resuelto: "Esta apuesta ya se resolvió.",
          ya_declaraste: "Ya declaraste. No se puede cambiar el voto.",
          no_es_tuyo: "Esta apuesta no es tuya.",
          sesion: "Entrá a tu cuenta primero.",
        };
        setError(motivos[r.motivo] ?? "No se pudo. Probá de nuevo.");
        return null;
      }
      return r as { ok: boolean; estado?: string; gana?: string; faltan?: number };
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function aceptar() {
    const r = await llamar({ accion: "aceptar", desafio: d.id });
    if (!r) return;
    if (r.estado === "aceptado") setEstado("aceptado");
    else setAviso("Listo. Falta el otro para que arranque.");
  }

  async function declarar(gana: "creador" | "rival") {
    const r = await llamar({ accion: "declarar", desafio: d.id, gana });
    if (!r) return;
    setMiVoto(gana);
    if (r.estado === "resuelto") {
      setEstado(
        r.gana === "desacuerdo"
          ? "cancelado"
          : r.gana === "creador"
            ? "ganado_creador"
            : "ganado_rival"
      );
    } else {
      setAviso("Declarado. Falta que declare el resto.");
    }
  }

  const resuelto = ["ganado_creador", "ganado_rival", "cancelado"].includes(estado);
  const gane =
    (estado === "ganado_creador" && papel === "creador") ||
    (estado === "ganado_rival" && papel === "rival");

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
        <div className="dsf-liga">Apuesta libre</div>
        <h1 className="dsf-partido">
          @{d.aliasCreador} <span>vs</span> @{d.aliasRival}
        </h1>

        {/* De qué es. Es lo que los dos leen al declarar, así que va grande. */}
        <p className="al-frase grande">“{d.descripcion}”</p>

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
            <span>El que gane se lleva</span>
            <b className="mono">{fmt(pozo - comision)}</b>
          </div>
        </div>

        {/* ---- Cómo se decide. Antes de aceptar, no después. ---- */}
        <div className="al-reglas">
          {d.conMediador ? (
            <>
              <b>Decide @{d.aliasMediador} si no se ponen de acuerdo.</b> Cualquiera de los tres
              puede declarar quién ganó, y manda lo que digan 2 de 3. Siempre hay resultado.
            </>
          ) : (
            <>
              <b>Lo deciden entre ustedes dos.</b> Cualquiera declara quién ganó y el otro tiene una
              semana para desconocerlo. <b>Si no dice nada, se toma por bueno lo declarado</b> y se
              paga. Si se contradicen, vuelve la plata a los dos y no gana nadie.
            </>
          )}
        </div>

        {error && <div className="dsf-error">{error}</div>}
        {aviso && <div className="dsf-estado">{aviso}</div>}

        {/* ---- Qué puede hacer cada uno ---- */}
        {!entrado && (
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

        {entrado && estado === "pendiente" && papel === "rival" && !d.aceptado && (
          <div className="dsf-acciones">
            <button className="bapostar" disabled={ocupado} onClick={aceptar}>
              {ocupado ? "Aceptando…" : `Aceptar y poner ${fmt(d.monto)}`}
            </button>
            {cuanto(d.expiraAt) && (
              <p className="dsf-empate">Te queda {cuanto(d.expiraAt)} para responder.</p>
            )}
          </div>
        )}

        {entrado && estado === "pendiente" && papel === "mediador" && !d.mediadorAcepto && (
          <div className="dsf-acciones">
            <p className="dsf-nota">
              Te eligieron para decidir esta apuesta si @{d.aliasCreador} y @{d.aliasRival} no se
              ponen de acuerdo. No ponés fichas: solo decidís si hace falta.
            </p>
            <button className="bapostar" disabled={ocupado} onClick={aceptar}>
              {ocupado ? "Aceptando…" : "Acepto decidir"}
            </button>
          </div>
        )}

        {entrado && estado === "pendiente" && papel === "creador" && (
          <div className="dsf-esperando">
            <Icono id="i-reloj" />
            {d.conMediador && !d.mediadorAcepto
              ? `Esperando que @${d.aliasMediador} acepte decidir`
              : `Esperando a @${d.aliasRival}`}
          </div>
        )}

        {/* ---- Declarar ---- */}
        {entrado && estado === "aceptado" && (papel !== "nadie") && (
          <div className="al-declarar">
            {miVoto ? (
              <p className="dsf-estado">
                Declaraste que ganó @{miVoto === "creador" ? d.aliasCreador : d.aliasRival}.
                {" "}Falta que declare el resto.
              </p>
            ) : (
              <>
                <h3>¿Quién ganó?</h3>
                <div className="al-votos">
                  <button disabled={ocupado} onClick={() => declarar("creador")}>
                    @{d.aliasCreador}
                  </button>
                  <button disabled={ocupado} onClick={() => declarar("rival")}>
                    @{d.aliasRival}
                  </button>
                </div>
                {soyParte && (
                  <p className="al-ayuda">
                    Decilo como fue. Si el otro declara distinto y no hay quien decida, no cobra
                    nadie.
                  </p>
                )}
              </>
            )}
            {cuanto(d.declaraHasta) && (
              <p className="dsf-empate">Quedan {cuanto(d.declaraHasta)} para declarar.</p>
            )}
          </div>
        )}

        {/* ---- Cómo terminó ---- */}
        {resuelto && (
          <div className={`al-final ${estado === "cancelado" ? "" : gane ? "gano" : "perdio"}`}>
            {estado === "cancelado" ? (
              <>
                <b>No hubo acuerdo</b>
                <span>Volvieron {fmt(d.monto)} a cada uno. No se cobró comisión.</span>
              </>
            ) : (
              <>
                <b>
                  Ganó @{estado === "ganado_creador" ? d.aliasCreador : d.aliasRival}
                </b>
                <span>
                  {soyParte
                    ? gane
                      ? `Te llevás ${fmt(pozo - comision)}`
                      : `Se los lleva @${estado === "ganado_creador" ? d.aliasCreador : d.aliasRival}`
                    : `Se lleva ${fmt(pozo - comision)}`}
                </span>
              </>
            )}
            <Volver texto="Volver a Pálpito" />
          </div>
        )}
      </div>
    </main>
  );
}
