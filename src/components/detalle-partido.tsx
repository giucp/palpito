"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import type { PartidoTablero } from "@/lib/tablero";
import type { ResumenPartido } from "@/lib/resumen-partido";

// Lo que se ve al tocar un partido de la cartelera.
//
// Dos reglas mandan acá:
//
// 1. **La cabeza cambia con el estado, el cuerpo no.** Sin empezar arriba va el
//    pronóstico; en vivo, cómo va y lo que pasó; terminado, cómo se anotó.
//    Debajo, siempre lo mismo: entre ellos, bajas, sede. Ese cuerpo es el que
//    hace que nunca haya una pantalla vacía.
//
// 2. **Un bloque sin datos no se dibuja.** ESPN no manda lo mismo para cada
//    deporte ni para cada estado: un partido sin empezar no tiene números, uno
//    en vivo no tiene carreras por inning, uno terminado no tiene la forma
//    reciente. Nada de huecos ni de "cargando" esperando algo que no va a
//    llegar: si no está, el bloque no existe y el de abajo sube.
//
// El marcador se pinta al instante con lo que ya trae la cartelera, así que la
// pantalla nunca arranca en blanco aunque el resumen tarde o no llegue nunca.

const ZONA = "America/Caracas";

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA,
  }).format(new Date(iso));

type Props = {
  ligaId: string;
  partido: PartidoTablero;
  onVolver: () => void;
};

