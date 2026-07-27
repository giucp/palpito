"use client";

import { useCallback, useEffect, useState } from "react";
import { Icono } from "./iconos";
import { PanelAmigos } from "./panel-amigos";
import { Retos } from "./retos";
import { fmt } from "@/lib/dinero";
import { calcularRendimiento, type Rendimiento, type RetoResumen } from "@/lib/rendimiento";

// Mi cuenta: quién sos, cuánto tenés, y lo que tenés con otros.
//
// Se rehizo el 2026-07-27. La versión anterior era la de cuando Pálpito jugaba
// contra la casa: tenía un selector de formato de cuotas que ya no formateaba
// nada, el alias escondido dentro de Amigos, y el correo como un renglón suelto.
//
// Ahora arriba va **quién sos y cuánto tenés**, que es lo que uno viene a ver, y
// eso no cambia con la pestaña. Debajo, tres secciones:
//
//   Cuenta  — cómo te fue y los accesos de la cuenta
//   Retos   — los que tenés con otros. Vivían en Apuestas; el dueño los quiso
//             acá, y tiene razón: son tuyos, no del tablero público.
//   Amigos  — a quién podés retar
//
// Apuestas queda entonces con una sola cosa: el tablero abierto.

type Seccion = "cuenta" | "retos" | "amigos";

type Props = {
  usuario: { email: string; admin?: boolean } | null;
  saldo: number | null;
  // `?ver=retos` abre directo en los retos: lo usa el botón de volver de un
  // desafío abierto desde WhatsApp.
  seccionInicial?: Seccion;
  onEntrar: () => void;
  onSalir: () => void;
  onAviso: (texto: string) => void;
  onCambioSaldo: () => void;
};

// Anillo de aciertos: un solo arco lima sobre el fondo rojo. Sin librerías.
function Anillo({ ganadas, perdidas }: { ganadas: number; perdidas: number }) {
  // Los empates no entran en el porcentaje: no se acertó ni se erró.
  const resueltas = ganadas + perdidas;
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
          <small>Sin retos resueltos</small>
        )}
      </div>
    </div>
  );
}

