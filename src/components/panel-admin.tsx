"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icono, IconosDefs } from "./iconos";
import { fmt } from "@/lib/cupon";

type Resumen = {
  usuarios: number;
  usuarios_con_saldo: number;
  repartidas: number;
  retiradas_admin: number;
  circulacion: number;
  apostado_deportes: number;
  pagado_deportes: number;
  apostado_juegos: number;
  pagado_juegos: number;
  apuestas_abiertas: number;
  apuestas_total: number;
  apuestas_ganadas: number;
  apuestas_perdidas: number;
  rondas_juegos: number;
  eventos_abiertos: number;
  eventos_finalizados: number;
};

type Usuario = {
  id: string;
  correo: string;
  creado: string;
  ultimo_acceso: string | null;
  admin: boolean;
  saldo: number;
  recibido: number;
  apostado: number;
  cobrado: number;
  apuestas: number;
  ganadas: number;
  perdidas: number;
  abiertas: number;
  jugadas: number;
};

type Movimiento = { id: number; tipo: string; monto: number; nota: string | null; fecha: string };

const pedir = async (cuerpo: Record<string, unknown>) =>
  fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  }).then((r) => r.json());

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

// Números grandes en forma compacta: 12.9K en vez de 12.940
const compacto = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("es", { maximumFractionDigits: 0 });
};

