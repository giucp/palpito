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

export function PanelAdmin({ correo }: { correo: string }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movs, setMovs] = useState<Record<string, Movimiento[]>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

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

  // El buscador espera a que dejes de teclear antes de consultar.
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

  // Margen: lo que entró por apuestas y juegos menos lo que se pagó.
  const margen = resumen
    ? resumen.apostado_deportes + resumen.apostado_juegos - resumen.pagado_deportes - resumen.pagado_juegos
    : 0;
  const movido = resumen ? resumen.apostado_deportes + resumen.apostado_juegos : 0;

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
        <span className="adm-yo">{correo}</span>
      </header>

      <main className="adm-main">
        {/* ---- La casa ---- */}
        <h2 className="adm-h2">La casa</h2>
        <div className="adm-grid">
          <Cifra
            titulo="En circulación"
            valor={fmt(resumen?.circulacion ?? 0)}
            pie="fichas en manos de usuarios"
          />
          <Cifra
            titulo="Repartidas"
            valor={fmt(resumen?.repartidas ?? 0)}
            pie={`regalos y ajustes${resumen?.retiradas_admin ? ` · ${fmt(resumen.retiradas_admin)} retiradas` : ""}`}
          />
          <Cifra
            titulo="Margen de la casa"
            valor={`${margen >= 0 ? "+" : ""}${fmt(margen)}`}
            pie={movido > 0 ? `${((margen / movido) * 100).toFixed(1)}% de lo jugado` : "sin actividad"}
            tono={margen > 0 ? "bien" : margen < 0 ? "mal" : undefined}
          />
          <Cifra
            titulo="Volumen jugado"
            valor={fmt(movido)}
            pie="apuestas + juegos"
          />
        </div>

        <div className="adm-grid">
          <Cifra
            titulo="Deportes"
            valor={fmt(resumen ? resumen.apostado_deportes - resumen.pagado_deportes : 0)}
            pie={`${fmt(resumen?.apostado_deportes ?? 0)} jugado · ${fmt(resumen?.pagado_deportes ?? 0)} pagado`}
            tono={resumen && resumen.apostado_deportes - resumen.pagado_deportes >= 0 ? "bien" : "mal"}
          />
          <Cifra
            titulo="Juegos"
            valor={fmt(resumen ? resumen.apostado_juegos - resumen.pagado_juegos : 0)}
            pie={`${fmt(resumen?.apostado_juegos ?? 0)} jugado · ${fmt(resumen?.pagado_juegos ?? 0)} pagado`}
            tono={resumen && resumen.apostado_juegos - resumen.pagado_juegos >= 0 ? "bien" : "mal"}
          />
          <Cifra
            titulo="Apuestas"
            valor={String(resumen?.apuestas_total ?? 0)}
            pie={`${resumen?.apuestas_abiertas ?? 0} abiertas · ${resumen?.apuestas_ganadas ?? 0} ganadas · ${resumen?.apuestas_perdidas ?? 0} perdidas`}
          />
          <Cifra
            titulo="Partidas de juegos"
            valor={String(resumen?.rondas_juegos ?? 0)}
            pie={`${resumen?.eventos_abiertos ?? 0} eventos abiertos · ${resumen?.eventos_finalizados ?? 0} cerrados`}
          />
        </div>

        {/* ---- Usuarios ---- */}
        <h2 className="adm-h2">
          Usuarios
          <span className="adm-cuenta">
            {usuarios?.length ?? 0}
            {resumen ? ` de ${resumen.usuarios}` : ""}
          </span>
        </h2>

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

        {usuarios === null ? (
          <p className="adm-vacio">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p className="adm-vacio">Sin resultados</p>
        ) : (
          <div className="adm-tabla">
            <div className="adm-fila adm-cabecera">
              <span>Usuario</span>
              <span className="num">Saldo</span>
              <span className="num">Recibido</span>
              <span className="num">Jugado</span>
              <span className="num">Cobrado</span>
              <span className="num">Balance</span>
              <span />
            </div>
            {usuarios.map((u) => {
              const balance = u.cobrado - u.apostado;
              const abierta = abierto === u.id;
              return (
                <div key={u.id} className={`adm-bloque ${abierta ? "abierto" : ""}`}>
                  <div className="adm-fila">
                    <button className="adm-usuario" onClick={() => verMovimientos(u.id)}>
                      <span className="correo">
                        {u.correo}
                        {u.admin && <i className="chip">admin</i>}
                      </span>
                      <span className="meta">
                        {u.apuestas} apuestas · {u.jugadas} partidas · desde {fecha(u.creado)}
                      </span>
                    </button>
                    {/* data-t: en móvil la tabla se apila y cada cifra necesita
                        su etiqueta, que el CSS saca de este atributo. */}
                    <span className="num mono" data-t="Saldo">
                      {fmt(u.saldo)}
                    </span>
                    <span className="num mono suave" data-t="Recibido">
                      {fmt(u.recibido)}
                    </span>
                    <span className="num mono suave" data-t="Jugado">
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

                  {abierta && (
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
      </main>

      <div className={`toast ${aviso ? "on" : ""}`} role="status">
        {aviso ?? ""}
      </div>
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  pie,
  tono,
}: {
  titulo: string;
  valor: string;
  pie?: string;
  tono?: "bien" | "mal";
}) {
  return (
    <div className={`adm-cifra ${tono ?? ""}`}>
      <span className="t">{titulo}</span>
      <b className="mono">{valor}</b>
      {pie && <span className="p">{pie}</span>}
    </div>
  );
}
