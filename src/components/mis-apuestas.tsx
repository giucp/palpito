"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import { useFormatoCuota } from "./formato-cuota";
import { fmt } from "@/lib/cupon";
import { cargarTickets, pickLegible, type LineaTicket, type Ticket } from "@/lib/apuestas";

const ETIQUETA: Record<string, string> = {
  abierta: "En juego",
  ganada: "Ganada",
  perdida: "Perdida",
  anulada: "Anulada",
};

const FILTROS = [
  { id: "todas", nombre: "Todas" },
  { id: "abierta", nombre: "En juego" },
  { id: "ganada", nombre: "Ganadas" },
  { id: "perdida", nombre: "Perdidas" },
] as const;

function fechaCorta(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Qué pasó con el partido de esta línea: por jugar, en curso o resultado final.
function estadoPartido(l: LineaTicket): { texto: string; clase: string } {
  if (l.estadoEvento === "finalizado" && l.marcadorA !== null && l.marcadorB !== null) {
    return { texto: `Final ${l.marcadorA} - ${l.marcadorB}`, clase: "fin" };
  }
  if (l.estadoEvento === "en_juego") return { texto: "En juego", clase: "vivo" };
  if (l.estadoEvento === "suspendido") return { texto: "Suspendido", clase: "" };
  const inicio = l.comienzaAt ? new Date(l.comienzaAt) : null;
  if (inicio && inicio.getTime() < Date.now()) return { texto: "Empezó", clase: "vivo" };
  return { texto: inicio ? `Juega ${fechaCorta(l.comienzaAt)}` : "Por jugar", clase: "" };
}

function marcaLinea(estado: string) {
  if (estado === "ganada") return "✓";
  if (estado === "perdida") return "✕";
  if (estado === "anulada") return "—";
  return "•";
}

export function MisApuestas({ usuario }: { usuario: { email: string } | null }) {
  const { fc } = useFormatoCuota();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filtro, setFiltro] = useState<string>("todas");
  const [abierto, setAbierto] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!usuario) return;
    let activo = true;
    cargarTickets().then((t) => {
      if (activo) setTickets(t);
    });
    return () => {
      activo = false;
    };
  }, [usuario]);

  const toggle = (id: string) =>
    setAbierto((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>Entra para ver tus apuestas</b>
        <p>Crea tu cuenta y recibe 1000 fichas de prueba de regalo.</p>
      </div>
    );
  }

  if (tickets === null) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <p>Cargando…</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-slip" />
        <b>Aún no tienes apuestas</b>
        <p>Toca una cuota en el lobby para armar tu primer cupón.</p>
      </div>
    );
  }

  const visibles = filtro === "todas" ? tickets : tickets.filter((t) => t.estado === filtro);
  const cuenta = (id: string) =>
    id === "todas" ? tickets.length : tickets.filter((t) => t.estado === id).length;

  return (
    <>
      <div className="filtros">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            className={filtro === f.id ? "on" : ""}
            onClick={() => setFiltro(f.id)}
          >
            {f.nombre}
            <span className="fc mono">{cuenta(f.id)}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="svacio" style={{ padding: "48px 20px" }}>
          <b>Nada por aquí</b>
          <p>No tienes apuestas en este estado.</p>
        </div>
      ) : (
        visibles.map((t) => {
          const abre = abierto.has(t.id);
          const cobro =
            t.estado === "ganada"
              ? t.gananciaPosible
              : t.estado === "anulada"
                ? t.monto
                : t.gananciaPosible;
          return (
            <div key={t.id} className={`tk ${t.estado}`}>
              <button className="tk-head" onClick={() => toggle(t.id)} aria-expanded={abre}>
                <span className="tk-tipo">
                  {t.tipo === "combinada"
                    ? `Combinada · ${t.lineas.length} selecciones`
                    : "Simple"}
                </span>
                <span className={`st ${t.estado}`}>{ETIQUETA[t.estado] ?? t.estado}</span>
                <Icono id="i-chev" className="tk-chev" />
              </button>

              <div className="tk-fecha">
                {fechaCorta(t.creadaAt)} · Ticket #{t.id.slice(0, 8)}
              </div>

              {t.lineas.map((l) => {
                const ep = estadoPartido(l);
                return (
                  <div key={l.id} className={`tk-linea ${l.estado}`}>
                    <span className={`marca ${l.estado}`}>{marcaLinea(l.estado)}</span>
                    <div className="tk-info">
                      <div className="tk-partido">
                        {l.equipoA} <i>vs</i> {l.equipoB}
                      </div>
                      <div className="tk-pick">
                        <span className="mk">{l.mercado}:</span> {pickLegible(l)}
                      </div>
                      {abre && (
                        <div className="tk-extra">
                          <span className="lg">{l.liga}</span>
                          <span className={`ev ${ep.clase}`}>{ep.texto}</span>
                        </div>
                      )}
                    </div>
                    <span className="tk-cuota mono">{fc(l.cuota)}</span>
                  </div>
                );
              })}

              <div className="tk-pie">
                <span className="mi">
                  Apostado<b className="mono">{fmt(t.monto)}</b>
                </span>
                <span className="mi">
                  Cuota<b className="mono">{fc(t.cuotaTotal)}</b>
                </span>
                <span className={`mi ${t.estado === "ganada" ? "gan" : ""}`}>
                  {t.estado === "ganada"
                    ? "Pagado"
                    : t.estado === "perdida"
                      ? "Perdido"
                      : t.estado === "anulada"
                        ? "Devuelto"
                        : "A ganar"}
                  <b className="mono">{t.estado === "perdida" ? fmt(0) : fmt(cobro)}</b>
                </span>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
