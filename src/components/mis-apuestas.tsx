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

// Cuántas líneas se ven sin desplegar. Una simple o una combinada corta se leen
// enteras de un vistazo; recién a partir de ahí conviene esconder algo.
const LINEAS_A_LA_VISTA = 3;

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
    return { texto: `Final ${l.marcadorA} — ${l.marcadorB}`, clase: "fin" };
  }
  if (l.estadoEvento === "en_juego") return { texto: "En juego", clase: "vivo" };
  if (l.estadoEvento === "suspendido") return { texto: "Suspendido", clase: "" };
  const inicio = l.comienzaAt ? new Date(l.comienzaAt) : null;
  if (inicio && inicio.getTime() < Date.now()) return { texto: "Empezó", clase: "vivo" };
  return { texto: inicio ? fechaCorta(l.comienzaAt) : "Por jugar", clase: "" };
}

// El renglón que cierra el ticket. Antes, una apuesta perdida decía
// "Perdido $0.00": la etiqueta hablaba de la pérdida y el número, de lo que te
// pagaron. Dos significados en el mismo lugar. Ahora el número siempre es plata
// que se movió, con su signo: si perdiste, lo que perdiste.
function desenlace(t: Ticket): { etiqueta: string; monto: string; tono: string } {
  if (t.estado === "ganada")
    return { etiqueta: "Cobraste", monto: fmt(t.gananciaPosible), tono: "gano" };
  if (t.estado === "perdida")
    return { etiqueta: "Perdiste", monto: `−${fmt(t.monto)}`, tono: "perdio" };
  if (t.estado === "anulada")
    return { etiqueta: "Devuelto", monto: fmt(t.monto), tono: "" };
  return { etiqueta: "A cobrar", monto: fmt(t.gananciaPosible), tono: "" };
}

export function MisApuestas({ usuario }: { usuario: { email: string } | null }) {
  const { fc, formato } = useFormatoCuota();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filtro, setFiltro] = useState<string>("todas");
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [compartiendo, setCompartiendo] = useState<string | null>(null);

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

  // Comparte el ticket como imagen. La imagen se dibuja en el servidor y se
  // adjunta con la API de compartir del teléfono, que es la única forma de que
  // WhatsApp reciba el archivo y no solo un enlace. Si el navegador no puede
  // (escritorio, sobre todo), se manda el texto solo.
  async function compartir(t: Ticket) {
    const d = desenlace(t);
    const resumen =
      t.tipo === "combinada" ? `Combinada de ${t.lineas.length}` : "Apuesta simple";
    const encabezado =
      t.estado === "ganada"
        ? "Mirá este ticket que entró."
        : t.estado === "abierta"
          ? "Mirá lo que tengo en juego."
          : "Mirá mi ticket.";
    const texto = `${encabezado}\n${resumen} · ${fmt(t.monto)} a cuota ${fc(t.cuotaTotal)} · ${d.etiqueta} ${d.monto}\nPálpito`;

    setCompartiendo(t.id);
    try {
      const res = await fetch(`/api/ticket/${t.id}?formato=${formato}`);
      if (res.ok && typeof navigator !== "undefined" && navigator.canShare) {
        const blob = await res.blob();
        const archivo = new File([blob], `ticket-${t.id.slice(0, 8)}.png`, {
          type: "image/png",
        });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: texto });
          return;
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    } catch {
      // Cancelar el diálogo de compartir también entra por acá: no es un error.
    } finally {
      setCompartiendo(null);
    }
  }

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
          <button key={f.id} className={filtro === f.id ? "on" : ""} onClick={() => setFiltro(f.id)}>
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
          const ocultas = Math.max(0, t.lineas.length - LINEAS_A_LA_VISTA);
          const lineas = abre || ocultas === 0 ? t.lineas : t.lineas.slice(0, LINEAS_A_LA_VISTA);
          const d = desenlace(t);

          return (
            <article key={t.id} className={`tk ${t.estado}`}>
              <header className="tk-top">
                <div className="tk-meta">
                  <span className="tk-tipo">
                    {t.tipo === "combinada"
                      ? `Combinada · ${t.lineas.length} selecciones`
                      : "Apuesta simple"}
                  </span>
                  <span className="tk-fecha mono">{fechaCorta(t.creadaAt)}</span>
                </div>
                <span className={`tk-estado ${t.estado}`}>
                  <i aria-hidden="true" />
                  {ETIQUETA[t.estado] ?? t.estado}
                </span>
              </header>

              <ol className="tk-lineas">
                {lineas.map((l) => {
                  const ep = estadoPartido(l);
                  return (
                    <li key={l.id} className={`tk-linea ${l.estado}`}>
                      <span className={`tk-marca ${l.estado}`}>
                        <Icono
                          id={
                            l.estado === "ganada"
                              ? "i-check"
                              : l.estado === "perdida"
                                ? "i-x"
                                : "i-menos"
                          }
                        />
                      </span>

                      <div className="tk-cuerpo">
                        <p className="tk-liga">{l.liga}</p>
                        <h3 className="tk-partido">
                          {l.equipoA} <i>vs</i> {l.equipoB}
                        </h3>
                        <p className="tk-pick">
                          <span className="mk">{l.mercado}</span>
                          <b>{pickLegible(l)}</b>
                        </p>
                        <p className={`tk-ev ${ep.clase}`}>{ep.texto}</p>
                      </div>

                      <span className="tk-cuota mono">{fc(l.cuota)}</span>
                    </li>
                  );
                })}
              </ol>

              {ocultas > 0 && (
                <button className="tk-mas" onClick={() => toggle(t.id)} aria-expanded={abre}>
                  {abre ? "Ver menos" : `Ver las otras ${ocultas}`}
                  <Icono id="i-chev" className={abre ? "gira" : ""} />
                </button>
              )}

              <footer className="tk-pie">
                <div className="tk-dato">
                  <span>Apostado</span>
                  <b className="mono">{fmt(t.monto)}</b>
                </div>
                <div className="tk-dato">
                  <span>Cuota</span>
                  <b className="mono">{fc(t.cuotaTotal)}</b>
                </div>
                <div className={`tk-dato res ${d.tono}`}>
                  <span>{d.etiqueta}</span>
                  <b className="mono">{d.monto}</b>
                </div>
              </footer>

              <div className="tk-acciones">
                <button
                  className="tk-compartir"
                  onClick={() => compartir(t)}
                  disabled={compartiendo === t.id}
                >
                  <Icono id="i-compartir" />
                  {compartiendo === t.id ? "Preparando…" : "Compartir"}
                </button>
                <span className="tk-id mono">#{t.id.slice(0, 8)}</span>
              </div>
            </article>
          );
        })
      )}
    </>
  );
}
