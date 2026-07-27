"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cabecera } from "./cabecera";
import { Juegos } from "./juegos";
import { Icono, IconosDefs } from "./iconos";
import { PanelCuenta } from "./panel-cuenta";
import { Tablero } from "./tablero";
import { TableroApuestas } from "./tablero-apuestas";
import { Polymarket } from "./polymarket";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Vista } from "@/lib/tipos";

// La app entera, en vistas que se intercambian.
//
// **Apuestas** es el tablero abierto y nada más (palpito_guia.md §6.e):
// cualquiera publica una apuesta sobre un partido y espera quien se la tome.
// **Cuenta** es lo tuyo: quién sos, cuánto tenés, tus retos y tus amigos.
// **Juegos** es solo el catálogo.
//
// Los retos estuvieron un día en Apuestas y el dueño los mudó a Cuenta el
// 2026-07-27, con razón: son tuyos, no del tablero público.

type Props = {
  usuario: { email: string; admin?: boolean } | null;
  saldo: number | null;
};

export function AppApuestas({ usuario, saldo }: Props) {
  const router = useRouter();
  // `?ver=<pestaña>` abre la app directo ahí. `?ver=retos` es el caso especial:
  // lo usa el botón de volver de un desafío cuando no hay historial, y tiene que
  // dejarte en Cuenta con los retos abiertos, no en Deportes.
  const paramVista = useSearchParams().get("ver");
  const [vista, setVista] = useState<Vista>(() => {
    if (paramVista === "retos") return "cuenta";
    return paramVista && ["lobby", "vivo", "juegos", "apuestas", "cuenta"].includes(paramVista)
      ? (paramVista as Vista)
      : "lobby";
  });
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);

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

  const cerrarSesion = async () => {
    await crearClienteNavegador().auth.signOut();
    aviso("Sesión cerrada");
    irVista("lobby");
    router.refresh();
  };

  return (
    <>
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
                <h2>Apuestas</h2>
                <span className="sub">Lo que publicó cualquiera, esperando quien se lo tome</span>
              </div>
              <TableroApuestas
                usuario={usuario}
                saldo={saldo}
                onAviso={aviso}
                onCambio={() => router.refresh()}
                onEntrar={() => router.push("/entrar")}
              />
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
                seccionInicial={paramVista === "retos" ? "retos" : "cuenta"}
                onEntrar={() => router.push("/entrar")}
                onSalir={cerrarSesion}
                onAviso={aviso}
                onCambioSaldo={() => router.refresh()}
              />
            </div>
          )}
        </main>
      </div>

      {/* Navegación inferior (solo móvil): sin esto, en el celular no había
          forma de llegar a Apuestas ni a la cuenta. */}
      <nav className="botnav">
        <button className={vista === "lobby" ? "on" : ""} onClick={() => irVista("lobby")}>
          <Icono id="i-inicio" />
          <span>Deportes</span>
        </button>
        <button className={vista === "vivo" ? "on" : ""} onClick={() => irVista("vivo")}>
          <Icono id="i-vivo" />
          <span>Polymarket</span>
        </button>
        <button className={vista === "apuestas" ? "on" : ""} onClick={() => irVista("apuestas")}>
          <Icono id="i-slip" />
          <span>Apuestas</span>
        </button>
        <button className={vista === "juegos" ? "on" : ""} onClick={() => irVista("juegos")}>
          <Icono id="i-juego" />
          <span>Juegos</span>
        </button>
        <button className={vista === "cuenta" ? "on" : ""} onClick={() => irVista("cuenta")}>
          <Icono id="i-user" />
          <span>Cuenta</span>
        </button>
      </nav>

      <div className={`toast ${toast ? "on" : ""}`} role="status" aria-live="polite">
        {toast?.msg ?? ""}
      </div>
    </>
  );
}
