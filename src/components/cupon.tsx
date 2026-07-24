"use client";

import { Icono } from "./iconos";
import { useFormatoCuota } from "./formato-cuota";
import { calcular, eventosEnConflicto, fmt } from "@/lib/cupon";
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
  const { fc } = useFormatoCuota();

  const conflictos = eventosEnConflicto(sel);
  const hayConflicto = conflictos.size > 0;
  const combinadaPosible = sel.length >= 2 && !hayConflicto;
  // Con una sola selección, o con dos picks del mismo partido, la combinada
  // no aplica: se cae a simples para no ofrecer una apuesta imposible.
  const modoReal: ModoCupon = combinadaPosible ? modo : "simple";

  const c = calcular(sel, modoReal, monto);
  const sinMonto = monto < 1;
  const sinSaldo = saldo !== null && c.apuesta > saldo;
  const bloqueado = enviando || sinMonto || sinSaldo;
  const restante = saldo !== null ? saldo - c.apuesta : null;

  return (
    <>
      <div className="shd">
        <Icono id="i-slip" className="shd-ic" />
        <b>Cupón</b>
        <span className="n">{sel.length}</span>
        {sel.length > 0 && (
          <button className="clr" onClick={onLimpiar}>
            Limpiar
          </button>
        )}
        {onCerrar && (
          <button className="cerrar" onClick={onCerrar} aria-label="Cerrar cupón">
            <Icono id="i-x" />
          </button>
        )}
      </div>

      {sel.length > 0 && (
        <div className="smode">
          <button className={modoReal === "simple" ? "on" : ""} onClick={() => onModo("simple")}>
            {sel.length > 1 ? `${sel.length} simples` : "Simple"}
          </button>
          <button
            className={modoReal === "combinada" ? "on" : ""}
            onClick={() => combinadaPosible && onModo("combinada")}
            disabled={!combinadaPosible}
            title={
              sel.length < 2
                ? "Agrega otra selección para combinar"
                : hayConflicto
                  ? "No se pueden combinar dos picks del mismo partido"
                  : undefined
            }
          >
            Combinada
          </button>
        </div>
      )}

      <div className="sbody">
        {sel.length === 0 ? (
          <div className="svacio">
            <Icono id="i-slip" />
            <b>Tu cupón está vacío</b>
            <p>Toca una cuota para empezar a armar tu apuesta.</p>
          </div>
        ) : (
          <>
            {hayConflicto && modo === "combinada" && (
              <div className="s-alerta">
                <b>No se puede combinar</b>
                <p>
                  Tienes dos picks del mismo partido y una combinada exige que todos acierten.
                  Se calculará como apuestas simples.
                </p>
              </div>
            )}
            {sel.map((s) => (
              <div
                key={s.key}
                className={`selc ${conflictos.has(s.eventoId) && modo === "combinada" ? "choca" : ""}`}
              >
                <button className="x" onClick={() => onQuitar(s.key)} aria-label="Quitar selección">
                  <Icono id="i-x" />
                </button>
                <div className="mk">{s.mercado}</div>
                <div className="pk">{s.pick}</div>
                <div className="ev">{s.evento}</div>
                <div className="bt">
                  <span className="eq2">
                    {s.liga} · {s.hora}
                  </span>
                  <span className="cu mono">{fc(s.cuota)}</span>
                </div>
              </div>
            ))}
          </>
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
              {modoReal === "combinada"
                ? "Apuesta"
                : sel.length > 1
                  ? `${sel.length} × ${fmt(monto)}`
                  : "Apuesta"}
            </span>
            <span className="v mono">{fmt(c.apuesta)}</span>
          </div>
          <div className="srow">
            <span className="k">
              {modoReal === "combinada" ? "Cuota combinada" : "Cuota media"}
            </span>
            <span className="v mono">{c.cuota ? fc(c.cuota) : "—"}</span>
          </div>
          <div className="srow gan">
            <span className="k">Ganancia posible</span>
            <span className="v mono">{fmt(c.ganancia)}</span>
          </div>

          {restante !== null && !sinSaldo && c.apuesta > 0 && (
            <div className="s-restante">
              Te quedarían <b className="mono">{fmt(restante)}</b>
            </div>
          )}
          {sinSaldo && <p className="saviso">No te alcanzan las fichas para esta apuesta.</p>}

          <button className="bapostar" onClick={onApostar} disabled={bloqueado}>
            {enviando
              ? "Colocando…"
              : sinMonto
                ? "Escribe un monto"
                : modoReal === "combinada"
                  ? "Apostar combinada"
                  : sel.length > 1
                    ? `Apostar ${sel.length} simples`
                    : "Apostar"}
          </button>
        </div>
      )}
    </>
  );
}