export function PanelAdmin({ correo }: { correo: string }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movs, setMovs] = useState<Record<string, Movimiento[]>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [orden, setOrden] = useState<"balance" | "saldo" | "jugado" | "reciente">("jugado");

  const cargar = useCallback(async (q = "") => {
    const [r, u] = await Promise.all([
      pedir({ accion: "resumen" }),
      pedir({ accion: "usuarios", busqueda: q }),
    ]);
    if (r.ok) setResumen(r as unknown as Resumen);
    if (u.ok) setUsuarios(u.usuarios as Usuario[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda, cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  const verMovimientos = async (id: string) => {
    if (abierto === id) return setAbierto(null);
    setAbierto(id);
    if (movs[id]) return;
    const r = await pedir({ accion: "movimientos", usuario_id: id });
    if (r.ok) setMovs((m) => ({ ...m, [id]: r.movimientos as Movimiento[] }));
  };

  const acreditar = async (u: Usuario) => {
    const texto = window.prompt(
      `Fichas para ${u.correo}\n\nSaldo actual: ${fmt(u.saldo)}\nUsa un número negativo para retirar.`,
      "1000"
    );
    if (texto === null) return;
    const monto = Number(texto.replace(",", "."));
    if (!Number.isFinite(monto) || monto === 0) return setAviso("Monto no válido");

    setOcupado(true);
    const r = await pedir({ accion: "acreditar", usuario_id: u.id, monto });
    setOcupado(false);

    if (r.ok) {
      setAviso(`${monto > 0 ? "Acreditadas" : "Retiradas"} ${Math.abs(monto)} fichas a ${u.correo}`);
      setMovs((m) => {
        const c = { ...m };
        delete c[u.id];
        return c;
      });
      cargar(busqueda);
    } else {
      setAviso(
        r.motivo === "saldo_insuficiente"
          ? "No puede quedar en negativo"
          : "No se pudo aplicar el ajuste"
      );
    }
  };

  const jugadoDep = resumen?.apostado_deportes ?? 0;
  const pagadoDep = resumen?.pagado_deportes ?? 0;
  const jugadoJue = resumen?.apostado_juegos ?? 0;
  const pagadoJue = resumen?.pagado_juegos ?? 0;
  const volumen = jugadoDep + jugadoJue;
  const margen = volumen - pagadoDep - pagadoJue;
  const circulacion = resumen?.circulacion ?? 0;
  const repartidas = resumen?.repartidas ?? 0;

  const ordenadas = usuarios
    ? [...usuarios].sort((a, b) => {
        if (orden === "saldo") return b.saldo - a.saldo;
        if (orden === "jugado") return b.apostado - a.apostado;
        if (orden === "balance") return b.cobrado - b.apostado - (a.cobrado - a.apostado);
        return (b.creado ?? "").localeCompare(a.creado ?? "");
      })
    : null;

  return (
    <div className="adm">
      <IconosDefs />
      <header className="adm-cab">
        <Link href="/" className="adm-logo">
          <Icono id="i-logo" />
          <b>
            Pálpito<i>.</i>
          </b>
          <span>Administración</span>
        </Link>
        <button className="adm-recargar" onClick={() => cargar(busqueda)} title="Actualizar datos">
          <Icono id="i-recargar" />
        </button>
        <span className="adm-yo">{correo}</span>
      </header>

      <main className="adm-main">
        {/* La cifra que manda: una sola, grande, arriba a la izquierda */}
        <section className="adm-hero">
          <div className="hero-num">
            <span className="t">Margen de la casa</span>
            <b className={margen >= 0 ? "bien" : "mal"}>
              {margen >= 0 ? "+" : "−"}
              {compacto(Math.abs(margen))}
            </b>
            <span className="p">
              {volumen > 0 ? (
                <>
                  <strong>{((margen / volumen) * 100).toFixed(1)}%</strong> de las{" "}
                  {compacto(volumen)} fichas jugadas
                </>
              ) : (
                "todavía sin actividad"
              )}
            </span>
          </div>

          {/* De dónde sale ese margen. Barras apiladas: de lo jugado, cuánto se
              devolvió y cuánto se quedó la casa. */}
          <div className="hero-desglose">
            <div className="hd-cab">
              <span>De dónde sale</span>
              <div className="hd-leyenda">
                <i className="ly casa" /> Se queda la casa
                <i className="ly pagado" /> Devuelto
              </div>
            </div>
            <Barra
              etiqueta="Deportes"
              jugado={jugadoDep}
              pagado={pagadoDep}
              maximo={Math.max(jugadoDep, jugadoJue, 1)}
            />
            <Barra
              etiqueta="Juegos"
              jugado={jugadoJue}
              pagado={pagadoJue}
              maximo={Math.max(jugadoDep, jugadoJue, 1)}
            />
          </div>
        </section>

        {/* Indicadores de apoyo */}
        <section className="adm-kpis">
          <Kpi
            titulo="En circulación"
            valor={compacto(circulacion)}
            detalle={`de ${compacto(repartidas)} repartidas`}
            medidor={repartidas > 0 ? circulacion / repartidas : 0}
          />
          <Kpi
            titulo="Usuarios"
            valor={String(resumen?.usuarios ?? 0)}
            detalle={`${resumen?.usuarios_con_saldo ?? 0} con fichas`}
          />
          <Kpi
            titulo="Apuestas"
            valor={String(resumen?.apuestas_total ?? 0)}
            detalle={`${resumen?.apuestas_abiertas ?? 0} sin resolver`}
            reparto={
              resumen && resumen.apuestas_ganadas + resumen.apuestas_perdidas > 0
                ? {
                    ganadas: resumen.apuestas_ganadas,
                    perdidas: resumen.apuestas_perdidas,
                  }
                : undefined
            }
          />
          <Kpi
            titulo="Partidas de juegos"
            valor={String(resumen?.rondas_juegos ?? 0)}
            detalle={`${resumen?.eventos_abiertos ?? 0} eventos en cartelera`}
          />
        </section>

        {/* Detalle: los usuarios */}
        <section className="adm-seccion">
          <div className="adm-titulo">
            <h2>Usuarios</h2>
            <div className="adm-orden">
              {(
                [
                  ["jugado", "Más apostado", "Quién ha puesto más fichas en juego"],
                  ["balance", "Mejor balance", "Quién va ganando más (cobrado menos apostado)"],
                  ["saldo", "Más saldo", "Quién tiene más fichas ahora mismo"],
                  ["reciente", "Más nuevos", "Los últimos en registrarse"],
                ] as const
              ).map(([k, t, ayuda]) => (
                <button
                  key={k}
                  className={orden === k ? "on" : ""}
                  onClick={() => setOrden(k)}
                  title={ayuda}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="buscador adm-buscador">
            <Icono id="i-lupa" className="bs-ic" />
            <input
              type="search"
              value={busqueda}
              placeholder="Buscar por correo…"
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button className="bs-x" onClick={() => setBusqueda("")} aria-label="Limpiar">
                <Icono id="i-x" />
              </button>
            )}
          </div>

          {ordenadas === null ? (
            <p className="adm-vacio">Cargando…</p>
          ) : ordenadas.length === 0 ? (
            <p className="adm-vacio">Sin resultados para “{busqueda}”</p>
          ) : (
            <div className="adm-tabla">
              <div className="adm-fila adm-cabecera">
                <span>Usuario</span>
                <span className="num" title="Fichas que tiene ahora mismo">
                  Saldo
                </span>
                <span className="num" title="Todo lo que ha puesto en juego, sumando apuestas y partidas">
                  Apostado
                </span>
                <span className="num" title="Todo lo que ha cobrado por ganar o por devoluciones">
                  Cobrado
                </span>
                <span className="num" title="Cobrado menos apostado: si va ganando o perdiendo">
                  Balance
                </span>
                <span />
              </div>
              {ordenadas.map((u) => {
                const balance = u.cobrado - u.apostado;
                const abre = abierto === u.id;
                const resueltas = u.ganadas + u.perdidas;
                return (
                  <div key={u.id} className={`adm-bloque ${abre ? "abierto" : ""}`}>
                    <div className="adm-fila">
                      <button className="adm-usuario" onClick={() => verMovimientos(u.id)}>
                        <span className="correo">
                          {u.correo}
                          {u.admin && <i className="chip">admin</i>}
                        </span>
                        <span className="meta">
                          {u.apuestas} apuestas
                          {resueltas > 0 && ` · ${Math.round((u.ganadas / resueltas) * 100)}% acierto`}
                          {u.jugadas > 0 && ` · ${u.jugadas} partidas`}
                        </span>
                      </button>
                      <span className="num mono" data-t="Saldo">
                        {fmt(u.saldo)}
                      </span>
                      <span className="num mono suave" data-t="Apostado">
                        {fmt(u.apostado)}
                      </span>
                      <span className="num mono suave" data-t="Cobrado">
                        {fmt(u.cobrado)}
                      </span>
                      <span
                        className={`num mono ${balance > 0 ? "pos" : balance < 0 ? "neg" : ""}`}
                        data-t="Balance"
                      >
                        {balance > 0 ? "+" : ""}
                        {fmt(balance)}
                      </span>
                      <button
                        className="adm-mas"
                        onClick={() => acreditar(u)}
                        disabled={ocupado}
                        title="Acreditar o retirar fichas"
                      >
                        Fichas
                      </button>
                    </div>

                    {abre && (
                      <div className="adm-movs">
                        {!movs[u.id] ? (
                          <p className="adm-vacio">Cargando movimientos…</p>
                        ) : movs[u.id].length === 0 ? (
                          <p className="adm-vacio">Sin movimientos</p>
                        ) : (
                          movs[u.id].map((m) => (
                            <div key={m.id} className="adm-mov">
                              <span className={`t ${m.tipo}`}>{m.tipo}</span>
                              <span className={`m mono ${Number(m.monto) >= 0 ? "pos" : "neg"}`}>
                                {Number(m.monto) > 0 ? "+" : ""}
                                {Number(m.monto).toFixed(2)}
                              </span>
                              <span className="n">{m.nota ?? ""}</span>
                              <span className="f mono">{fecha(m.fecha)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <div className={`toast ${aviso ? "on" : ""}`} role="status">
        {aviso ?? ""}
      </div>
    </div>
  );
}

/** Barra apilada: de lo jugado, cuánto se quedó la casa y cuánto se devolvió. */
function Barra({
  etiqueta,
  jugado,
  pagado,
  maximo,
}: {
  etiqueta: string;
  jugado: number;
  pagado: number;
  maximo: number;
}) {
  const margen = jugado - pagado;
  const ancho = maximo > 0 ? (jugado / maximo) * 100 : 0;
  const parteCasa = jugado > 0 ? Math.max(0, margen / jugado) * 100 : 0;

  return (
    <div className="hd-barra" title={`${etiqueta}: ${fmt(jugado)} jugado · ${fmt(pagado)} devuelto`}>
      <span className="hb-et">{etiqueta}</span>
      <div className="hb-pista">
        <div className="hb-relleno" style={{ width: `${ancho}%` }}>
          {/* El orden importa: primero lo que se queda la casa (el dato del
              panel), luego lo devuelto. Separados por un hueco de 2px. */}
          <i className="hb-casa" style={{ width: `${parteCasa}%` }} />
          <i className="hb-pagado" />
        </div>
      </div>
      <span className={`hb-val mono ${margen >= 0 ? "bien" : "mal"}`}>
        {margen >= 0 ? "+" : "−"}
        {compacto(Math.abs(margen))}
      </span>
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  detalle,
  medidor,
  reparto,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  medidor?: number;
  reparto?: { ganadas: number; perdidas: number };
}) {
  return (
    <div className="adm-kpi">
      <span className="t">{titulo}</span>
      <b>{valor}</b>
      {medidor !== undefined && (
        <div className="kpi-medidor" title={`${(medidor * 100).toFixed(1)}%`}>
          <i style={{ width: `${Math.min(100, Math.max(0, medidor * 100))}%` }} />
        </div>
      )}
      {reparto && (
        <div className="kpi-reparto">
          <i
            className="g"
            style={{
              width: `${(reparto.ganadas / (reparto.ganadas + reparto.perdidas)) * 100}%`,
            }}
            title={`${reparto.ganadas} ganadas`}
          />
          <i className="p" title={`${reparto.perdidas} perdidas`} />
        </div>
      )}
      {detalle && <span className="d">{detalle}</span>}
    </div>
  );
}
