"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Linea = {
  id: string;
  cuota: number;
  estado: string | null;
  selecciones: {
    nombre: string;
    mercados: { nombre: string; eventos: { equipo_a: string; equipo_b: string } };
  } | null;
};

type Apuesta = {
  id: string;
  tipo: string;
  monto: number;
  cuota_total: number;
  ganancia_posible: number;
  estado: string;
  created_at: string;
  apuesta_lineas: Linea[];
};

const ETIQUETA: Record<string, string> = {
  abierta: "En juego",
  ganada: "Ganada",
  perdida: "Perdida",
  anulada: "Anulada",
};

export function MisApuestas({ usuario }: { usuario: { email: string } | null }) {
  const [apuestas, setApuestas] = useState<Apuesta[] | null>(null);

  useEffect(() => {
    if (!usuario) return;
    let activo = true;
    (async () => {
      const supabase = crearClienteNavegador();
      const { data } = await supabase
        .from("apuestas")
        .select(
          "id, tipo, monto, cuota_total, ganancia_posible, estado, created_at, apuesta_lineas(id, cuota, estado, selecciones(nombre, mercados(nombre, eventos(equipo_a, equipo_b))))"
        )
        .order("created_at", { ascending: false })
        .limit(30);
      if (activo) setApuestas((data as unknown as Apuesta[]) ?? []);
    })();
    return () => {
      activo = false;
    };
  }, [usuario]);

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>Entra para ver tus apuestas</b>
        <p>Crea tu cuenta y recibe 1000 fichas de prueba de regalo.</p>
      </div>
    );
  }

  if (apuestas === null) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <p>Cargando…</p>
      </div>
    );
  }

  if (apuestas.length === 0) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-slip" />
        <b>Aún no tienes apuestas</b>
        <p>Toca una cuota en el lobby para armar tu primer cupón.</p>
      </div>
    );
  }

  return (
    <>
      {apuestas.map((a) => (
        <div key={a.id} className="ap">
          <div className="aph">
            <span className="tp">
              {a.tipo === "combinada"
                ? `Combinada · ${a.apuesta_lineas.length} selecciones`
                : "Simple"}
            </span>
            <span className={`st ${a.estado}`}>{ETIQUETA[a.estado] ?? a.estado}</span>
          </div>
          {a.apuesta_lineas.map((l) => (
            <div key={l.id} className="apl">
              <span className={`dot ${l.estado ?? ""}`} />
              <span className="tx">
                {l.selecciones
                  ? `${l.selecciones.mercados.eventos.equipo_a} v ${l.selecciones.mercados.eventos.equipo_b} — ${l.selecciones.mercados.nombre}: ${l.selecciones.nombre}`
                  : "Selección"}
              </span>
              <span className="cu mono">{Number(l.cuota).toFixed(2)}</span>
            </div>
          ))}
          <div className="apf">
            <span className="mi">
              Apostado<b className="mono">{fmt(Number(a.monto))}</b>
            </span>
            <span className={`mi ${a.estado === "ganada" ? "gan" : ""}`}>
              {a.estado === "ganada" ? "Pagado" : "Ganancia posible"}
              <b className="mono">{fmt(Number(a.ganancia_posible))}</b>
            </span>
            <span className="mi" style={{ marginLeft: "auto" }}>
              Cuota<b className="mono">{Number(a.cuota_total).toFixed(2)}</b>
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
