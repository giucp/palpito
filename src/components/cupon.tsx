"use client";

import { Icono } from "./iconos";
import { calcular, fmt } from "@/lib/cupon";
import type { ModoCupon, SeleccionCupon } from "@/lib/tipos";

type Props = {
  sel: SeleccionCupon[];
  modo: ModoCupon;
  monto: number;
  onModo: (m: ModoCupon) => void;
  onMonto: (n: number) => void;
  onSumar: (n: number) => void;
  onQuitar: (key: string) => void;
  onLimpiar: () => void;
  onApostar: () => void;
  onCerrar?: () => void; // presente solo en la hoja móvil
};

export function CuponPanel({
  sel,
  modo,
  monto,
  onModo,
  onMonto,
  onSumar,
  onQuitar,
  onLimpiar,
  onApostar,
  onCerrar,
}: Props) {
  const c = calcular(sel, modo, monto);

  return (
    <>
      <div className="shd">
        <Icono id="i-slip" className="w-4 h-4 text-lima-txt" />
        <b>Cupón</b>
        <span className="n">{sel.length}</span>
        {onCerrar ? (
          <button className="clr" onClick={onCerrar}>
            Cerrar
          </button>
        ) : (
          <button className="clr" onClick={onLimpiar}>
            Limpiar
          </button>
        )}
      </div>

      <div className="smode">
        <button className={modo === "simple" ? "on" : ""} onClick={() => onModo("simple")}>
          Simples
        </button>
        <button className={modo === "combinada" ? "on" : ""} onClick={() => onModo("combinada")}>
          Combinada
        </button>
      </div>

      <div className="sbody">
        {sel.length === 0 ? (
          <div className="svacio">
            <Icono id="i-slip" />
            <b>Tu cupón está vacío</b>
            <p>Toca una cuota para empezar a armar tu apuesta.</p>
          </div>
        ) : (
          sel.map((s) => (
            <div key={s.key} className="selc">
              <button className="x" onClick={() => onQuitar(s.key)} aria-label="Quitar selección">
                <Icono id="i-x" />
              </button>
              <div className="mk">{s.mercado}</div>
              <div className="pk">{s.pick}</div>
              <div className="bt">
                <span className="eq2">{s.evento}</span>
                <span className="cu mono">{s.cuota.toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {sel.length > 0 && (
        <div className="sfoot">
          <div className="stake">
            <div className="inp">
              <span>$</span>
              <input
                type="number"
                value={monto}
                min={1}
                step={1}
                onChange={(e) => onMonto(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="qk">
            {[5, 10, 25, 50].map((q) => (
              <button key={q} onClick={() => onSumar(q)}>
                +{q}
              </button>
            ))}
          </div>
          <div className="srow">
            <span className="k">
              {modo === "combinada" ? "Apuesta" : `Apuesta (${sel.length} × ${fmt(monto)})`}
            </span>
            <span className="v mono">{fmt(c.apuesta)}</span>
          </div>
          <div className="srow">
            <span className="k">Cuota total</span>
            <span className="v mono">{c.cuota ? c.cuota.toFixed(2) : "—"}</span>
          </div>
          <div className="srow gan">
            <span className="k">Ganancia posible</span>
            <span className="v mono">{fmt(c.ganancia)}</span>
          </div>
          <button className="bapostar" onClick={onApostar}>
            Apostar
          </button>
        </div>
      )}
    </>
  );
}
