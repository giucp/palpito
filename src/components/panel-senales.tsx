"use client";

import { useCallback, useEffect, useState } from "react";
import { nombreDia } from "@/lib/dias";

// El motor de señales, para mirarlo de cerca antes de enseñárselo a nadie.
//
// Se ven **todos** los candidatos del día, no solo los que el motor recomendó.
// Los descartados son el grupo de comparación: si ganan tanto como los elegidos,
// el motor no está eligiendo, está mirando, y eso hay que poder verlo.
//
// Cada fila trae dos decisiones separadas:
//
//   · lo que dijo el motor (`entra`), que no se toca nunca;
//   · lo que decidís vos (`curado`), que se guarda aparte y con fecha.
//
// Esa separación es todo el sentido de esta pantalla. En un mes se comparan las
// dos series: si tus correcciones aciertan más, hay que mirar qué estabas viendo
// y convertirlo en un modelo; si no, también es una respuesta.

type Modelo = { id: string; nombre: string; score: number | null; motivos: string[] };

type Senal = {
  id: string;
  partido: string;
  hora: string | null;
  equipo: string;
  score: number;
  midieron: number;
  total_modelos: number;
  acuerdo: number;
  entra: boolean;
  motivo_descarte: string | null;
  contradice: string | null;
  detalle: Modelo[];
  curado: boolean | null;
  curado_nota: string | null;
  gano: boolean | null;
  resuelto_at: string | null;
};

type Balance = {
  elegidos: { n: number; aciertos: number };
  descartados: { n: number; aciertos: number };
  curados: { n: number; aciertos: number };
  discrepancias: { n: number; ganoElHumano: number; ganoElMotor: number };
  porModelo: Record<string, { n: number; aciertos: number }>;
};

const pct = (g: { n: number; aciertos: number }) =>
  g.n === 0 ? "—" : `${((g.aciertos / g.n) * 100).toFixed(0)}%`;

const hora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Caracas",
      }).format(new Date(iso))
    : "";

