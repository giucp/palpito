"use client";

import { useCallback, useEffect, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";

// Tus retos, arriba de Juegos.
//
// Antes esto solo se podía encontrar en Cuenta → Amigos → bajar hasta "Tus
// desafíos". Nadie lo adivina: creabas un reto, lo mandabas, y no había dónde
// volver a sacar tu carta ni dónde ver el resultado. Va acá porque es donde uno
// lo busca: en Juegos.
//
// Cada reto dice **qué te toca hacer a vos**, no en qué estado está. "Sacá tu
// carta" es una instrucción; "aceptado" es jerga de base de datos.

export type Reto = {
  id: string;
  tipo?: string;
  estado: string;
  monto: number;
  soyCreador: boolean;
  aliasCreador: string;
  aliasRival: string;
  yaJugue: boolean;
  yaJugoElOtro: boolean;
  expira_at?: string | null;
};

type Accion = { texto: string; urgente: boolean };

// Qué le toca hacer a esta persona con este reto.
function queHacer(r: Reto): Accion | null {
  const otro = r.soyCreador ? r.aliasRival : r.aliasCreador;

  if (r.estado === "pendiente") {
    if (!r.soyCreador) return { texto: `Te retó @${otro} · aceptá`, urgente: true };
    if (!r.yaJugue) return { texto: "Sacá tu carta", urgente: true };
    return { texto: `Esperando que @${otro} acepte`, urgente: false };
  }
  if (r.estado === "aceptado") {
    if (!r.yaJugue) return { texto: "Sacá tu carta", urgente: true };
    return { texto: `Esperando la carta de @${otro}`, urgente: false };
  }
  if (r.estado === "empate") return { texto: "Empataron", urgente: false };
  if (r.estado === "cancelado") return { texto: "Venció sin respuesta", urgente: false };

  const gane =
    (r.estado === "ganado_creador" && r.soyCreador) ||
    (r.estado === "ganado_rival" && !r.soyCreador);
  return { texto: gane ? "Ganaste" : "Perdiste", urgente: false };
}

// Cuántos retos esperan algo de vos. Sirve para la marca del menú.
export function cuantosEsperan(retos: Reto[]): number {
  return retos.filter((r) => queHacer(r)?.urgente).length;
}

export function MisRetos({ usuario }: { usuario: { email: string } | null }) {
  const [retos, setRetos] = useState<Reto[] | null>(null);

  const traer = useCallback(async () => {
    try {
      const r = await fetch("/api/desafios").then((x) => x.json());
      if (!r.ok) return [] as Reto[];
      // Solo los de juego: los deportivos viven en Amigos.
      return (r.desafios as Reto[]).filter((d) => d.tipo && d.tipo !== "deportivo");
    } catch {
      return [] as Reto[];
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

  if (!usuario || retos === null || retos.length === 0) return null;

  // Lo que espera algo tuyo va primero: es lo que viniste a hacer.
  const orden = [...retos].sort((a, b) => {
    const ua = queHacer(a)?.urgente ? 0 : 1;
    const ub = queHacer(b)?.urgente ? 0 : 1;
    return ua - ub;
  });

  return (
    <div className="rt">
      <div className="pf-titulo">Tus retos</div>
      {orden.slice(0, 6).map((r) => {
        const a = queHacer(r);
        const otro = r.soyCreador ? r.aliasRival : r.aliasCreador;
        return (
          <a key={r.id} className={`rt-item ${a?.urgente ? "urgente" : ""}`} href={`/desafio/${r.id}`}>
            <span className="am-avatar">{otro.slice(0, 2).toUpperCase()}</span>
            <div className="rt-txt">
              <b>{r.tipo === "carta" ? "Carta más alta" : "Despegue a dos"}</b>
              <span>{a?.texto}</span>
            </div>
            <b className="mono rt-monto">{fmt(Number(r.monto))}</b>
            <Icono id="i-arr" className="rt-ir" />
          </a>
        );
      })}
    </div>
  );
}
