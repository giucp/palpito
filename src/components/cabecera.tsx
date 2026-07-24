"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Vista } from "@/lib/tipos";

type Props = {
  vista: Vista;
  onVista: (v: Vista) => void;
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
};

const TABS: Array<{ vista: Vista; nombre: string }> = [
  { vista: "lobby", nombre: "Deportes" },
  { vista: "vivo", nombre: "En vivo" },
  { vista: "apuestas", nombre: "Mis apuestas" },
];

export function Cabecera({ vista, onVista, usuario, saldo, onAviso }: Props) {
  const router = useRouter();
  const [tema, setTema] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const actual = document.documentElement.getAttribute("data-theme");
    if (actual === "light") setTema("light");
  }, []);

  const cambiarTema = () => {
    const t = tema === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("tema", t);
    } catch {}
    setTema(t);
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
