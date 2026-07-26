"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cabecera } from "./cabecera";
import { CuponPanel } from "./cupon";
import { Juegos } from "./juegos";
import { DetallePartido } from "./detalle-partido";
import { FilaPartido } from "./fila-partido";
import { Icono, IconosDefs } from "./iconos";
import { MisApuestas } from "./mis-apuestas";
import { PanelCuenta } from "./panel-cuenta";
import { Tablero } from "./tablero";
import { Polymarket } from "./polymarket";
import { ProveedorFormatoCuota } from "./formato-cuota";
import { calcular, fmt, mercadosEnConflicto } from "@/lib/cupon";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { DEPORTES } from "@/lib/datos-ejemplo";
import type { Evento, Mercado, ModoCupon, Seleccion, SeleccionCupon, Vista } from "@/lib/tipos";

// Sin acentos ni mayúsculas: así "velez" encuentra "Vélez".
const ACENTOS = /[̀-ͯ]/g;
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(ACENTOS, "").trim();

// Nombre legible del pick: 'Local' → equipo A, 'Visitante' → equipo B.
function nombrePick(evento: Evento, seleccion: Seleccion): string {
  if (seleccion.nombre === "Local") return evento.equipoA;
  if (seleccion.nombre === "Visitante") return evento.equipoB;
  return seleccion.nombre;
}

type Props = {
  eventos: Evento[];
  origen: "supabase" | "ejemplo";
  usuario: { email: string; admin?: boolean } | null;
  saldo: number | null;
};

export function AppApuestas({ eventos, origen, usuario, saldo }: Props) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("lobby");
  const [deporte, setDeporte] = useState("futbol");
  const [ligasAbiertas, setLigasAbiertas] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<Evento | null>(null);
  const [sel, setSel] = useState<SeleccionCupon[]>([]);
  const [modo, setModo] = useState<ModoCupon>("simple");
  // El monto se guarda como texto para poder borrarlo por completo mientras se
  // escribe; el número sale de ahí y el botón Apostar se bloquea si no es válido.
  const [montoTexto, setMontoTexto] = useState("10");
  const monto = Number(montoTexto.replace(",", ".")) || 0;
  const [sheet, setSheet] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const idempotencia = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `${Math.random()}`
  );

  // El contador hace que dos avisos iguales seguidos reinicien el temporizador.
  const aviso = useCallback((msg: string) => {
    setToast((t) => ({ msg, n: (t?.n ?? 0) + 1 }));
  }, []);

  // Cerrar el aviso desde un efecto (no desde un setTimeout suelto): así el
  // cleanup lo cancela siempre, aunque el árbol se re-renderice por refresh().
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

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
    setLigasAbiertas(new Set()); // al cambiar de deporte, todas las ligas colapsadas
    setBusqueda("");
    irVista("lobby");
  };

  const toggleLiga = (liga: string) => {
    setLigasAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(liga)) s.delete(liga);
      else s.add(liga);
      return s;
    });
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
          eventoId: evento.id,
          mercadoId: mercado.id,
          mercado: mercado.nombre,
          pick: nombrePick(evento, seleccion),
          evento: `${evento.equipoA} v ${evento.equipoB}`,
          liga: evento.liga,
          hora: evento.hora,
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
      // El mismo criterio que muestra el cupón: hacen falta 2+ selecciones y
      // que ninguna se excluya con otra; si no, se envía como simples.
      const puedeCombinar = sel.length >= 2 && mercadosEnConflicto(sel).size === 0;
      const tipo = modo === "combinada" && puedeCombinar ? "combinada" : "simple";
      const c = calcular(sel, tipo, monto);
      const res = await fetch("/api/apostar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
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
      } else if (r.motivo === "mismo_mercado") {
        aviso("Esos dos picks se excluyen: no pueden acertar los dos");
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
  const q = normalizar(busqueda);
  const buscando = q.length > 0;
  const eventosDeporte = eventos
    .filter((e) => e.deporte === deporte)
    .filter(
      (e) =>
        !buscando ||
        normalizar(e.equipoA).includes(q) ||
        normalizar(e.equipoB).includes(q) ||
        normalizar(e.liga).includes(q)
    );
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
      montoTexto={montoTexto}
      monto={monto}
      saldo={saldo}
      enviando={enviando}
      onModo={setModo}
      onMontoTexto={setMontoTexto}
      onQuitar={quitar}
      onLimpiar={limpiar}
      onApostar={apostar}
      onCerrar={enHoja ? () => setSheet(false) : undefined}
    />
  );

  return (
    <ProveedorFormatoCuota>
      <IconosDefs />
      <Cabecera vista={vista} onVista={irVista} usuario={usuario} saldo={saldo} onAviso={aviso} />

      <div className="shell">
        <main>
          {/* La cartelera. Ya no es para apostar contra la casa: se mira. Las
              líneas salen de ESPN (DraftKings), gratis, sin gastar créditos. */}
          {vista === "lobby" && (
            <div className="view">
              <div className="vhead">
                <h2>Deportes</h2>
                <span className="sub">Todos los partidos del día y sus líneas</span>
              </div>
              <Tablero />
            </div>
          )}

          {vista === "vivo" && (
            <div className="view">
              <div className="vhead">
                <h2>Polymarket</h2>
                <span className="sub">Lo que paga la gente, no lo que dice una casa</span>
              </div>
              <Polymarket />
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

          {vista === "juegos" && (
            <div className="view">
              <div className="vhead">
                <h2>Juegos</h2>
                <span className="sub">Con fichas de prueba, como todo aquí</span>
              </div>
              <Juegos
                usuario={usuario}
                saldo={saldo}
                onAviso={aviso}
                onEntrar={() => router.push("/entrar")}
              />
            </div>
          )}

          {vista === "cuenta" && (
            <div className="view">
              <div className="vhead">
                <h2>Mi cuenta</h2>
              </div>
              <PanelCuenta
                usuario={usuario}
                saldo={saldo}
                onEntrar={() => router.push("/entrar")}
                onSalir={cerrarSesion}
                onAviso={aviso}
                onCambioSaldo={() => router.refresh()}
              />
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
          <span>Polymarket</span>
        </button>
        <button className={vista === "juegos" ? "on" : ""} onClick={() => irVista("juegos")}>
          <Icono id="i-juego" />
          <span>Juegos</span>
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

      <div className={`toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast?.msg ?? ""}
      </div>
    </ProveedorFormatoCuota>
  );
}
