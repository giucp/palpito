"use client";

import { Icono } from "./iconos";
import { calcular, fmt } from "@/lib/cupon";
import type { ModoCupon, SeleccionCupon } from "@/lib/tipos";

type Props = {
  sel: SeleccionCupon[];
  modo: ModoCupon;
  montoTexto: string;
  monto: number;
  saldo: number | null;
  enviando: boolean;
  onModo: (m: ModoCupon) => void;
  onMontoTexto: (v: string) => void;
  onQuitar: (key: string) => void;
  onLimpiar: () => void;
  onApostar: () => void;
  onCerrar?: () => void; // presente solo en la hoja móvil
};

const RAPIDOS = [5, 10, 25, 50];

export function CuponPanel({
  sel,
  modo,
  montoTexto,
  monto,
  saldo,
  enviando,
  onModo,
  onMontoTexto,
  onQuitar,
  onLimpiar,
  onApostar,
  onCerrar,
}: Props) {
  const c = calcular(sel, modo, monto);
  const sinMonto = monto < 1;
  const sinSaldo = saldo !== null && c.apuesta > saldo;
  const bloqueado = enviando || sinMonto || sinSaldo;

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
                type="text"
                inputMode="decimal"
                value={montoTexto}
                placeholder="0"
                aria-label="Monto de la apuesta"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  // Solo dígitos y un separador decimal; se permite vacío.
                  const v = e.target.value.replace(/[^\d.,]/g, "").replace(/[.,]/g, ",");
                  const partes = v.split(",");
                  onMontoTexto(
                    partes.length > 1 ? `${partes[0]},${partes.slice(1).join("").slice(0, 2)}` : v
                  );
                }}
              />
            </div>
          </div>
          <div className="qk">
            {RAPIDOS.map((q) => (
              <button
                key={q}
                className={monto === q ? "on" : ""}
                onClick={() => onMontoTexto(String(q))}
              >
                {q}
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
          {sinSaldo && <p className="saviso">No te alcanzan las fichas para esta apuesta.</p>}
          <button className="bapostar" onClick={onApostar} disabled={bloqueado}>
            {enviando ? "Colocando…" : sinMonto ? "Escribe un monto" : "Apostar"}
          </button>
        </div>
      )}
    </>
  );
}
