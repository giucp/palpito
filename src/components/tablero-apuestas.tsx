"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/dinero";
import { LIGAS, type PartidoTablero } from "@/lib/tablero";

// El tablero abierto (palpito_guia.md §6.e).
//
// Cualquiera publica una apuesta sobre un partido y queda a la vista de todos
// esperando quien se la tome. No hace falta ser amigo de nadie.
//
// Plata pareja: los dos ponen lo mismo y el ganador se lleva el pozo menos la
// comisión del 0,5%. Al lado de cada publicación se muestra la línea del
// partido — no cambia la matemática, pero deja ver qué lado te están
// ofreciendo.

const ZONA = "America/Caracas";
const COMISION = 0.005;

const diaISO = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA,
  }).format(new Date(iso));

function etiquetaDia(d: Date, hoy: Date): string {
  const dif = Math.round(
    (new Date(diaISO(d)).getTime() - new Date(diaISO(hoy)).getTime()) / 86_400_000
  );
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Mañana";
  return new Intl.DateTimeFormat("es", { weekday: "short", timeZone: ZONA })
    .format(d)
    .replace(".", "");
}

const DEPORTES = [...new Set(LIGAS.map((l) => l.deporte))];

export type Apuesta = {
  id: string;
  monto: number;
  lado: "local" | "visitante";
  alias: string;
  esMia: boolean;
  evento: { liga: string; equipoA: string; equipoB: string; comienzaAt: string };
  linea: { local: string | null; visitante: string | null } | null;
};

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onCambio: () => void;
  onEntrar: () => void;
};

type Paso = "tablero" | "partido" | "lado" | "monto";

