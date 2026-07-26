"use client";

import { useEffect, useMemo, useState } from "react";
import { Icono } from "./iconos";
import { CATEGORIAS, type EventoPoly } from "@/lib/polymarket";

// Polymarket dentro de Pálpito. Primera versión, para ir dándole forma.
//
// La gracia: acá el precio ES la probabilidad. Si "Yankees" está a 0,595, el
// mercado dice que ganan 6 de cada 10 veces. Se muestra como porcentaje y con
// una barra, que se lee de un vistazo y no necesita saber de cuotas.
//
// El orden lo pone `lib/polymarket.ts`, igual que la cartelera: en vivo, por
// jugar, temporada y al final los terminados. Acá cada tarjeta **dice en qué
// está**, que es lo que faltaba: antes uno se daba cuenta de que un partido
// había terminado solo porque veía 100% y 0%.

const ZONA = "America/Caracas";
const pct = (p: number) => `${Math.round(p * 100)}%`;

const diaISO = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

// "Hoy 19:00", "Mañana 15:30", "Lun 14:00"
function cuando(iso: string, hoy: Date): string {
  const f = new Date(iso);
  const hora = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).format(f);

  const dia = diaISO(f);
  if (dia === diaISO(hoy)) return `Hoy ${hora}`;
  if (dia === diaISO(new Date(hoy.getTime() + 86_400_000))) return `Mañana ${hora}`;

  const nombre = new Intl.DateTimeFormat("es", { weekday: "short", timeZone: ZONA })
    .format(f)
    .replace(".", "");
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${hora}`;
}

// Qué dice la tarjeta de sí misma. Los de temporada no dicen nada: no tienen
// partido, así que les alcanza con el volumen que ya muestran.
function estadoTexto(e: EventoPoly, hoy: Date): string | null {
  if (e.estado === "en_juego") {
    return ["En vivo", e.periodo, e.marcador].filter(Boolean).join(" · ");
  }
  if (e.estado === "terminado") {
    // El período al terminar trae "VFT" o "FT", que no se le dice a nadie.
    return ["Final", e.marcador].filter(Boolean).join(" · ");
  }
  if (e.estado === "por_jugar" && e.arrancaAt) return cuando(e.arrancaAt, hoy);
  return null;
}

const plata = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${Math.round(n / 1000)}k`
      : `$${Math.round(n)}`;

export function Polymarket() {
  // Una sola lectura del reloj por montaje: alcanza para decir "Hoy" o "Mañana"
  // y no ensucia el render con una función impura.
  const hoy = useMemo(() => new Date(), []);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0].id);
  // Igual que en la cartelera: lo traído se guarda con la categoría que se pidió,
  // así "cargando" se deduce al pintar en vez de tocar el estado al empezar.
  const [datos, setDatos] = useState<{ clave: string; eventos: EventoPoly[] } | null>(null);
  const [abierto, setAbierto] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/polymarket?categoria=${categoria}`).then((x) => x.json());
        if (vivo) setDatos({ clave: categoria, eventos: r.ok ? r.eventos : [] });
      } catch {
        if (vivo) setDatos({ clave: categoria, eventos: [] });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [categoria]);

  const eventos = datos?.clave === categoria ? datos.eventos : null;

  const alternar = (id: string) =>
    setAbierto((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  return (
    <div className="pm">
      <div className="tb-ligas">
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            className={c.id === categoria ? "on" : ""}
            onClick={() => setCategoria(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {eventos === null ? (
        <div className="svacio" style={{ padding: "48px 20px" }}>
          <p>Cargando mercados…</p>
        </div>
      ) : eventos.length === 0 ? (
        <div className="svacio" style={{ padding: "48px 20px" }}>
          <b>Sin mercados abiertos</b>
          <p>Probá con otra categoría.</p>
        </div>
      ) : (
        eventos.map((e) => {
          const abre = abierto.has(e.id);
          const mercados = abre ? e.mercados : e.mercados.slice(0, 3);
          const ocultos = e.mercados.length - mercados.length;
          const estado = estadoTexto(e, hoy);

          return (
            <article key={e.id} className={`pm-evento ${e.estado}`}>
              <header className="pm-cab">
                {e.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.imagen} alt="" className="pm-img" loading="lazy" />
                )}
                <div className="pm-titulo">
                  <h3>{e.titulo}</h3>
                  <span className="pm-pie">
                    {estado && (
                      <b className="pm-estado">
                        {e.estado === "en_juego" && <i className="pm-pulso" aria-hidden="true" />}
                        {estado}
                      </b>
                    )}
                    <span className="mono">{plata(e.volumen24h)} en 24 h</span>
                  </span>
                </div>
              </header>

              {mercados.map((m) => {
                const vistas = m.opciones.slice(0, 4);
                // El color se decide comparando las opciones entre ellas, acá en
                // la pantalla: **no se toca ni un dato de Polymarket**. La más
                // probable va en lima y la menos probable en rojo, que es como se
                // lee de un vistazo en un mercado de dos opciones. Si empatan no
                // hay roja, porque ninguna es "la menor".
                const probables = vistas.map((o) => o.probabilidad);
                const mayor = Math.max(...probables);
                const menor = Math.min(...probables);

                return (
                  <div key={m.id} className="pm-mercado">
                    <p className="pm-pregunta">{m.pregunta}</p>
                    {vistas.map((o) => {
                      // Con tres o más opciones las del medio quedan neutras: la
                      // regla que pidió el dueño habla de la mayor y la menor.
                      const tono =
                        mayor === menor
                          ? ""
                          : o.probabilidad === mayor
                            ? ""
                            : o.probabilidad === menor
                              ? "baja"
                              : "media";
                      return (
                        <div key={o.nombre} className="pm-opcion">
                          <span className="pm-nombre">{o.nombre}</span>
                          <div className="pm-barra">
                            <i
                              className={tono}
                              style={{ width: `${Math.max(2, o.probabilidad * 100)}%` }}
                            />
                          </div>
                          <b className={`mono ${tono}`}>{pct(o.probabilidad)}</b>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {(ocultos > 0 || abre) && (
                <button className="tk-mas" onClick={() => alternar(e.id)} aria-expanded={abre}>
                  {abre ? "Ver menos" : `Ver los otros ${ocultos}`}
                  <Icono id="i-chev" className={abre ? "gira" : ""} />
                </button>
              )}
            </article>
          );
        })
      )}

      <p className="tb-fuente">
        Mercados de Polymarket. El precio de cada opción es su probabilidad: lo que paga la gente
        que puso plata, no lo que dice una casa de apuestas.
      </p>
    </div>
  );
}