export function PanelSenales() {
  const [fecha, setFecha] = useState<string>("");
  const [fechas, setFechas] = useState<string[]>([]);
  const [senales, setSenales] = useState<Senal[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloEntran, setSoloEntran] = useState(false);
  const [vista, setVista] = useState<"motor" | "curado">("motor");

  const cargar = useCallback(async (f?: string) => {
    const r = await fetch(`/api/admin/senales${f ? `?fecha=${f}` : ""}`).then((x) => x.json());
    if (!r.ok) return;
    setFecha(r.fecha);
    setFechas(r.fechas ?? []);
    setSenales(r.senales ?? []);
    setBalance(r.balance ?? null);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (senales === null) return <p className="sn-vacio">Cargando…</p>;

  const visibles = soloEntran ? senales.filter((s) => s.entra) : senales;
  const entran = senales.filter((s) => s.entra).length;
  // Las curadas primero las tomadas, que son la serie que se compara.
  const curadas = senales
    .filter((s) => s.curado !== null)
    .sort((a, b) => Number(b.curado) - Number(a.curado));
  const dif =
    balance && balance.elegidos.n > 0 && balance.descartados.n > 0
      ? (balance.elegidos.aciertos / balance.elegidos.n -
          balance.descartados.aciertos / balance.descartados.n) *
        100
      : null;

  return (
    <div className="sn">
      {/* ---- El balance, que es lo único que dice si el motor sirve ---- */}
      <section className="sn-balance">
        <div className="sn-b">
          <span>Elegidos</span>
          <b>{balance ? pct(balance.elegidos) : "—"}</b>
          <i>{balance ? `${balance.elegidos.aciertos} de ${balance.elegidos.n}` : ""}</i>
        </div>
        <div className="sn-b">
          <span>Descartados</span>
          <b>{balance ? pct(balance.descartados) : "—"}</b>
          <i>{balance ? `${balance.descartados.aciertos} de ${balance.descartados.n}` : ""}</i>
        </div>
        <div className="sn-b">
          <span>Curado (manual)</span>
          <b>{balance ? pct(balance.curados) : "—"}</b>
          <i>{balance ? `${balance.curados.aciertos} de ${balance.curados.n}` : ""}</i>
        </div>
        <div className="sn-b">
          <span>Donde difieren</span>
          <b>
            {balance && balance.discrepancias.n > 0
              ? `${balance.discrepancias.ganoElHumano}–${balance.discrepancias.ganoElMotor}`
              : "—"}
          </b>
          <i>
            {balance && balance.discrepancias.n > 0
              ? "manual – motor"
              : "sin desacuerdos resueltos"}
          </i>
        </div>
        <div className={`sn-b dif ${dif === null ? "" : dif >= 5 ? "bien" : dif <= -5 ? "mal" : "nada"}`}>
          <span>Diferencia</span>
          <b>{dif === null ? "—" : `${dif >= 0 ? "+" : ""}${dif.toFixed(0)} pts`}</b>
          <i>
            {dif === null
              ? "faltan resultados"
              : Math.abs(dif) < 5
                ? "todavía no dice nada"
                : dif > 0
                  ? "elige mejor que el azar"
                  : "elige peor que descartar"}
          </i>
        </div>
      </section>
      <p className="sn-aviso">
        La diferencia es lo que importa. Si los elegidos aciertan lo mismo que los descartados, el
        motor no está eligiendo: está mirando.
      </p>

      {/* ---- El día ---- */}
      <div className="sn-barra">
        {/* Con el día escrito, no la fecha suelta: un selector lleno de
            `2026-07-27` no se lee como un selector de días, y por eso pasó
            desapercibido y la pantalla parecía atada a hoy. La fecha va al lado
            para no perder el dato exacto. */}
        <select value={fecha} onChange={(e) => void cargar(e.target.value)}>
          {fechas.length === 0 && <option value={fecha}>{nombreDia(fecha)}</option>}
          {fechas.map((f) => (
            <option key={f} value={f}>
              {nombreDia(f)} · {f}
            </option>
          ))}
        </select>
        <span className="sn-cuenta">
          {entran} de {senales.length} recomendados · {curadas.length} curados
        </span>
        <button className={soloEntran ? "on" : ""} onClick={() => setSoloEntran((v) => !v)}>
          {soloEntran ? "Ver todos" : "Solo los que entran"}
        </button>
      </div>

      {/* Motor y curado, uno al lado del otro. La gracia está en dónde se
          separan: si eligieran lo mismo, no habría nada que comparar. */}
      <div className="sn-vistas">
        <button className={vista === "motor" ? "on" : ""} onClick={() => setVista("motor")}>
          Motor
        </button>
        <button className={vista === "curado" ? "on" : ""} onClick={() => setVista("curado")}>
          Curado {curadas.length > 0 && <i>{curadas.length}</i>}
        </button>
      </div>

      {vista === "curado" && (
        <div className="sn-curado">
          {curadas.length === 0 ? (
            <p className="sn-vacio">Este día todavía no tiene decisiones manuales.</p>
          ) : (
            curadas.map((s) => (
              <article key={s.id} className={`sn-cfila ${s.curado ? "tomo" : "paso"}`}>
                <div className="sn-ccab">
                  <span className={`sn-cmarca ${s.curado ? "tomo" : "paso"}`}>
                    {s.curado ? "La tomo" : "Paso"}
                  </span>
                  {/* El partido va siempre. En un total, "Más de 9.5" a secas no
                      dice de qué juego se está hablando. */}
                  <span className="sn-cque">
                    <b>{s.equipo}</b>
                    <i>{s.partido.replace(" vs. ", " · ")}</i>
                  </span>
                  <span className="sn-cmotor">
                    el motor {s.entra ? "la recomendó" : "la descartó"}
                    {s.curado !== s.entra && <i> · difieren</i>}
                  </span>
                  {s.gano !== null && (
                    <span className={`sn-res ${s.curado === s.gano ? "gano" : "perdio"}`}>
                      {s.curado === s.gano ? "acerté" : "fallé"}
                    </span>
                  )}
                </div>
                <p className="sn-cnota">{s.curado_nota}</p>
              </article>
            ))
          )}
        </div>
      )}

      {visibles.length === 0 && (
        <p className="sn-vacio">
          No hay nada guardado para este día. El motor guarda la jornada una vez, cuando ya están
          anunciados los abridores.
        </p>
      )}

      {/* ---- Los candidatos ---- */}
      {vista === "motor" &&
      visibles.map((s) => {
        const abre = abierto === s.id;
        return (
          <article key={s.id} className={`sn-fila ${s.entra ? "entra" : ""}`}>
            <button className="sn-cab" onClick={() => setAbierto(abre ? null : s.id)}>
              <span className={`sn-score ${s.entra ? "entra" : ""}`}>{s.score}</span>
              <span className="sn-quien">
                <b>{s.equipo}</b>
                <i>
                  {s.partido.replace(" vs. ", " · ")} {hora(s.hora)}
                </i>
              </span>
              <span className="sn-acuerdo">
                {s.acuerdo}/{s.midieron}
                <i>a favor</i>
              </span>
              {s.gano !== null && (
                <span className={`sn-res ${s.gano ? "gano" : "perdio"}`}>
                  {s.gano ? "ganó" : "perdió"}
                </span>
              )}
            </button>

            {!s.entra && s.motivo_descarte && (
              <p className="sn-descarte">{s.motivo_descarte}</p>
            )}

            {abre && (
              <div className="sn-detalle">
                {s.detalle.map((m) => (
                  <div key={m.id} className="sn-modelo">
                    <span className="sn-m-nombre">{m.nombre}</span>
                    <span className="sn-m-barra">
                      <i style={{ width: `${m.score ?? 0}%` }} className={m.id === s.contradice ? "contra" : ""} />
                    </span>
                    <span className="sn-m-score">{m.score ?? "—"}</span>
                    <ul>
                      {m.motivos.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* La decisión manual **no se edita desde acá**, a propósito.
                    Son dos series independientes que se comparan entre sí; si
                    esta pantalla pudiera tocar una de las dos, dejaría de ser
                    una comparación y pasaría a ser una opinión mezclada con
                    otra. Lo que se ve acá es el resultado, no un formulario. */}
                {s.curado !== null && (
                  <p className={`sn-yacurado ${s.curado ? "tomo" : "paso"}`}>
                    {s.curado ? "En la serie manual: se toma" : "En la serie manual: se pasa"}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