export function TableroApuestas({ usuario, saldo, onAviso, onCambio, onEntrar }: Props) {
  // Sin sesión el tablero no se pide, así que arranca vacío en vez de "cargando".
  const [apuestas, setApuestas] = useState<Apuesta[] | null>(usuario ? null : []);
  const [ocupada, setOcupada] = useState<string | null>(null);

  // ---- Flujo de publicación ----
  const [paso, setPaso] = useState<Paso>("tablero");
  const hoy = useMemo(() => new Date(), []);
  const [deporte, setDeporte] = useState(DEPORTES[0]);
  const [ligaId, setLigaId] = useState(LIGAS[0].id);
  const [offset, setOffset] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  // Lo traído se guarda junto con la clave de lo que se pidió, como en la
  // cartelera: así "cargando" se deduce al pintar y no hay que vaciar el estado
  // al empezar cada búsqueda.
  const [cartelera, setCartelera] = useState<{ clave: string; partidos: PartidoTablero[] } | null>(
    null
  );
  const [partido, setPartido] = useState<PartidoTablero | null>(null);
  const [lado, setLado] = useState<"local" | "visitante" | null>(null);
  const [monto, setMonto] = useState("100");
  const [enviando, setEnviando] = useState(false);

  const fecha = useMemo(() => new Date(hoy.getTime() + offset * 86_400_000), [hoy, offset]);

  // Devuelve en vez de guardar: así el efecto decide si todavía está montado
  // antes de tocar el estado, y no hay un setState suelto dentro del efecto.
  const pedir = useCallback(async (): Promise<Apuesta[]> => {
    try {
      const r = await fetch("/api/apuestas").then((x) => x.json());
      return r.ok ? (r.apuestas as Apuesta[]) : [];
    } catch {
      return [];
    }
  }, []);

  const traer = useCallback(async () => setApuestas(await pedir()), [pedir]);

  // Sin sesión no se pide: la ruta la exige para saber cuál apuesta es tuya y
  // no ofrecerte tomarte a vos mismo.
  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      const a = await pedir();
      if (vivo) setApuestas(a);
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, pedir]);

  // La cartelera del paso "elegir partido".
  const clave = `${ligaId}|${diaISO(fecha)}`;
  useEffect(() => {
    if (paso !== "partido") return;
    let vivo = true;
    const [liga, dia] = clave.split("|");
    (async () => {
      try {
        const r = await fetch(`/api/tablero?liga=${liga}&fecha=${dia}`).then((x) => x.json());
        if (vivo) setCartelera({ clave, partidos: r.ok ? (r.partidos as PartidoTablero[]) : [] });
      } catch {
        if (vivo) setCartelera({ clave, partidos: [] });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [paso, clave]);

  const partidos = cartelera?.clave === clave ? cartelera.partidos : null;

  async function tomar(a: Apuesta) {
    if (!usuario) {
      onAviso("Creá tu cuenta para apostar — te regalamos 1000 fichas");
      onEntrar();
      return;
    }
    setOcupada(a.id);
    try {
      const r = await fetch("/api/apuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "tomar", apuesta: a.id }),
      }).then((x) => x.json());

      if (r.ok) {
        onAviso(`Tomaste la apuesta de @${a.alias} · ${fmt(a.monto)}`);
        onCambio();
        traer();
        return;
      }
      const motivos: Record<string, string> = {
        saldo: "No te alcanzan las fichas para tomarla",
        ya_tomada: "Se te adelantaron: ya la tomó otro",
        es_tuya: "Esa apuesta es tuya",
        evento_cerrado: "Ese partido ya empezó",
        ya_resuelto: "Esa apuesta ya no está disponible",
      };
      onAviso(motivos[r.motivo] ?? "No se pudo tomar");
      traer();
    } finally {
      setOcupada(null);
    }
  }

  async function retirar(a: Apuesta) {
    setOcupada(a.id);
    try {
      const r = await fetch("/api/apuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "retirar", apuesta: a.id }),
      }).then((x) => x.json());
      onAviso(r.ok ? "Apuesta retirada, se te devolvieron las fichas" : "No se pudo retirar");
      if (r.ok) onCambio();
      traer();
    } finally {
      setOcupada(null);
    }
  }

  async function publicar() {
    if (!partido || !lado) return;
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 1) {
      onAviso("Poné un monto válido");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/apuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "publicar",
          liga: ligaId,
          partido: partido.id,
          fecha: diaISO(fecha),
          lado,
          monto: n,
        }),
      }).then((x) => x.json());

      if (r.ok) {
        onAviso(`Apuesta publicada · se te retuvieron ${fmt(n)}`);
        reiniciar();
        onCambio();
        traer();
        return;
      }
      const motivos: Record<string, string> = {
        saldo: "No te alcanzan las fichas",
        evento_cerrado: "Ese partido ya empezó",
        partido_desconocido: "Ese partido ya no está en la cartelera",
        monto_invalido: "El monto tiene que estar entre 1 y 100.000",
      };
      onAviso(motivos[r.motivo] ?? "No se pudo publicar");
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setPaso("tablero");
    setPartido(null);
    setLado(null);
    setBusqueda("");
  }

  // ---------- Flujo de publicación ----------
  if (paso !== "tablero") {
    const visibles = (partidos ?? [])
      .filter((p) => p.estado === "programado")
      .filter((p) => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return true;
        return (
          p.local.nombre.toLowerCase().includes(q) || p.visitante.nombre.toLowerCase().includes(q)
        );
      });

    return (
      <div className="am-flujo">
        <button
          className="am-volver"
          onClick={() => {
            if (paso === "monto") setPaso("lado");
            else if (paso === "lado") setPaso("partido");
            else reiniciar();
          }}
        >
          <Icono id="i-back" />
          Volver
        </button>

        {paso === "partido" && (
          <>
            <h3 className="am-titulo">¿Sobre qué partido?</h3>

            <div className="tb-deportes">
              {DEPORTES.map((d) => (
                <button
                  key={d}
                  className={d === deporte ? "on" : ""}
                  onClick={() => {
                    setDeporte(d);
                    const primera = LIGAS.find((l) => l.deporte === d);
                    if (primera) setLigaId(primera.id);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            {LIGAS.filter((l) => l.deporte === deporte).length > 1 && (
              <div className="tb-ligas">
                {LIGAS.filter((l) => l.deporte === deporte).map((l) => (
                  <button
                    key={l.id}
                    className={l.id === ligaId ? "on" : ""}
                    onClick={() => setLigaId(l.id)}
                  >
                    {l.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Solo de hoy en adelante: sobre un partido de ayer no se apuesta */}
            <div className="tb-dias">
              {[0, 1, 2].map((n) => {
                const d = new Date(hoy.getTime() + n * 86_400_000);
                return (
                  <button
                    key={n}
                    className={`tb-dia ${n === offset ? "on" : ""}`}
                    onClick={() => setOffset(n)}
                  >
                    <b>{etiquetaDia(d, hoy)}</b>
                    <span className="mono">
                      {new Intl.DateTimeFormat("es", {
                        day: "numeric",
                        month: "short",
                        timeZone: ZONA,
                      }).format(d)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="am-buscar">
              <Icono id="i-lupa" />
              <input
                type="search"
                placeholder="Buscar equipo…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="am-lista">
              {partidos === null ? (
                <p className="am-vacio">Cargando la cartelera…</p>
              ) : visibles.length === 0 ? (
                <p className="am-vacio">No hay partidos por empezar en este día.</p>
              ) : (
                visibles.map((p) => (
                  <button
                    key={p.id}
                    className="am-partido"
                    onClick={() => {
                      setPartido(p);
                      setPaso("lado");
                    }}
                  >
                    <span className="liga">{p.liga}</span>
                    <b>
                      {p.local.nombre} vs {p.visitante.nombre}
                    </b>
                    <span className="hora mono">{hora(p.comienzaAt)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {paso === "lado" && partido && (
          <>
            <h3 className="am-titulo">¿Con quién vas?</h3>
            <p className="am-sub">
              Al que la tome le toca el otro. Si empatan, cada uno recupera lo suyo.
            </p>
            <div className="am-lados">
              <button
                className={`am-lado ${lado === "local" ? "on" : ""}`}
                onClick={() => setLado("local")}
              >
                <span>Local {partido.local.dinero.precio ?? ""}</span>
                <b>{partido.local.nombre}</b>
              </button>
              <button
                className={`am-lado ${lado === "visitante" ? "on" : ""}`}
                onClick={() => setLado("visitante")}
              >
                <span>Visitante {partido.visitante.dinero.precio ?? ""}</span>
                <b>{partido.visitante.nombre}</b>
              </button>
            </div>
            <button className="bapostar" disabled={!lado} onClick={() => setPaso("monto")}>
              Seguir
            </button>
          </>
        )}

        {paso === "monto" && partido && lado && (
          <>
            <h3 className="am-titulo">¿Cuánto ponés?</h3>
            <p className="am-sub">
              El que la tome pone lo mismo. El ganador se lleva el pozo menos la comisión del 0,5%.
            </p>
            <div className="am-monto">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="am-rapidos">
              {[50, 100, 250, 500].map((n) => (
                <button
                  key={n}
                  onClick={() => setMonto(String(n))}
                  className={monto === String(n) ? "on" : ""}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="am-resumen">
              <div className="fila">
                <span>Vas con</span>
                <b>{lado === "local" ? partido.local.nombre : partido.visitante.nombre}</b>
              </div>
              <div className="fila">
                <span>Al que la tome le toca</span>
                <b>{lado === "local" ? partido.visitante.nombre : partido.local.nombre}</b>
              </div>
              <div className="fila total">
                <span>Si ganás, te llevás</span>
                <b className="mono">{fmt((Number(monto) || 0) * 2 * (1 - COMISION))}</b>
              </div>
            </div>
            <p className="ap-nota">
              Si nadie la toma antes de que empiece el partido, se te devuelve entera y sin
              comisión.
            </p>
            <button className="bapostar" disabled={enviando} onClick={publicar}>
              {enviando ? "Publicando…" : `Publicar y poner ${fmt(Number(monto) || 0)}`}
            </button>
          </>
        )}
      </div>
    );
  }

  // ---------- El tablero ----------
  return (
    <div className="ap">
      <button
        className="bapostar ap-publicar"
        onClick={() => {
          if (!usuario) {
            onAviso("Creá tu cuenta para publicar — te regalamos 1000 fichas");
            onEntrar();
            return;
          }
          setOffset(0);
          setPaso("partido");
        }}
      >
        Publicar una apuesta
      </button>

      {apuestas === null ? (
        <div className="svacio" style={{ padding: "44px 20px" }}>
          <p>Cargando el tablero…</p>
        </div>
      ) : apuestas.length === 0 ? (
        <div className="svacio" style={{ padding: "44px 20px" }}>
          <Icono id="i-slip" />
          <b>No hay nada publicado</b>
          <p>Publicá la primera: elegís un partido, un lado y cuánto ponés.</p>
        </div>
      ) : (
        apuestas.map((a) => {
          const suyo = a.lado === "local" ? a.evento.equipoA : a.evento.equipoB;
          const tuyo = a.lado === "local" ? a.evento.equipoB : a.evento.equipoA;
          const precioSuyo = a.lado === "local" ? a.linea?.local : a.linea?.visitante;
          const precioTuyo = a.lado === "local" ? a.linea?.visitante : a.linea?.local;
          const sinFichas = saldo !== null && saldo < a.monto;

          return (
            <article key={a.id} className={`ap-item ${a.esMia ? "mia" : ""}`}>
              <div className="ap-cab">
                <span className="am-avatar">{a.alias.slice(0, 2).toUpperCase()}</span>
                <b>{a.esMia ? "Tu apuesta" : `@${a.alias}`}</b>
                <span className="ap-cuando">
                  {a.evento.liga} · {hora(a.evento.comienzaAt)}
                </span>
                <b className="mono ap-monto">{fmt(a.monto)}</b>
              </div>

              <div className="ap-lados">
                <div className="ap-lado">
                  <span>{a.esMia ? "Vas con" : "Va con"}</span>
                  <b>{suyo}</b>
                  {precioSuyo && <span className="mono ap-precio">{precioSuyo}</span>}
                </div>
                <span className="ap-vs">vs</span>
                <div className="ap-lado tuyo">
                  <span>{a.esMia ? "Le toca" : "Te toca"}</span>
                  <b>{tuyo}</b>
                  {precioTuyo && <span className="mono ap-precio">{precioTuyo}</span>}
                </div>
              </div>

              {a.esMia ? (
                <button
                  className="ap-retirar"
                  disabled={ocupada === a.id}
                  onClick={() => retirar(a)}
                >
                  {ocupada === a.id ? "Retirando…" : "Retirar y recuperar las fichas"}
                </button>
              ) : (
                <button
                  className="bapostar ap-tomar"
                  disabled={ocupada === a.id || sinFichas}
                  onClick={() => tomar(a)}
                >
                  {ocupada === a.id
                    ? "Tomando…"
                    : sinFichas
                      ? `Te faltan fichas para tomarla`
                      : `Tomar con ${tuyo} · ${fmt(a.monto)}`}
                </button>
              )}
            </article>
          );
        })
      )}

      <p className="tb-fuente">
        Plata pareja: los dos ponen lo mismo. Pálpito cobra 0,5% del pozo, y solo cuando se juega.
        Los precios son la línea de la cartelera, para que veas qué lado te ofrecen; no cambian lo
        que pone cada uno.
      </p>
    </div>
  );
}