export function PanelCuenta({
  usuario,
  saldo,
  seccionInicial = "cuenta",
  onEntrar,
  onSalir,
  onAviso,
  onCambioSaldo,
}: Props) {
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial);
  const [rendimiento, setRendimiento] = useState<Rendimiento | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [aliasNuevo, setAliasNuevo] = useState("");

  const pedirAlias = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch("/api/amigos").then((x) => x.json());
      return r.ok ? (r.alias ?? null) : null;
    } catch {
      return null;
    }
  }, []);

  const pedirRendimiento = useCallback(async (): Promise<Rendimiento | null> => {
    try {
      const r = await fetch("/api/desafios").then((x) => x.json());
      return r.ok ? calcularRendimiento(r.desafios as RetoResumen[]) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      const [a, r] = await Promise.all([pedirAlias(), pedirRendimiento()]);
      if (!vivo) return;
      setAlias(a);
      setRendimiento(r);
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, pedirAlias, pedirRendimiento]);

  async function guardarAlias() {
    const q = aliasNuevo.trim().toLowerCase();
    const r = await fetch("/api/amigos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "alias", alias: q }),
    }).then((x) => x.json());

    const motivos: Record<string, string> = {
      alias_tomado: "Ese alias ya está tomado",
      alias_invalido: "Usá 3 a 20 letras, números o guión bajo",
    };
    onAviso(r.ok ? "Alias actualizado" : (motivos[r.motivo] ?? "No se pudo"));
    if (r.ok) {
      setEditando(false);
      setAlias(q);
    }
  }

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>No has entrado</b>
        <p>Creá tu cuenta y recibí 1000 fichas de prueba de regalo.</p>
        <button
          className="bapostar"
          style={{ maxWidth: 240, margin: "16px auto 0" }}
          onClick={onEntrar}
        >
          Entrar
        </button>
      </div>
    );
  }

  const balance = rendimiento?.balance ?? 0;
  const inicial = (alias ?? usuario.email).slice(0, 2).toUpperCase();

  return (
    <div className="perfil">
      {/* Quién sos. Va arriba de las pestañas porque no depende de ninguna. */}
      <header className="pf-yo">
        <span className="pf-avatar">{inicial}</span>
        {editando ? (
          <div className="pf-alias-editar">
            <input
              value={aliasNuevo}
              onChange={(e) => setAliasNuevo(e.target.value)}
              placeholder={alias ?? "tu_alias"}
              maxLength={20}
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Nuevo alias"
            />
            <button onClick={guardarAlias}>Guardar</button>
            <button className="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <div className="pf-quien">
              <b>@{alias ?? "—"}</b>
              <span>{usuario.email}</span>
            </div>
            {/* "Cambiar" y no "Cambiar alias": la etiqueta larga se comía
                102 px y el correo quedaba cortado por tres. Al lado del alias
                se entiende igual. */}
            <button
              className="pf-cambiar"
              aria-label="Cambiar alias"
              onClick={() => {
                setAliasNuevo(alias ?? "");
                setEditando(true);
              }}
            >
              Cambiar
            </button>
          </>
        )}
      </header>

      <div className="pf-saldo">
        <span className="k">Saldo disponible</span>
        <b className="mono">{saldo !== null ? fmt(saldo) : "—"}</b>
        <small>Fichas de prueba</small>
      </div>

      <nav className="secciones">
        {(
          [
            ["cuenta", "Cuenta"],
            ["retos", "Retos"],
            ["amigos", "Amigos"],
          ] as const
        ).map(([id, nombre]) => (
          <button
            key={id}
            className={seccion === id ? "on" : ""}
            onClick={() => setSeccion(id)}
          >
            {nombre}
          </button>
        ))}
      </nav>

      {seccion === "retos" && <Retos usuario={usuario} onEntrar={onEntrar} />}

      {seccion === "amigos" && <PanelAmigos onAviso={onAviso} onCambio={onCambioSaldo} />}

      {seccion === "cuenta" && (
        <>
          {/* Cómo te fue contra otros. Sale de tus retos: acá no hay casa. */}
          {rendimiento && rendimiento.total > 0 ? (
            <>
              <div className="pf-card">
                <div className="pf-titulo">Tu rendimiento</div>
                <div className="pf-anillo-fila">
                  <Anillo ganadas={rendimiento.ganadas} perdidas={rendimiento.perdidas} />
                  <div className="pf-leyenda">
                    <div className="ly">
                      <i className="p-ganada" />
                      <span>Ganadas</span>
                      <b className="mono">{rendimiento.ganadas}</b>
                    </div>
                    <div className="ly">
                      <i className="p-perdida" />
                      <span>Perdidas</span>
                      <b className="mono">{rendimiento.perdidas}</b>
                    </div>
                    {rendimiento.empatadas > 0 && (
                      <div className="ly">
                        <i className="p-anulada" />
                        <span>Empatadas</span>
                        <b className="mono">{rendimiento.empatadas}</b>
                      </div>
                    )}
                    <div className="ly">
                      <i className="p-abierta" />
                      <span>En juego</span>
                      <b className="mono">{rendimiento.enJuego}</b>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pf-grid">
                <div className="pf-stat">
                  <span>Retos</span>
                  <b className="mono">{rendimiento.total}</b>
                </div>
                <div className="pf-stat">
                  <span>Puesto</span>
                  <b className="mono">{fmt(rendimiento.apostado)}</b>
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
          ) : (
            // Sin retos jugados no hay nada que promediar. Antes acá no había
            // nada y la pantalla quedaba con un hueco raro.
            <div className="pf-card pf-sinnada">
              <div className="pf-titulo">Tu rendimiento</div>
              <p>
                Todavía no jugaste ningún reto. En cuanto se resuelva el primero, acá van tus
                ganadas, tus perdidas y el balance.
              </p>
              <button className="pf-ir" onClick={() => setSeccion("amigos")}>
                Retar a un amigo
                <Icono id="i-arr" />
              </button>
            </div>
          )}

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
