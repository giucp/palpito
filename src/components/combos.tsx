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
};

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

function textoWhatsapp(c: Combo): string {
  const patas = c.patas
    .map((p) => `• ${p.partido}\n   ${p.pick}${p.motivo ? `\n   ${p.motivo}` : ""}`)
    .join("\n");
  return (
    `⚾ ${c.nombre} · ${c.patas.length} picks\n` +
    `${c.regla}\n\n` +
    `${patas}\n\n` +
    `Paga x${c.multiplicador.toFixed(2)} · pega 1 de cada ${unaDeCada(c.probabilidad)} veces\n` +
    `Armado con los precios de Polymarket.\n` +
    `Pálpito · ${typeof window !== "undefined" ? window.location.origin : ""}`
  );
}

export function Combos() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/combos").then((x) => x.json());
        if (!vivo) return;
        setCombos(r.ok ? (r.combos as Combo[]) : []);
        setMotivo(r.motivo ?? null);
      } catch {
        if (vivo) setCombos([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

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
        {combos.map((c) => (
          <article key={c.id} className="cb-combo">
            <header className="cb-cab">
              <div className="cb-titulo">
                <h3>{c.nombre}</h3>
                <span className={`cb-tipo ${c.tipo}`}>
                  {c.tipo === "abridores" ? "abridores" : "mercado"}
                </span>
              </div>
              <p className="cb-regla">{c.regla}</p>
            </header>

            <div className="cb-patas">
              {c.patas.map((p, i) => (
                <div key={i} className="cb-pata">
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

            <div className="cb-pie">
              <div className="cb-numeros">
                <span className="cb-mult mono">x{c.multiplicador.toFixed(2)}</span>
                <span className="cb-cuanto">
                  1 de cada <b>{unaDeCada(c.probabilidad)}</b>
                  <i className="mono">{pct(c.probabilidad)}</i>
                </span>
              </div>
              <a
                className="cb-wa"
                href={`https://wa.me/?text=${encodeURIComponent(textoWhatsapp(c))}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Enviar ${c.nombre} por WhatsApp`}
              >
                <Icono id="i-arr" />
                Enviar
              </a>
            </div>
          </article>
        ))}
      </div>

      <p className="tb-fuente">
        Precios de Polymarket{armado ? ` de las ${armado}` : ""}. Los porcentajes son los que paga
        el mercado, no cuentas nuestras: lo único que elegimos es qué patas van juntas.
      </p>
    </div>
  );
}
