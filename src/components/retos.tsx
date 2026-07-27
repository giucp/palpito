"use client";

import { useCallback, useEffect, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/dinero";

// Tus retos, dentro de Apuestas (palpito_guia.md §6.e).
//
// Antes esto vivía arriba de Juegos, y antes de eso escondido en Cuenta →
// Amigos → bajar hasta "Tus desafíos". Va acá porque Apuestas es la zona de lo
// que jugás con otros: Juegos quedó solo para elegir el juego.
//
// Están **todos** juntos, deportivos y de juego, porque para el que los mira
// son la misma cosa: algo que tiene con otra persona. Primero lo que espera
// algo tuyo, después lo que está en curso, y al final el historial.
//
// Cada renglón dice **qué te toca hacer a vos**, no en qué estado está. "Sacá
// tu carta" es una instrucción; "aceptado" es jerga de base de datos.

export type Reto = {
  id: string;
  tipo?: string;
  estado: string;
  monto: number;
  lado_creador: "local" | "visitante" | null;
  rival_id: string | null;
  soyCreador: boolean;
  aliasCreador: string;
  aliasRival: string;
  yaJugue: boolean;
  yaJugoElOtro: boolean;
  eventos: {
    liga: string;
    equipo_a: string;
    equipo_b: string;
    comienza_at: string;
  } | null;
};

type Accion = { texto: string; urgente: boolean };

const RESUELTOS = new Set(["ganado_creador", "ganado_rival", "empate", "cancelado"]);

const esJuego = (r: Reto) => Boolean(r.tipo && r.tipo !== "deportivo");

// Cómo se llama cada juego y qué le toca hacer al jugador. Se dice con el verbo
// del juego —"sacá tu carta", "tirá tus dados"— porque es una instrucción, no
// una etiqueta: el que entra tiene que saber qué va a pasar cuando toque.
const JUEGOS: Record<string, { nombre: string; hacer: string; suyo: string }> = {
  carta: { nombre: "Carta más alta", hacer: "Sacá tu carta", suyo: "la carta" },
  dados: { nombre: "Dados", hacer: "Tirá tus dados", suyo: "los dados" },
  libre: { nombre: "Apuesta libre", hacer: "Declará quién ganó", suyo: "que declare" },
};
const delJuego = (r: Reto) =>
  JUEGOS[r.tipo ?? ""] ?? { nombre: "Reto", hacer: "Jugá tu turno", suyo: "la jugada" };
// Una apuesta publicada al tablero es un desafío sin rival: mientras está
// esperando, y también después si venció o se retiró sin que nadie la tomara.
const sinRival = (r: Reto) => !esJuego(r) && r.rival_id === null;
const esPublicada = (r: Reto) => sinRival(r) && r.estado === "pendiente";

function queHacer(r: Reto): Accion {
  const otro = r.soyCreador ? r.aliasRival : r.aliasCreador;

  if (r.estado === "pendiente") {
    if (esPublicada(r)) return { texto: "Publicada · esperando quien la tome", urgente: false };
    if (!r.soyCreador) return { texto: `Te retó @${otro} · aceptá`, urgente: true };
    if (esJuego(r) && !r.yaJugue) return { texto: delJuego(r).hacer, urgente: true };
    return { texto: `Esperando que @${otro} acepte`, urgente: false };
  }

  if (r.estado === "aceptado") {
    if (!esJuego(r)) return { texto: "En juego · se resuelve al terminar el partido", urgente: false };
    if (!r.yaJugue) return { texto: delJuego(r).hacer, urgente: true };
    return { texto: `Esperando ${delJuego(r).suyo} de @${otro}`, urgente: false };
  }

  if (r.estado === "empate") return { texto: "Empataron · se devolvió lo puesto", urgente: false };
  if (r.estado === "cancelado")
    return { texto: "No se jugó · se devolvió lo puesto", urgente: false };

  const gane =
    (r.estado === "ganado_creador" && r.soyCreador) ||
    (r.estado === "ganado_rival" && !r.soyCreador);
  return { texto: gane ? "Ganaste" : "Perdiste", urgente: false };
}

function titulo(r: Reto): string {
  if (esJuego(r)) return delJuego(r).nombre;
  return `${r.eventos?.equipo_a ?? "?"} vs ${r.eventos?.equipo_b ?? "?"}`;
}

// Con quién va esta persona en un desafío deportivo. Quien lo creó eligió su
// lado; al otro le toca el contrario.
function miEquipo(r: Reto): string | null {
  if (esJuego(r) || !r.eventos || !r.lado_creador) return null;
  const mio = r.soyCreador
    ? r.lado_creador
    : r.lado_creador === "local"
      ? "visitante"
      : "local";
  return mio === "local" ? r.eventos.equipo_a : r.eventos.equipo_b;
}

function Fila({ r }: { r: Reto }) {
  const a = queHacer(r);
  const otro = r.soyCreador ? r.aliasRival : r.aliasCreador;
  const gane = a.texto === "Ganaste";
  const perdi = a.texto === "Perdiste";
  const equipo = miEquipo(r);
  // Sin rival no hay a quién mostrar. Con la inicial del alias salía un "?",
  // que parece un error; los dos puntos dicen "acá no hay nadie todavía".
  const inicial = sinRival(r) ? "··" : otro.slice(0, 2).toUpperCase();

  return (
    <a
      className={`rt-item ${a.urgente ? "urgente" : ""} ${gane ? "gano" : ""} ${perdi ? "perdio" : ""}`}
      href={`/desafio/${r.id}`}
    >
      <span className="am-avatar">{inicial}</span>
      <div className="rt-txt">
        <b>{titulo(r)}</b>
        <span>{a.texto}</span>
        {equipo && <span className="rt-lado">Vas con {equipo}</span>}
      </div>
      <b className="mono rt-monto">{fmt(Number(r.monto))}</b>
      <Icono id="i-arr" className="rt-ir" />
    </a>
  );
}

export function Retos({ usuario, onEntrar }: { usuario: { email: string } | null; onEntrar: () => void }) {
  // Sin sesión no hay nada que pedir, así que arranca vacío y no en "cargando".
  const [retos, setRetos] = useState<Reto[] | null>(usuario ? null : []);

  // Devuelve en vez de guardar: así el efecto decide si todavía está montado
  // antes de tocar el estado, y no hay un setState suelto dentro del efecto.
  const traer = useCallback(async (): Promise<Reto[]> => {
    try {
      const r = await fetch("/api/desafios").then((x) => x.json());
      return r.ok ? (r.desafios as Reto[]) : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      const r = await traer();
      if (vivo) setRetos(r);
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, traer]);

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "44px 20px" }}>
        <Icono id="i-user" />
        <b>Entrá para ver tus retos</b>
        <p>Acá aparecen los que tenés con otros, y lo que ganaste y perdiste.</p>
        <button className="bapostar" style={{ marginTop: 14 }} onClick={onEntrar}>
          Entrar
        </button>
      </div>
    );
  }

  if (retos === null) {
    return (
      <div className="svacio" style={{ padding: "44px 20px" }}>
        <p>Cargando tus retos…</p>
      </div>
    );
  }

  if (retos.length === 0) {
    return (
      <div className="svacio" style={{ padding: "44px 20px" }}>
        <Icono id="i-amigos" />
        <b>Todavía no tenés retos</b>
        <p>Publicá una apuesta en el tablero, o retá a un amigo desde Juegos o desde tu cuenta.</p>
      </div>
    );
  }

  const teToca = retos.filter((r) => queHacer(r).urgente);
  const enCurso = retos.filter((r) => !RESUELTOS.has(r.estado) && !queHacer(r).urgente);
  const historial = retos.filter((r) => RESUELTOS.has(r.estado));

  return (
    <div className="rt">
      {teToca.length > 0 && (
        <>
          <div className="pf-titulo">Te toca a vos</div>
          {teToca.map((r) => (
            <Fila key={r.id} r={r} />
          ))}
        </>
      )}

      {enCurso.length > 0 && (
        <>
          <div className="pf-titulo">En curso</div>
          {enCurso.map((r) => (
            <Fila key={r.id} r={r} />
          ))}
        </>
      )}

      {historial.length > 0 && (
        <>
          <div className="pf-titulo">Ganadas y perdidas</div>
          {historial.map((r) => (
            <Fila key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}
