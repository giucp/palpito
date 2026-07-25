import { createClient } from "@supabase/supabase-js";
import { EVENTOS as RESPALDO } from "./datos-ejemplo";
import type { Evento } from "./tipos";

// Zona horaria de presentación. Ajustable cuando haya preferencias por usuario.
// Se exporta porque la tarjeta del desafío se dibuja en el servidor y ahí no hay
// zona del navegador: si no usara esta misma, la imagen y la pantalla mostrarían
// horas distintas para el mismo partido.
export const ZONA = "America/Caracas";

type FilaSeleccion = {
  id: string;
  nombre: string;
  cuota: number | string;
  orden: number | null;
  activa: boolean | null;
};
type FilaMercado = {
  id: string;
  tipo: string;
  nombre: string;
  orden: number | null;
  selecciones: FilaSeleccion[];
};
type FilaEvento = {
  id: string;
  deporte: string;
  liga: string;
  equipo_a: string;
  equipo_b: string;
  comienza_at: string;
  mercados: FilaMercado[];
};

function horaLocal(iso: string): string {
  const fecha = new Date(iso);
  const hhmm = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).format(fecha);
  const dia = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d); // YYYY-MM-DD
  if (dia(fecha) === dia(new Date())) return hhmm;
  const nombreDia = new Intl.DateTimeFormat("es", {
    weekday: "short",
    timeZone: ZONA,
  }).format(fecha);
  const corto = nombreDia.replace(".", "");
  return `${corto.charAt(0).toUpperCase()}${corto.slice(1)} ${hhmm}`;
}

// Lee el catálogo desde Supabase (lectura pública vía RLS). Si la base no
// responde o está vacía, cae al respaldo local para que la app siga viva.
export async function cargarEventos(): Promise<{
  eventos: Evento[];
  origen: "supabase" | "ejemplo";
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { eventos: RESPALDO, origen: "ejemplo" };

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("eventos")
      .select(
        "id, deporte, liga, equipo_a, equipo_b, comienza_at, mercados(id, tipo, nombre, orden, selecciones(id, nombre, cuota, orden, activa))"
      )
      .eq("estado", "programado")
      .gt("comienza_at", new Date().toISOString()) // solo pre-partido: lo empezado se oculta
      .order("comienza_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return { eventos: RESPALDO, origen: "ejemplo" };
    }

    const filas = data as unknown as FilaEvento[];
    const eventos: Evento[] = filas.map((f) => ({
      id: f.id,
      deporte: f.deporte,
      liga: f.liga,
      equipoA: f.equipo_a,
      equipoB: f.equipo_b,
      hora: horaLocal(f.comienza_at),
      mercados: [...f.mercados]
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((m) => ({
          id: m.id,
          tipo: m.tipo,
          nombre: m.nombre,
          selecciones: [...m.selecciones]
            .filter((s) => s.activa !== false)
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((s) => ({ id: s.id, nombre: s.nombre, cuota: Number(s.cuota) })),
        })),
    }));

    return { eventos, origen: "supabase" };
  } catch {
    return { eventos: RESPALDO, origen: "ejemplo" };
  }
}
