"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";

// Los combos del día: ocho parlays de MLB con su regla escrita.
//
// **No se juegan en Pálpito.** Acá se apuesta entre amigos, plata pareja, sin
// casa. Esto es información: cada quien se lo lleva a donde juegue, o lo manda
// por WhatsApp y lo discuten.
//
// Lo que hace que la sección valga algo es la **regla** de cada combo. Sin ella
// son ocho parlays al azar; con ella, cada uno es una afirmación que la
// estadística de aciertos va a poder juzgar con el tiempo.
//
// Por eso la tarjeta muestra siempre, y en este orden: qué se eligió, con qué
// regla, por qué esa pata, y cuánto paga **junto a** lo probable que es. El
// multiplicador solo, sin la probabilidad al lado, miente.

type Pata = {
  partido: string;
  hora: string;
  pick: string;
  probabilidad: number;
  motivo: string | null;
  // Se llena cuando el partido termina. `null` es "todavía no" o "no se pudo
  // decidir", que no es lo mismo que fallar.
  acerto?: boolean | null;
};

type Combo = {
  id: string;
  nombre: string;
  regla: string;
  tipo: "mercado" | "abridores";
  patas: Pata[];
  multiplicador: number;
  probabilidad: number;
  armadoAt?: string;
  acerto?: boolean | null;
  patasAcertadas?: number | null;
};

// Cuántas veces pegó cada regla desde que se lleva la cuenta.
type Historial = Record<string, { jugados: number; acertados: number }>;

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

// "1 de cada 17" se siente; "5,9%" no. Van los dos.
const unaDeCada = (p: number) => Math.round(1 / p);

const hora = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Caracas",
      }).format(new Date(iso))
    : null;

export function Combos() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Historial>({});
  const [fecha, setFecha] = useState<string>("");
  const [compartiendo, setCompartiendo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/combos").then((x) => x.json());
        if (!vivo) return;
        setCombos(r.ok ? (r.combos as Combo[]) : []);
        setMotivo(r.motivo ?? null);
        setHistorial((r.historial as Historial) ?? {});
        setFecha(r.fecha ?? "");
      } catch {
        if (vivo) setCombos([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Compartir el combo **como imagen**.
  //
  // La imagen se dibuja en el servidor desde lo guardado y se adjunta con la
  // API de compartir del teléfono, que es la única forma de que WhatsApp
  // reciba un archivo y no un enlace. El mensaje que la acompaña es solo el
  // nombre: todo lo demás ya está escrito adentro de la imagen, y repetirlo en
  // el texto es ruido.
  //
  // En escritorio no existe compartir archivos, así que ahí se abre WhatsApp
  // con el nombre y el enlace, que es lo único que se puede mandar.
  async function compartir(c: Combo) {
    setCompartiendo(c.id);
    try {
      const res = await fetch(
        `/api/combos/imagen?combo=${encodeURIComponent(c.id)}&fecha=${encodeURIComponent(fecha)}`
      );
      if (res.ok && typeof navigator !== "undefined" && navigator.canShare) {
        const blob = await res.blob();
        const archivo = new File([blob], `palpito-${c.id}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: c.nombre });
          return;
        }
      }
      const enlace = typeof window !== "undefined" ? window.location.origin : "";
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${c.nombre}\n${enlace}`)}`,
        "_blank",
        "noopener"
      );
    } catch {
      // Cancelar el diálogo de compartir también entra por acá: no es un error.
    } finally {
      setCompartiendo(null);
    }
  }

  if (combos === null) {
    return (
      <div className="svacio" style={{ padding: "44px 20px" }}>
        <p>Armando los combos del día…</p>
      </div>
    );
  }

  if (combos.length === 0) {
    return (
      <div className="svacio" style={{ padding: "44px 20px" }}>
        <Icono id="i-slip" />
        <b>Hoy no hay combos</b>
        <p>
          {motivo === "sin_jornada"
            ? "No hay jornada de MLB hoy."
            : "No hubo material suficiente para armarlos con sus reglas."}
        </p>
      </div>
    );
  }

  const armado = hora(combos[0]?.armadoAt);

  return (
    <div className="cb">
      {/* Se deslizan de costado, no hacia abajo. Ocho tarjetas apiladas en
          vertical eran doscientos píxeles de scroll para ver la segunda; así
          cada combo es una unidad y se pasa con el pulgar. La siguiente asoma
          por el borde a propósito: es lo que avisa que hay más. */}
      <div className="cb-carrusel">
        {combos.map((c) => {
          const h = historial[c.id];
          const resuelto = c.acerto === true || c.acerto === false;
          return (
          <article key={c.id} className={`cb-combo${resuelto ? (c.acerto ? " pego" : " fallo") : ""}`}>
            <header className="cb-cab">
              <div className="cb-titulo">
                <h3>{c.nombre}</h3>
                <span className={`cb-tipo ${c.tipo}`}>
                  {c.tipo === "abridores" ? "abridores" : "mercado"}
                </span>
              </div>
              <p className="cb-regla">{c.regla}</p>
              {/* El historial de la regla. Sin él, la regla es una promesa; con
                  él, es un dato que se puede discutir. */}
              {h && h.jugados > 0 && (
                <p className="cb-historial">
                  Esta regla pegó <b>{h.acertados}</b> de {h.jugados}
                </p>
              )}
            </header>

            <div className="cb-patas">
              {c.patas.map((p, i) => (
                <div
                  key={i}
                  className={`cb-pata${p.acerto === true ? " pego" : p.acerto === false ? " fallo" : ""}`}
                >
                  <span className="cb-partido">
                    {p.partido.replace(" vs. ", " · ")}
                    {p.hora && <i className="mono">{p.hora}</i>}
                  </span>
                  <b className="cb-pick">
                    {p.pick}
                    <span className="cb-prob mono">{pct(p.probabilidad)}</span>
                  </b>
                  {p.motivo && <span className="cb-motivo">{p.motivo}</span>}
                </div>
              ))}
            </div>

            {resuelto && (
              <p className={`cb-desenlace ${c.acerto ? "pego" : "fallo"}`}>
                {c.acerto
                  ? "Pegó completo"
                  : `No pegó · ${c.patasAcertadas ?? 0} de ${c.patas.length}`}
              </p>
            )}

            <div className="cb-pie">
              <div className="cb-numeros">
                <span className="cb-mult mono">x{c.multiplicador.toFixed(2)}</span>
                <span className="cb-cuanto">
                  1 de cada <b>{unaDeCada(c.probabilidad)}</b>
                  <i className="mono">{pct(c.probabilidad)}</i>
                </span>
              </div>
              <button
                className="cb-wa"
                onClick={() => compartir(c)}
                disabled={compartiendo === c.id}
                aria-label={`Compartir ${c.nombre}`}
              >
                <Icono id="i-compartir" />
                {compartiendo === c.id ? "Armando…" : "Compartir"}
              </button>
            </div>
          </article>
          );
        })}
      </div>

      <p className="tb-fuente">
        Precios de Polymarket{armado ? ` de las ${armado}` : ""}. Los porcentajes son los que paga
        el mercado, no cuentas nuestras: lo único que elegimos es qué patas van juntas.
      </p>
    </div>
  );
}
