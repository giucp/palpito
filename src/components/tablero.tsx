"use client";

import { useEffect, useMemo, useState } from "react";
import { Icono } from "./iconos";
import { LIGAS, type PartidoTablero } from "@/lib/tablero";

// La cartelera: todos los partidos del día con sus líneas, solo para mirar.
//
// Tres columnas por equipo, como en cualquier cartelera: dinero, hándicap y
// total. El número grande es la línea y el chico, el precio. No hay botones
// para apostar a propósito: acá se mira, no se juega.

const ZONA = "America/Caracas";

const DEPORTES = [...new Set(LIGAS.map((l) => l.deporte))];

const diaISO = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

function etiquetaDia(d: Date, hoy: Date): string {
  const dif = Math.round(
    (new Date(diaISO(d)).getTime() - new Date(diaISO(hoy)).getTime()) / 86_400_000
  );
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Mañana";
  if (dif === -1) return "Ayer";
  return new Intl.DateTimeFormat("es", { weekday: "short", timeZone: ZONA })
    .format(d)
    .replace(".", "");
}

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA,
  }).format(new Date(iso));

// Una celda: número grande arriba, precio abajo. Vacía si la casa no la ofrece.
function Celda({ valor, precio }: { valor: string | null; precio: string | null }) {
  if (!valor && !precio) return <div className="tb-celda vacia">—</div>;
  return (
    <div className="tb-celda">
      <b className="mono">{valor ?? precio}</b>
      {valor && precio && <span className="mono">{precio}</span>}
    </div>
  );
}

function Fila({ p }: { p: PartidoTablero }) {
  const terminado = p.estado === "final";
  const enJuego = p.estado === "en_juego";

  const lado = (l: PartidoTablero["local"], esLocal: boolean) => (
    <div className={`tb-lado ${terminado && !l.ganador ? "cayo" : ""}`}>
      <div className="tb-equipo">
        {l.escudo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.escudo} alt="" className="tb-escudo" loading="lazy" />
        ) : (
          <span className="tb-escudo hueco">{l.abrev.slice(0, 2)}</span>
        )}
        <span className="tb-nombre">{l.nombre}</span>
        {(terminado || enJuego) && l.marcador !== null && (
          <b className="tb-marcador mono">{l.marcador}</b>
        )}
      </div>
      <Celda {...l.dinero} />
      <Celda {...l.handicap} />
      <Celda {...l.total} />
      <span className="tb-sr">{esLocal ? "local" : "visitante"}</span>
    </div>
  );

  return (
    <article className="tb-partido">
      {lado(p.visitante, false)}
      {lado(p.local, true)}
      <div className="tb-pie">
        <span className={`tb-cuando ${enJuego ? "vivo" : ""}`}>
          {terminado ? "Final" : enJuego ? p.detalle || "En juego" : hora(p.comienzaAt)}
        </span>
      </div>
    </article>
  );
}

export function Tablero() {
  const hoy = useMemo(() => new Date(), []);
  const [deporte, setDeporte] = useState(DEPORTES[0]);
  const [ligaId, setLigaId] = useState(LIGAS[0].id);
  const [offset, setOffset] = useState(0);
  // Lo traído se guarda junto con la clave de lo que se pidió. Así "cargando"
  // se deduce al pintar (lo que hay no corresponde a lo que se está mirando) y
  // no hace falta tocar el estado al empezar cada búsqueda.
  const [datos, setDatos] = useState<{ clave: string; partidos: PartidoTablero[] } | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const ligasDelDeporte = useMemo(
    () => LIGAS.filter((l) => l.deporte === deporte),
    [deporte]
  );

  const fecha = useMemo(() => new Date(hoy.getTime() + offset * 86_400_000), [hoy, offset]);

  const clave = `${ligaId}|${diaISO(fecha)}`;

  useEffect(() => {
    let vivo = true;
    const [liga, dia] = clave.split("|");
    (async () => {
      try {
        const r = await fetch(`/api/tablero?liga=${liga}&fecha=${dia}`).then((x) => x.json());
        if (vivo) setDatos({ clave, partidos: r.ok ? r.partidos : [] });
      } catch {
        if (vivo) setDatos({ clave, partidos: [] });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  const partidos = datos?.clave === clave ? datos.partidos : null;

  const visibles = useMemo(() => {
    if (!partidos) return null;
    const q = busqueda.trim().toLowerCase();
    if (!q) return partidos;
    return partidos.filter(
      (p) =>
        p.local.nombre.toLowerCase().includes(q) || p.visitante.nombre.toLowerCase().includes(q)
    );
  }, [partidos, busqueda]);

  return (
    <div className="tb">
      {/* Deportes */}
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

      {/* Ligas del deporte elegido */}
      {ligasDelDeporte.length > 1 && (
        <div className="tb-ligas">
          {ligasDelDeporte.map((l) => (
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

      {/* Días */}
      <div className="tb-dias">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Día anterior">
          <Icono id="i-back" />
        </button>
        {[-1, 0, 1].map((n) => {
          const d = new Date(hoy.getTime() + (offset + n) * 86_400_000);
          return (
            <button
              key={n}
              className={`tb-dia ${n === 0 ? "on" : ""}`}
              onClick={() => setOffset((o) => o + n)}
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
        <button onClick={() => setOffset((o) => o + 1)} aria-label="Día siguiente">
          <Icono id="i-arr" />
        </button>
      </div>

      <div className="tb-buscar">
        <Icono id="i-lupa" />
        <input
          type="search"
          placeholder="Buscar equipo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Encabezado de columnas */}
      <div className="tb-cabecera">
        <span />
        <span>Dinero</span>
        <span>Hándicap</span>
        <span>Total</span>
      </div>

      {visibles === null ? (
        <div className="svacio" style={{ padding: "48px 20px" }}>
          <p>Cargando la cartelera…</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="svacio" style={{ padding: "48px 20px" }}>
          <Icono id="i-slip" />
          <b>Nada por acá</b>
          <p>No hay partidos de esta liga en el día elegido.</p>
        </div>
      ) : (
        visibles.map((p) => <Fila key={p.id} p={p} />)
      )}

      <p className="tb-fuente">
        Cartelera y líneas de ESPN · DraftKings. Es solo para mirar: en Pálpito se juega contra
        tus amigos, no contra la casa.
      </p>
    </div>
  );
}
