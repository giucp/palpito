"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DespegueLienzo } from "./despegue-lienzo";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { crearClienteNavegador } from "@/lib/supabase/client";

const K = 0.09; // debe coincidir con el servidor
const RAPIDOS = [5, 10, 25, 50];

type Estado = "listo" | "volando" | "retirada" | "estrellada";

type Ronda = {
  id: string;
  multiplicador: number | null;
  punto_crash: number;
  estado: string;
  pago: number | null;
};

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

export function Despegue({ usuario, saldo, onAviso, onEntrar }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("listo");
  const [montoTexto, setMontoTexto] = useState("10");
  const [autoTexto, setAutoTexto] = useState("");
  const [mult, setMult] = useState(1);
  const [rondaId, setRondaId] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [revelado, setRevelado] = useState<{ semilla: string; crash: number } | null>(null);
  const [historial, setHistorial] = useState<Ronda[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [tema, setTema] = useState<"dark" | "light">("dark");

  const t0 = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef = useRef<number | null>(null);
  const retirando = useRef(false);

  const monto = Number(montoTexto.replace(",", ".")) || 0;
  const objetivo = Number(autoTexto.replace(",", ".")) || 0;

  useEffect(() => {
    const leer = () =>
      setTema(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const cargarHistorial = useCallback(async () => {
    if (!usuario) return;
    const supabase = crearClienteNavegador();
    const { data } = await supabase
      .from("rondas_despegue")
      .select("id, multiplicador, punto_crash, estado, pago")
      .neq("estado", "volando")
      .order("iniciada_at", { ascending: false })
      .limit(14);
    setHistorial((data as Ronda[]) ?? []);
  }, [usuario]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const limpiarRelojes = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    rafRef.current = null;
    pollRef.current = null;
  };

  useEffect(() => () => limpiarRelojes(), []);

  const cerrarRonda = useCallback(
    (
      comoEstado: Estado,
      datos: { semilla?: string; punto_crash?: number; multiplicador?: number; pago?: number }
    ) => {
      limpiarRelojes();
      retirando.current = false;
      setEstado(comoEstado);
      if (datos.semilla && datos.punto_crash) {
        setRevelado({ semilla: datos.semilla, crash: Number(datos.punto_crash) });
      }
      if (comoEstado === "estrellada" && datos.punto_crash) setMult(Number(datos.punto_crash));
      if (comoEstado === "retirada" && datos.multiplicador) setMult(Number(datos.multiplicador));
      setOcupado(false);
      router.refresh();
      cargarHistorial();
    },
    [router, cargarHistorial]
  );

  const retirar = useCallback(async () => {
    if (!rondaId || retirando.current) return;
    retirando.current = true;
    const res = await fetch("/api/despegue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "retirar", ronda_id: rondaId }),
    });
    const r = await res.json();
    if (r.resultado === "retirada") {
      onAviso(`¡Retiraste ${r.multiplicador}x → ${fmt(Number(r.pago))}!`);
      cerrarRonda("retirada", r);
    } else {
      cerrarRonda("estrellada", r);
    }
  }, [rondaId, cerrarRonda, onAviso]);

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
    setRevelado(null);
    setMult(1);
    autoRef.current = objetivo >= 1.01 ? objetivo : null;

    const res = await fetch("/api/despegue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "iniciar",
        monto,
        idempotency_key: crypto.randomUUID(),
      }),
    });
    const r = await res.json();
    if (!r.ok) {
      setOcupado(false);
      onAviso(
        r.motivo === "saldo"
          ? "No te alcanzan las fichas"
          : r.motivo === "ronda_en_curso"
            ? "Ya tienes un vuelo en curso"
            : "No se pudo despegar, intenta de nuevo"
      );
      return;
    }

    setRondaId(r.ronda_id);
    setHash(r.hash ?? null);
    setEstado("volando");
    router.refresh();

    // El reloj arranca cuando llega la respuesta, no antes: así el número que
    // ves va un pelín por detrás del servidor y la latencia nunca te perjudica.
    t0.current = performance.now();

    const animar = () => {
      const seg = (performance.now() - t0.current) / 1000;
      const m = Math.floor(Math.exp(K * seg) * 100) / 100;
      setMult(m);
      if (autoRef.current && m >= autoRef.current) {
        autoRef.current = null;
        retirar();
        return;
      }
      rafRef.current = requestAnimationFrame(animar);
    };
    rafRef.current = requestAnimationFrame(animar);

    // El servidor es quien sabe cuándo se estrella; se le pregunta seguido.
    pollRef.current = setInterval(async () => {
      const e = await fetch("/api/despegue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado", ronda_id: r.ronda_id }),
      }).then((x) => x.json());
      if (e?.estado === "estrellada") cerrarRonda("estrellada", e);
    }, 400);
  };

  const volando = estado === "volando";
  const gananciaActual = monto * mult;

  return (
    <div className="dsp">
      <div className="dsp-caja">
        <DespegueLienzo estado={estado} multiplicador={mult} tema={tema} />
        <div className={`dsp-mult ${estado}`}>
          <b className="mono">{mult.toFixed(2)}x</b>
          {estado === "estrellada" && <span className="dsp-msg estrellada">Se estrelló</span>}
          {estado === "retirada" && <span className="dsp-msg retirada">¡Retiraste a tiempo!</span>}
          {estado === "listo" && <span className="dsp-msg">Listo para despegar</span>}
        </div>
      </div>

      {historial.length > 0 && (
        <div className="dsp-hist">
          {historial.map((h) => {
            const v = Number(h.punto_crash);
            return (
              <span
                key={h.id}
                className={`hx ${h.estado === "retirada" ? "ok" : ""} ${v >= 2 ? "alto" : "bajo"}`}
                title={h.estado === "retirada" ? `Retiraste en ${h.multiplicador}x` : "Se estrelló"}
              >
                {v.toFixed(2)}x
              </span>
            );
          })}
        </div>
      )}

      <div className="dsp-panel">
        {volando ? (
          <button className="dsp-retirar" onClick={retirar}>
            <span>RETIRAR</span>
            <b className="mono">{fmt(gananciaActual)}</b>
          </button>
        ) : (
          <>
            <div className="dsp-campos">
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
              <label className="dsp-campo">
                <span>Retiro automático</span>
                <div className="inp">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={autoTexto}
                    placeholder="opcional"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setAutoTexto(e.target.value.replace(/[^\d.,]/g, "").replace(".", ","))
                    }
                  />
                  <i className="der">x</i>
                </div>
              </label>
            </div>
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
              {ocupado ? "Despegando…" : monto < 1 ? "Escribe un monto" : "Despegar"}
            </button>
          </>
        )}
      </div>

      {(hash || revelado) && (
        <details className="dsp-fair">
          <summary>
            <Icono id="i-slip" />
            Ronda verificable
          </summary>
          <p>
            El resultado se decide antes de despegar. Aquí tienes su huella; al terminar se
            revela la semilla para que compruebes que no cambió.
          </p>
          {hash && (
            <div className="ff">
              <span>Huella</span>
              <code>{hash.slice(0, 32)}…</code>
            </div>
          )}
          {revelado && (
            <>
              <div className="ff">
                <span>Semilla</span>
                <code>{revelado.semilla.slice(0, 32)}…</code>
              </div>
              <div className="ff">
                <span>Se estrellaba en</span>
                <code>{revelado.crash.toFixed(2)}x</code>
              </div>
            </>
          )}
        </details>
      )}
    </div>
  );
}
