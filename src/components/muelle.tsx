"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MuelleLienzo } from "./muelle-lienzo";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { multiplicadores, TABLAS } from "@/lib/muelle-tabla";
import { sonar } from "@/lib/sonido";
import { crearClienteNavegador } from "@/lib/supabase/client";

const RAPIDOS = [5, 10, 25, 50];
// La escalera de premios no es secreta: se muestra desde antes de apostar.
const PREMIOS = multiplicadores();

type Estado = "listo" | "jugando" | "cobrada" | "hundida";

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

export function Muelle({ usuario, saldo, onAviso, onEntrar }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("listo");
  const [montoTexto, setMontoTexto] = useState("10");
  const [partida, setPartida] = useState<string | null>(null);
  const [mults, setMults] = useState<number[]>(PREMIOS);
  const [posicion, setPosicion] = useState(0);
  const [podridas, setPodridas] = useState<boolean[] | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [semilla, setSemilla] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tema, setTema] = useState<"dark" | "light">("dark");
  const pista = useRef<HTMLDivElement | null>(null);

  const monto = Number(montoTexto.replace(",", ".")) || 0;
  const jugando = estado === "jugando";
  const acumulado = posicion > 0 && mults[posicion - 1] ? monto * mults[posicion - 1] : 0;
  const siguiente = mults[posicion] ?? null;

  useEffect(() => {
    const leer = () =>
      setTema(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Si quedó una partida abierta de una visita anterior, se retoma.
  useEffect(() => {
    if (!usuario) return;
    let activo = true;
    (async () => {
      const supabase = crearClienteNavegador();
      const { data } = await supabase
        .from("muelle_historial")
        .select("id, posicion, monto")
        .eq("estado", "jugando")
        .limit(1)
        .maybeSingle();
      if (!activo || !data) return;
      setPartida(data.id);
      setPosicion(data.posicion);
      setMontoTexto(String(Number(data.monto)));
      setEstado("jugando");
      const r = await fetch("/api/muelle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado", partida_id: data.id }),
      }).then((x) => x.json());
      if (activo && r?.mults) setMults(r.mults);
    })();
    return () => {
      activo = false;
    };
  }, [usuario]);

  // Mantener a la vista la tabla en la que estás.
  useEffect(() => {
    const el = pista.current?.querySelector<HTMLElement>(`[data-i="${posicion}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [posicion]);

  const cerrar = useCallback(
    (como: Estado, r: { podridas?: boolean[]; semilla?: string }) => {
      setEstado(como);
      if (r.podridas) setPodridas(r.podridas);
      if (r.semilla) setSemilla(r.semilla);
      setOcupado(false);
      router.refresh();
    },
    [router]
  );

  const iniciar = async () => {
    if (!usuario) {
      onAviso("Entra para jugar — te regalamos 1000 fichas");
      onEntrar();
      return;
    }
    if (monto < 1) return onAviso("Escribe un monto");
    if (saldo !== null && monto > saldo) return onAviso("No te alcanzan las fichas");
    if (ocupado) return;

    setOcupado(true);
    setPodridas(null);
    setSemilla(null);
    setPosicion(0);

    const r = await fetch("/api/muelle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "iniciar", monto, idempotency_key: crypto.randomUUID() }),
    }).then((x) => x.json());

    setOcupado(false);
    if (!r.ok) {
      onAviso(
        r.motivo === "saldo"
          ? "No te alcanzan las fichas"
          : r.motivo === "partida_en_curso"
            ? "Ya tienes una partida en curso"
            : "No se pudo empezar, intenta de nuevo"
      );
      return;
    }
    setPartida(r.partida_id);
    setMults(r.mults ?? PREMIOS);
    setHash(r.hash ?? null);
    setEstado("jugando");
    sonar("inicio");
    router.refresh();
  };

  const saltar = async () => {
    if (!partida || ocupado) return;
    setOcupado(true);
    const r = await fetch("/api/muelle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "saltar", partida_id: partida }),
    }).then((x) => x.json());

    if (r.resultado === "hundida") {
      setPosicion(r.posicion);
      sonar("pierde");
      onAviso("¡La tabla cedió!");
      cerrar("hundida", r);
    } else if (r.resultado === "completado") {
      setPosicion(r.posicion);
      sonar("gana");
      onAviso(`¡Cruzaste el muelle entero! ${fmt(Number(r.pago))}`);
      cerrar("cobrada", r);
    } else if (r.resultado === "firme") {
      setPosicion(r.posicion);
      sonar("paso");
      setOcupado(false);
    } else {
      setOcupado(false);
      onAviso("No se pudo saltar, intenta de nuevo");
    }
  };

  const cobrar = async () => {
    if (!partida || ocupado || posicion < 1) return;
    setOcupado(true);
    const r = await fetch("/api/muelle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cobrar", partida_id: partida }),
    }).then((x) => x.json());
    if (r.resultado === "cobrada") {
      sonar("gana");
      onAviso(`¡Cobraste ${r.multiplicador}x → ${fmt(Number(r.pago))}!`);
      cerrar("cobrada", r);
    } else {
      setOcupado(false);
      onAviso("No se pudo cobrar, intenta de nuevo");
    }
  };

  const total = mults.length || TABLAS;

  return (
    <div className="mll">
      <div className="mll-caja">
        <MuelleLienzo
          estado={estado}
          posicion={posicion}
          podridas={podridas}
          total={total}
          tema={tema}
        />
        <div className={`mll-info ${estado}`}>
          {jugando && posicion > 0 && (
            <>
              <b className="mono">{fmt(acumulado)}</b>
              <span>llevas · tabla {posicion}</span>
            </>
          )}
          {jugando && posicion === 0 && <span className="mll-arranque">Salta a la primera tabla</span>}
          {estado === "hundida" && <span className="mll-fin malo">La tabla cedió</span>}
          {estado === "cobrada" && <span className="mll-fin bueno">¡A salvo!</span>}
        </div>
      </div>

      {/* Las 10 tablas: se ve de un vistazo cuánto paga cada una y cuál pisas */}
      <div className="mll-pista" ref={pista}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const m = mults[i];
          const pisada = n <= posicion;
          const rota = podridas?.[i];
          const actual = n === posicion;
          const proxima = jugando && n === posicion + 1;
          return (
            <div
              key={n}
              data-i={n}
              className={`tb ${pisada ? "pisada" : ""} ${actual ? "actual" : ""} ${
                proxima ? "proxima" : ""
              } ${rota && podridas ? "rota" : ""}`}
            >
              <span className="tn">{n}</span>
              <b className="mono">{m ? `${m.toFixed(2)}x` : "—"}</b>
            </div>
          );
        })}
      </div>

      <div className="mll-panel">
        {jugando ? (
          <div className="mll-acciones">
            {/* onPointerDown: responde al tocar, no al soltar. */}
            <button className="mll-saltar" onPointerDown={saltar} disabled={ocupado}>
              <span>SALTAR</span>
              {siguiente && <b className="mono">{siguiente.toFixed(2)}x</b>}
            </button>
            <button
              className="mll-cobrar"
              onPointerDown={cobrar}
              disabled={ocupado || posicion < 1}
            >
              <span>COBRAR</span>
              <b className="mono">{fmt(acumulado)}</b>
            </button>
          </div>
        ) : (
          <>
            <label className="dsp-campo">
              <span>Apuesta</span>
              <div className="inp">
                <i>$</i>
                <input
                  type="text"
                  inputMode="decimal"
                  value={montoTexto}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setMontoTexto(e.target.value.replace(/[^\d.,]/g, "").replace(".", ","))
                  }
                />
              </div>
            </label>
            <div className="qk dsp-qk">
              {RAPIDOS.map((q) => (
                <button
                  key={q}
                  className={monto === q ? "on" : ""}
                  onClick={() => setMontoTexto(String(q))}
                >
                  {q}
                </button>
              ))}
            </div>
            <button className="dsp-despegar" onClick={iniciar} disabled={ocupado || monto < 1}>
              {ocupado ? "Preparando…" : monto < 1 ? "Escribe un monto" : "Empezar a cruzar"}
            </button>
          </>
        )}
      </div>

      {(hash || semilla) && (
        <details className="dsp-fair">
          <summary>
            <Icono id="i-slip" />
            Partida verificable
          </summary>
          <p>
            Qué tablas estaban podridas se decidió antes de empezar. Aquí está la huella; al
            terminar se revela la semilla para comprobar que no cambió.
          </p>
          {hash && (
            <div className="ff">
              <span>Huella</span>
              <code>{hash.slice(0, 32)}…</code>
            </div>
          )}
          {semilla && (
            <div className="ff">
              <span>Semilla</span>
              <code>{semilla.slice(0, 32)}…</code>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
