"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import { useFormatoCuota } from "./formato-cuota";
import { PanelAmigos } from "./panel-amigos";
import { fmt } from "@/lib/dinero";
import { calcularRendimiento, type Rendimiento, type RetoResumen } from "@/lib/rendimiento";

type Props = {
  usuario: { email: string; admin?: boolean } | null;
  saldo: number | null;
  onEntrar: () => void;
  onSalir: () => void;
  onAviso: (texto: string) => void;
  onCambioSaldo: () => void;
  onIrARetos: () => void;
};

// Anillo de aciertos: un solo arco lima sobre el fondo rojo. Sin librerías.
function Anillo({ ganadas, perdidas }: { ganadas: number; perdidas: number }) {
  const resueltas = ganadas + perdidas;
  // Los empates no entran en el porcentaje: no se acertó ni se erró.
  const R = 46;
  const C = 2 * Math.PI * R;
  const pct = resueltas > 0 ? ganadas / resueltas : 0;

  return (
    <div className="anillo">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="a-base" />
        {resueltas > 0 && (
          <circle
            cx="60"
            cy="60"
            r={R}
            className="a-ganadas"
            strokeDasharray={`${pct * C} ${C}`}
            transform="rotate(-90 60 60)"
          />
        )}
      </svg>
      <div className="a-centro">
        {resueltas > 0 ? (
          <>
            <b className="mono">{Math.round(pct * 100)}%</b>
            <small>acierto</small>
          </>
        ) : (
          <small>Sin apuestas resueltas todavía</small>
        )}
      </div>
    </div>
  );
}

export function PanelCuenta({
  usuario,
  saldo,
  onEntrar,
  onSalir,
  onAviso,
  onCambioSaldo,
  onIrARetos,
}: Props) {
  const { formato, cambiarFormato } = useFormatoCuota();
  const [est, setEst] = useState<Rendimiento | null>(null);
  const [pestania, setPestania] = useState<"cuenta" | "amigos">("cuenta");

  useEffect(() => {
    if (!usuario) return;
    let activo = true;
    (async () => {
      try {
        const r = await fetch("/api/desafios").then((x) => x.json());
        if (activo && r.ok) setEst(calcularRendimiento(r.desafios as RetoResumen[]));
      } catch {
        // Sin datos no se muestra el bloque, que es lo mismo que ver cero retos.
      }
    })();
    return () => {
      activo = false;
    };
  }, [usuario]);

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>No has entrado</b>
        <p>Crea tu cuenta y recibe 1000 fichas de prueba de regalo.</p>
        <button className="bapostar" style={{ maxWidth: 240, margin: "16px auto 0" }} onClick={onEntrar}>
          Entrar
        </button>
      </div>
    );
  }

  const balance = est?.balance ?? 0;

  return (
    <div className="perfil">
      {/* Los desafíos entre amigos viven acá dentro: es tu cuenta, tu gente. */}
      <div className="pf-pestanias">
        <button className={pestania === "cuenta" ? "on" : ""} onClick={() => setPestania("cuenta")}>
          <Icono id="i-user" />
          Cuenta
        </button>
        <button className={pestania === "amigos" ? "on" : ""} onClick={() => setPestania("amigos")}>
          <Icono id="i-amigos" />
          Amigos
        </button>
      </div>

      {pestania === "amigos" && (
        <PanelAmigos onAviso={onAviso} onCambio={onCambioSaldo} onIrARetos={onIrARetos} />
      )}

      {pestania === "cuenta" && (
        <>
      <div className="pf-saldo">
        <span className="k">Saldo disponible</span>
        <b className="mono">{saldo !== null ? fmt(saldo) : "—"}</b>
        <small>Fichas de prueba</small>
      </div>

      {/* Cómo te fue contra otros. Sale de tus retos: acá no hay casa. */}
      {est && est.total > 0 && (
        <>
          <div className="pf-card">
            <div className="pf-titulo">Tu rendimiento</div>
            <div className="pf-anillo-fila">
              <Anillo ganadas={est.ganadas} perdidas={est.perdidas} />
              <div className="pf-leyenda">
                <div className="ly">
                  <i className="p-ganada" />
                  <span>Ganadas</span>
                  <b className="mono">{est.ganadas}</b>
                </div>
                <div className="ly">
                  <i className="p-perdida" />
                  <span>Perdidas</span>
                  <b className="mono">{est.perdidas}</b>
                </div>
                {est.empatadas > 0 && (
                  <div className="ly">
                    <i className="p-anulada" />
                    <span>Empatadas</span>
                    <b className="mono">{est.empatadas}</b>
                  </div>
                )}
                <div className="ly">
                  <i className="p-abierta" />
                  <span>En juego</span>
                  <b className="mono">{est.enJuego}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="pf-grid">
            <div className="pf-stat">
              <span>Retos</span>
              <b className="mono">{est.total}</b>
            </div>
            <div className="pf-stat">
              <span>Puesto</span>
              <b className="mono">{fmt(est.apostado)}</b>
            </div>
            <div className={`pf-stat ${balance > 0 ? "pos" : balance < 0 ? "neg" : ""}`}>
              <span>Balance</span>
              <b className="mono">
                {balance > 0 ? "+" : ""}
                {fmt(balance)}
              </b>
            </div>
          </div>
        </>
      )}

      <div className="pf-card">
        <div className="pf-titulo">Formato de cuotas</div>
        <div className="pf-formato">
          <button
            className={formato === "decimal" ? "on" : ""}
            onClick={() => cambiarFormato("decimal")}
          >
            Decimal
            <small className="mono">1.96</small>
          </button>
          <button
            className={formato === "americano" ? "on" : ""}
            onClick={() => cambiarFormato("americano")}
          >
            Americano
            <small className="mono">+96</small>
          </button>
        </div>
      </div>

      <div className="pf-row">
        <span>Correo</span>
        <b>{usuario.email}</b>
      </div>

      {/* Solo lo ve quien es administrador; el permiso real lo comprueba /admin. */}
      {usuario.admin && (
        <a className="pf-admin" href="/admin">
          <Icono id="i-panel" />
          <span>Panel de administración</span>
          <Icono id="i-arr" className="ir" />
        </a>
      )}

      <button className="pf-salir" onClick={onSalir}>
        Cerrar sesión
      </button>
        </>
      )}
    </div>
  );
}
