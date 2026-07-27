"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "./iconos";
import { fmt } from "@/lib/dinero";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Vista } from "@/lib/tipos";

type Props = {
  vista: Vista;
  onVista: (v: Vista) => void;
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
};

// El tema de verdad es el atributo `data-theme` del <html>: lo pone un script
// antes de pintar, para que no haya un fogonazo blanco al cargar. La cabecera
// lo **lee de ahí** en vez de guardar una copia en su propio estado, que era
// tener el mismo dato en dos sitios y sincronizarlos a mano en un efecto.
const suscribirTema = (avisar: () => void) => {
  const obs = new MutationObserver(avisar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const temaActual = (): "dark" | "light" =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

const TABS: Array<{ vista: Vista; nombre: string }> = [
  { vista: "lobby", nombre: "Deportes" },
  { vista: "vivo", nombre: "Análisis" },
  { vista: "apuestas", nombre: "Apuestas" },
  { vista: "juegos", nombre: "Juegos" },
];

export function Cabecera({ vista, onVista, usuario, saldo, onAviso }: Props) {
  const router = useRouter();
  const tema = useSyncExternalStore(suscribirTema, temaActual, () => "dark" as const);

  const cambiarTema = () => {
    const t = tema === "dark" ? "light" : "dark";
    // Solo se toca el atributo: el observador de arriba se encarga de que la
    // cabecera se entere y se vuelva a dibujar.
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("tema", t);
    } catch {}
  };

  const salir = async () => {
    await crearClienteNavegador().auth.signOut();
    onAviso("Sesión cerrada");
    router.refresh();
  };

  return (
    <header className="cab">
      <div className="hin">
        <button className="logo" onClick={() => onVista("lobby")} aria-label="Pálpito, ir al inicio">
          <Icono id="i-logo" className="text-lima-txt" />
          <span className="w">
            Pálpito<i>.</i>
          </span>
        </button>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.vista}
              className={vista === t.vista ? "on" : ""}
              onClick={() => onVista(t.vista)}
            >
              {t.nombre}
            </button>
          ))}
        </nav>
        <span className="hsp" />
        <div className="saldo">
          <span>
            <span className="k">Saldo</span>
            <span className="v mono">{usuario && saldo !== null ? fmt(saldo) : "—"}</span>
          </span>
          {usuario ? (
            <button
              className="dep"
              onClick={() => onAviso("Fichas de prueba: los depósitos llegan en la fase 5")}
            >
              Depositar
            </button>
          ) : (
            <button className="dep" onClick={() => router.push("/entrar")}>
              Entrar
            </button>
          )}
        </div>
        <button className="ib" onClick={cambiarTema} aria-label="Cambiar tema">
          <Icono id={tema === "dark" ? "i-sun" : "i-moon"} />
        </button>
        <button
          className="ib user"
          onClick={usuario ? salir : () => router.push("/entrar")}
          aria-label={usuario ? "Cerrar sesión" : "Entrar"}
          title={usuario ? `${usuario.email} — cerrar sesión` : "Entrar"}
        >
          <Icono id="i-user" />
        </button>
      </div>
    </header>
  );
}
