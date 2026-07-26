"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import { CATEGORIAS, type EventoPoly } from "@/lib/polymarket";

// Polymarket dentro de Pálpito. Primera versión, para ir dándole forma.
//
// La gracia: acá el precio ES la probabilidad. Si "Yankees" está a 0,595, el
// mercado dice que ganan 6 de cada 10 veces. Se muestra como porcentaje y con
// una barra, que se lee de un vistazo y no necesita saber de cuotas.

const pct = (p: number) => `${Math.round(p * 100)}%`;

const plata = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${Math.round(n / 1000)}k`
      : `$${Math.round(n)}`;

export function Polymarket() {
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

          return (
            <article key={e.id} className="pm-evento">
              <header className="pm-cab">
                {e.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.imagen} alt="" className="pm-img" loading="lazy" />
                )}
                <div className="pm-titulo">
                  <h3>{e.titulo}</h3>
                  <span className="mono">{plata(e.volumen24h)} en 24 h</span>
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
