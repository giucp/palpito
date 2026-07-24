"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cabecera } from "./cabecera";
import { CuponPanel } from "./cupon";
import { DetallePartido } from "./detalle-partido";
import { FilaPartido } from "./fila-partido";
import { Icono, IconosDefs } from "./iconos";
import { MisApuestas } from "./mis-apuestas";
import { calcular, fmt } from "@/lib/cupon";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { DEPORTES } from "@/lib/datos-ejemplo";
import type { Evento, Mercado, ModoCupon, Seleccion, SeleccionCupon, Vista } from "@/lib/tipos";

// Nombre legible del pick: 'Local' → equipo A, 'Visitante' → equipo B.
function nombrePick(evento: Evento, seleccion: Seleccion): string {
  if (seleccion.nombre === "Local") return evento.equipoA;
  if (seleccion.nombre === "Visitante") return evento.equipoB;
  return seleccion.nombre;
}

type Props = {
  eventos: Evento[];
  origen: "supabase" | "ejemplo";
  usuario: { email: string } | null;
  saldo: number | null;
};

export function AppApuestas({ eventos, origen, usuario, saldo }: Props) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("lobby");
  const [deporte, setDeporte] = useState("futbol");
  const [detalle, setDetalle] = useState<Evento | null>(null);
  const [sel, setSel] = useState<SeleccionCupon[]>([]);
  const [modo, setModo] = useState<ModoCupon>("simple");
  const [monto, setMonto] = useState(10);
  const [sheet, setSheet] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState({ msg: "", on: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idempotencia = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `${Math.random()}`
  );

  const aviso = useCallback((msg: string) => {
    setToast({ msg, on: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 1800);
  }, []);

  const irVista = useCallback((v: Vista) => {
    setVista(v);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const verDetalle = (e: Evento) => {
    setDetalle(e);
    irVista("detalle");
  };

  const elegirDeporte = (id: string) => {
    setDeporte(id);
    irVista("lobby");
  };

  const cerrarSesion = async () => {
    await crearClienteNavegador().auth.signOut();
    aviso("Sesión cerrada");
    irVista("lobby");
    router.refresh();
  };

  const toggleCuota = (evento: Evento, mercado: Mercado, seleccion: Seleccion) => {
    setSel((prev) => {
      const existe = prev.some((s) => s.key === seleccion.id);
      if (existe) return prev.filter((s) => s.key !== seleccion.id);
      return [
        ...prev,
        {
          key: seleccion.id,
          mercado: mercado.nombre,
          pick: nombrePick(evento, seleccion),
          evento: `${evento.equipoA} v ${evento.equipoB}`,
          cuota: seleccion.cuota,
        },
      ];
    });
  };

  const quitar = (key: string) => setSel((prev) => prev.filter((s) => s.key !== key));
  const limpiar = () => setSel([]);

  const apostar = async () => {
    if (!usuario) {
      aviso("Crea tu cuenta para apostar — te regalamos 1000 fichas");
      router.push("/entrar");
      return;
    }
    if (enviando) return;
    setEnviando(true);
    try {
      const c = calcular(sel, modo, monto);
      const res = await fetch("/api/apostar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: modo === "combinada" ? "combinada" : "simple",
          monto,
          idempotency_key: idempotencia.current,
          selecciones: sel.map((s) => ({ seleccion_id: s.key, cuota_vista: s.cuota })),
        }),
      });
      const r = await res.json();

      if (r.ok) {
        aviso(`Apuesta de ${fmt(c.apuesta)} colocada ✔`);
        setSel([]);
        setSheet(false);
        idempotencia.current = crypto.randomUUID();
        router.refresh(); // refresca el saldo del servidor
      } else if (r.motivo === "cuotas") {
        const cambios = new Map(
          (r.cambios as Array<{ seleccion_id: string; cuota_actual: number }>).map((x) => [
            x.seleccion_id,
            Number(x.cuota_actual),
          ])
        );
        setSel((prev) =>
          prev.map((s) => (cambios.has(s.key) ? { ...s, cuota: cambios.get(s.key)! } : s))
        );
        idempotencia.current = crypto.randomUUID();
        aviso("Las cuotas cambiaron — revisa y confirma de nuevo");
      } else if (r.motivo === "saldo") {
        aviso("Saldo insuficiente para esta apuesta");
      } else if (r.motivo === "evento_cerrado") {
        aviso("Ese partido ya no acepta apuestas");
        idempotencia.current = crypto.randomUUID();
      } else if (res.status === 401) {
        aviso("Inicia sesión para apostar");
        router.push("/entrar");
      } else {
        aviso("No se pudo colocar la apuesta, intenta de nuevo");
        idempotencia.current = crypto.randomUUID();
      }
    } catch {
      aviso("Error de conexión, intenta de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  // La hoja móvil bloquea el scroll del fondo y se cierra con Escape.
  useEffect(() => {
    document.body.style.overflow = sheet ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const seleccionadas = new Set(sel.map((s) => s.key));
  const eventosDeporte = eventos.filter((e) => e.deporte === deporte);
  const ligas = [...new Set(eventosDeporte.map((e) => e.liga))];
  const infoDeporte = DEPORTES.find((d) => d.id === deporte);
  const nombreDeporte = infoDeporte?.nombre ?? "";
  const iconoDeporte = infoDeporte?.icono ?? "d-futbol";
  const c = calcular(sel, modo, monto);

  const botonesDeporte = DEPORTES.map((d) => {
    const cuenta = eventos.filter((e) => e.deporte === d.id).length;
    return (
      <button
        key={d.id}
        className={`sbtn ${deporte === d.id ? "on" : ""}`}
        onClick={() => elegirDeporte(d.id)}
      >
        <Icono id={d.icono} />
        <span className="n">{d.nombre}</span>
        <span className="c">{cuenta}</span>
      </button>
    );
  });

  const cupon = (enHoja: boolean) => (
    <CuponPanel
      sel={sel}
      modo={modo}
      monto={monto}
      onModo={setModo}
      onMonto={setMonto}
      onSumar={(q) => setMonto((m) => m + q)}
      onQuitar={quitar}
      onLimpiar={limpiar}
      onApostar={apostar}
      onCerrar={enHoja ? () => setSheet(false) : undefined}
    />
  );

  return (
    <>
      <IconosDefs />
      <Cabecera vista={vista} onVista={irVista} usuario={usuario} saldo={saldo} onAviso={aviso} />

      <div className="shell">
        <div className="sportcol">
          <div className="card">
            <div className="chd">Deportes</div>
            <div className="slist">{botonesDeporte}</div>
          </div>
        </div>

        <main>
          <div className="rail">{botonesDeporte}</div>

          {vista === "lobby" && (
            <div className="view">
              <div className="vhead">
                <h2>{nombreDeporte}</h2>
                <span className="sub">
                  {eventosDeporte.length}{" "}
                  {eventosDeporte.length === 1 ? "partido" : "partidos"}
                  {origen === "ejemplo" ? " · datos locales (base sin conectar)" : ""}
                </span>
              </div>
              {eventosDeporte.length === 0 ? (
                <div className="svacio" style={{ padding: "60px 20px" }}>
                  <b>No hay partidos de este deporte todavía</b>
                  <p>En esta fase cargamos fútbol y béisbol. Prueba con uno de esos.</p>
                </div>
              ) : (
                ligas.map((liga) => {
                  const enLiga = eventosDeporte.filter((e) => e.liga === liga);
                  return (
                    <div key={liga} className="grp">
                      <div className="gh">
                        <Icono id={iconoDeporte} className="gh-ic" />
                        <span className="nm">{liga}</span>
                        <span className="ct">{enLiga.length}</span>
                      </div>
                      {enLiga.map((e) => (
                        <FilaPartido
                          key={e.id}
                          evento={e}
                          seleccionadas={seleccionadas}
                          onCuota={toggleCuota}
                          onDetalle={verDetalle}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {vista === "vivo" && (
            <div className="view">
              <div className="vhead">
                <h2>En vivo ahora</h2>
              </div>
              <div className="svacio" style={{ padding: "60px 20px" }}>
                <b>El en vivo llega en la fase 2</b>
                <p>Primero el flujo completo pre-partido; el tiempo real viene después.</p>
              </div>
            </div>
          )}

          {vista === "apuestas" && (
            <div className="view">
              <div className="vhead">
                <h2>Mis apuestas</h2>
              </div>
              <MisApuestas usuario={usuario} />
            </div>
          )}

          {vista === "cuenta" && (
            <div className="view">
              <div className="vhead">
                <h2>Mi cuenta</h2>
              </div>
              {usuario ? (
                <div className="perfil">
                  <div className="pf-saldo">
                    <span className="k">Saldo disponible</span>
                    <b className="mono">{saldo !== null ? fmt(saldo) : "—"}</b>
                    <small>Fichas de prueba</small>
                  </div>
                  <div className="pf-row">
                    <span>Correo</span>
                    <b>{usuario.email}</b>
                  </div>
                  <button className="pf-salir" onClick={cerrarSesion}>
                    Cerrar sesión
                  </button>
                </div>
              ) : (
                <div className="svacio" style={{ padding: "60px 20px" }}>
                  <Icono id="i-user" />
                  <b>No has entrado</b>
                  <p>Crea tu cuenta y recibe 1000 fichas de prueba de regalo.</p>
                  <button
                    className="bapostar"
                    style={{ maxWidth: 240, margin: "16px auto 0" }}
                    onClick={() => router.push("/entrar")}
                  >
                    Entrar
                  </button>
                </div>
              )}
            </div>
          )}

          {vista === "detalle" && detalle && (
            <DetallePartido
              evento={detalle}
              seleccionadas={seleccionadas}
              onCuota={toggleCuota}
              onVolver={() => irVista("lobby")}
            />
          )}
        </main>

        <div className="slipcol">
          <div className="slip">{cupon(false)}</div>
        </div>
      </div>

      {/* Cupón móvil: barra flotante + hoja inferior */}
      <button className={`fab ${sel.length > 0 ? "on" : ""}`} onClick={() => setSheet(true)}>
        <span className="n">{sel.length}</span>
        <span className="t">Ver cupón</span>
        <span className="g mono">{fmt(c.ganancia)}</span>
      </button>
      <div className={`scrim ${sheet ? "on" : ""}`} onClick={() => setSheet(false)} />
      <div className={`sheet ${sheet ? "on" : ""}`}>
        <div className="grab" />
        {cupon(true)}
      </div>

      {/* Navegación inferior (solo móvil): sin esto, en el celular no había
          forma de llegar a Mis apuestas ni a la cuenta. */}
      <nav className="botnav">
        <button className={vista === "lobby" ? "on" : ""} onClick={() => irVista("lobby")}>
          <Icono id="i-inicio" />
          <span>Deportes</span>
        </button>
        <button className={vista === "vivo" ? "on" : ""} onClick={() => irVista("vivo")}>
          <Icono id="i-vivo" />
          <span>En vivo</span>
        </button>
        <button className={vista === "apuestas" ? "on" : ""} onClick={() => irVista("apuestas")}>
          <Icono id="i-slip" />
          <span>Apuestas</span>
        </button>
        <button className={vista === "cuenta" ? "on" : ""} onClick={() => irVista("cuenta")}>
          <Icono id="i-user" />
          <span>Cuenta</span>
        </button>
      </nav>

      <div className={`toast ${toast.on ? "on" : ""}`}>{toast.msg}</div>
    </>
  );
}