export function DetallePartido({ ligaId, partido, onVolver }: Props) {
  const [resumen, setResumen] = useState<ResumenPartido | null>(null);
  const [listo, setListo] = useState(false);
  // Sube con cada refresco. Va aparte del partido para que volver a pedir no
  // borre lo que ya está en pantalla.
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/partido?liga=${ligaId}&partido=${partido.id}`).then((x) =>
          x.json()
        );
        if (vivo) {
          setResumen(r.ok ? (r.resumen as ResumenPartido) : null);
          setListo(true);
        }
      } catch {
        if (vivo) setListo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ligaId, partido.id, vuelta]);

  // El marcador de arriba manda el resumen, no la cartelera.
  //
  // Los dos traen marcador y estado, pero la cartelera es una foto de cuando se
  // cargó y el resumen se acaba de pedir. Usando la foto pasaba lo peor: arriba
  // "HT 0-0" y justo debajo dos goles y el final del partido, la misma pantalla
  // contradiciéndose. Mientras el resumen no llegó se usa la cartelera, que
  // para eso está: que nunca haya un hueco.
  const estado = resumen?.estado ?? partido.estado;
  const detalle = resumen?.detalle || partido.detalle;
  const enJuego = estado === "en_juego";
  const terminado = estado === "final";

  const ladosDelPartido = [
    { deTablero: partido.visitante, delResumen: resumen?.visita },
    { deTablero: partido.local, delResumen: resumen?.local },
  ];

  // Con el partido en juego esto se pide solo cada 30 s, como la cartelera: si
  // no, abrís un partido en vivo, te quedás mirando y la pantalla se congela en
  // el momento en que entraste. Un partido terminado no cambia más, así que ahí
  // no se pide nada. También se para con la pantalla en segundo plano.
  useEffect(() => {
    if (!enJuego) return;
    const refrescar = () => {
      if (!document.hidden) setVuelta((v) => v + 1);
    };
    const tic = setInterval(refrescar, 30_000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      clearInterval(tic);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [enJuego]);

  // Qué entra en la línea de tiempo cuando no entra todo.
  //
  // Recortar por "los últimos" a secas no sirve: un partido de fútbol tiene
  // siete cambios sobre el final y empujarían los goles fuera de la lista. Los
  // goles y los jonrones se quedan siempre; el resto rellena con lo más
  // reciente, y al final se vuelve al orden del partido.
  const hitos = resumen?.hitos ?? [];
  const TOPE = 9;
  let hitosVisibles = hitos;
  if (hitos.length > TOPE) {
    // Orden de importancia: primero lo decisivo, después las tarjetas y los
    // penales, y al final los cambios. En un 0-0 con siete cambios sobre la
    // hora, sin esto la lista entera eran cambios.
    const rango = (h: (typeof hitos)[number]) =>
      h.decisivo ? 0 : h.que.startsWith("Cambio") ? 2 : 1;
    const entran = new Set(
      [...hitos]
        .map((h, i) => ({ h, i }))
        .sort((a, b) => rango(a.h) - rango(b.h) || b.i - a.i)
        .slice(0, TOPE)
        .map((x) => x.h)
    );
    hitosVisibles = hitos.filter((h) => entran.has(h));
  }

  return (
    <div className="dp">
      <div className="dp-barra">
        <button className="am-volver" onClick={onVolver}>
          <Icono id="i-back" />
          Volver
        </button>
        <span className="dp-liga">{partido.liga}</span>
      </div>

      {/* Marcador: la cartelera lo pinta al instante y el resumen lo corrige */}
      <div className="dp-marcador">
        {ladosDelPartido.map(({ deTablero, delResumen }, i) => {
          const marcador = delResumen?.marcador ?? deTablero.marcador;
          const perdio = terminado && !(delResumen?.ganador ?? deTablero.ganador);
          return (
            <div key={i} className={`dp-equipo ${perdio ? "cayo" : ""}`}>
              {deTablero.escudo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deTablero.escudo} alt="" className="dp-escudo" loading="lazy" />
              ) : (
                <span className="dp-escudo hueco">{deTablero.abrev.slice(0, 2)}</span>
              )}
              <span className="dp-nom">
                <b>{deTablero.nombre}</b>
                {delResumen?.record && <span className="mono">{delResumen.record}</span>}
              </span>
              {estado === "programado" ? (
                <span className="dp-pts pendiente mono">{deTablero.dinero.precio ?? "—"}</span>
              ) : (
                <b className="dp-pts mono">{marcador ?? "—"}</b>
              )}
            </div>
          );
        })}

        <div className="dp-pie">
          {enJuego && <i className="tb-pulso" aria-hidden="true" />}
          <span className={enJuego ? "vivo" : ""}>
            {terminado ? "Final" : enJuego ? detalle || "En juego" : hora(partido.comienzaAt)}
          </span>
          {resumen?.sede && <span>· {resumen.sede}</span>}
          {resumen?.publico ? (
            <span className="mono">· {resumen.publico.toLocaleString("es")} personas</span>
          ) : null}
        </div>
      </div>

      {/* ---------- CABEZA: cambia según el momento del partido ---------- */}

      {resumen?.pronostico && (
        <Bloque titulo="Quién la lleva" destacado>
          <Barras
            local={{ nombre: resumen.local.nombre, valor: resumen.pronostico.local }}
            visita={{ nombre: resumen.visita.nombre, valor: resumen.pronostico.visita }}
            nota="Pronóstico de ESPN, no de Pálpito."
          />
        </Bloque>
      )}

      {resumen?.probabilidadLocal !== null && resumen?.probabilidadLocal !== undefined && (
        <Bloque titulo="Cómo va" destacado>
          <Barras
            local={{ nombre: resumen.local.nombre, valor: resumen.probabilidadLocal }}
            visita={{ nombre: resumen.visita.nombre, valor: 100 - resumen.probabilidadLocal }}
            nota="Se mueve con cada jugada."
          />
        </Bloque>
      )}

      {resumen?.situacion && (
        <Bloque titulo="En el plato" destacado>
          <div className="dp-sit">
            <div className="dp-cuenta">
              <span className="dp-dato">
                <span>Cuenta</span>
                <b className="mono">
                  {resumen.situacion.bolas}-{resumen.situacion.strikes}
                </b>
              </span>
              <span className="dp-dato">
                <span>Outs</span>
                <b className="mono">{resumen.situacion.outs}</b>
              </span>
              <Diamante bases={resumen.situacion.bases} />
            </div>
            <div className="dp-duelo">
              {resumen.situacion.lanzador && (
                <div className="dp-quien">
                  <span>Lanza</span>
                  <span>
                    <b>{resumen.situacion.lanzador}</b>
                    {resumen.situacion.lanzadorLinea && (
                      <i className="mono">{resumen.situacion.lanzadorLinea}</i>
                    )}
                  </span>
                </div>
              )}
              {resumen.situacion.bateador && (
                <div className="dp-quien">
                  <span>Batea</span>
                  <span>
                    <b>{resumen.situacion.bateador}</b>
                    {resumen.situacion.bateadorLinea && (
                      <i className="mono">{resumen.situacion.bateadorLinea}</i>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Bloque>
      )}

      {hitosVisibles.length > 0 && (
        <Bloque titulo={terminado ? "Cómo se anotó" : "Lo que va pasando"} destacado>
          <div className="dp-tiempo">
            {hitosVisibles.map((h, i) => (
              <div key={i} className={`dp-hito ${h.decisivo ? "gira" : ""}`}>
                <span className="dp-min mono">{h.cuando}</span>
                <span className="dp-que">
                  <b>{h.que}</b>
                  {h.quien && <span>{h.quien}</span>}
                </span>
                {h.va && <span className="dp-va mono">{h.va}</span>}
              </div>
            ))}
          </div>
          {hitos.length > hitosVisibles.length && (
            <p className="dp-nota">Se muestran las últimas {hitosVisibles.length}.</p>
          )}
        </Bloque>
      )}

      {resumen?.innings && (
        <Bloque titulo="Carreras por inning">
          <div className="dp-innings">
            <table>
              <tbody>
                <tr>
                  <th />
                  {resumen.innings.visita.map((_, i) => (
                    <th key={i}>{i + 1}</th>
                  ))}
                  <th className="tot">R</th>
                </tr>
                {(
                  [
                    [partido.visitante.abrev, resumen.innings.visita, resumen.visita.marcador],
                    [partido.local.abrev, resumen.innings.local, resumen.local.marcador],
                  ] as const
                ).map(([abrev, carreras, total]) => (
                  <tr key={abrev}>
                    <td>{abrev}</td>
                    {carreras.map((c, i) => (
                      <td key={i}>{c ?? "—"}</td>
                    ))}
                    <td className="tot">{total ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}

      {/* ---------- CUERPO: lo que está siempre ---------- */}

      {resumen && resumen.numeros.length > 0 && (
        <Bloque titulo="El partido en números">
          <div className="dp-comp">
            <div className="dp-fila cab">
              <b>{partido.visitante.abrev}</b>
              <span />
              <b>{partido.local.abrev}</b>
            </div>
            {resumen.numeros.map((n) => {
              const v = parseFloat(n.visita);
              const l = parseFloat(n.local);
              const gv = !Number.isNaN(v) && !Number.isNaN(l) && v > l;
              const gl = !Number.isNaN(v) && !Number.isNaN(l) && l > v;
              return (
                <div key={n.etiqueta} className="dp-fila">
                  <b className={gv ? "gana" : ""}>{n.visita}</b>
                  <span>{n.etiqueta}</span>
                  <b className={gl ? "gana" : ""}>{n.local}</b>
                </div>
              );
            })}
          </div>
        </Bloque>
      )}

      {resumen && resumen.forma.length > 0 && (
        <Bloque titulo="Cómo vienen">
          <div className="dp-forma">
            {resumen.forma.map((f) => (
              <div key={f.equipo} className="dp-eq">
                <b>{f.equipo}</b>
                <span className="dp-racha">
                  {f.juegos.map((g, i) => (
                    <i key={i} className={g === "G" ? "g" : g === "P" ? "p" : ""}>
                      {g}
                    </i>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {resumen && resumen.bajas.length > 0 && (
        <Bloque titulo="Bajas">
          <div className="dp-bajas">
            {resumen.bajas.map((b) => (
              <div key={b.equipo}>
                <b>
                  {b.equipo} · {b.cuantos}
                </b>
                <p>
                  {b.quienes.join(", ")}
                  {b.cuantos > b.quienes.length && ` y ${b.cuantos - b.quienes.length} más`}
                </p>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {resumen && (resumen.serie || resumen.linea) && (
        <Bloque titulo="Entre ellos">
          <div className="dp-datos">
            {resumen.serie && (
              <div className="dp-d">
                <span>Serie</span>
                <b>{resumen.serie}</b>
              </div>
            )}
            {resumen.linea && (
              <div className="dp-d">
                <span>Línea</span>
                <b className="mono">
                  {partido.visitante.abrev} {resumen.linea.visita} · {partido.local.abrev}{" "}
                  {resumen.linea.local}
                </b>
              </div>
            )}
          </div>
        </Bloque>
      )}

      {!listo && <p className="dp-nota centro">Buscando el resumen…</p>}
      {listo && !resumen && (
        <p className="dp-nota centro">ESPN no tiene resumen de este partido.</p>
      )}

      <p className="tb-fuente">Datos de ESPN. Acá se mira: para apostar, publicá en Apuestas.</p>
    </div>
  );
}

function Bloque({
  titulo,
  destacado,
  children,
}: {
  titulo: string;
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`dp-bloque ${destacado ? "cabeza" : ""}`}>
      <h4>{titulo}</h4>
      {children}
    </section>
  );
}

// Dos barras enfrentadas: la que va ganando en lima, la otra apagada.
function Barras({
  local,
  visita,
  nota,
}: {
  local: { nombre: string; valor: number };
  visita: { nombre: string; valor: number };
  nota: string;
}) {
  const orden = local.valor >= visita.valor ? [local, visita] : [visita, local];
  return (
    <div className="dp-prono">
      {orden.map((x, i) => (
        <div key={x.nombre}>
          <div className="dp-par">
            <b>{x.nombre}</b>
            <span className="mono">{Math.round(x.valor)}%</span>
          </div>
          <div className="dp-riel">
            <i className={i === 1 ? "flojo" : ""} style={{ width: `${Math.max(2, x.valor)}%` }} />
          </div>
        </div>
      ))}
      <p className="dp-nota">{nota}</p>
    </div>
  );
}

// El diamante del béisbol: cuatro rombos, los ocupados en lima.
function Diamante({ bases }: { bases: [boolean, boolean, boolean] }) {
  const [b1, b2, b3] = bases;
  return (
    <span className="dp-diamante" aria-label={`Bases: ${bases.filter(Boolean).length} ocupadas`}>
      <i className={`dp-base b2 ${b2 ? "on" : ""}`} />
      <i className={`dp-base b3 ${b3 ? "on" : ""}`} />
      <i className={`dp-base b1 ${b1 ? "on" : ""}`} />
      <i className="dp-base home" />
    </span>
  );
}
