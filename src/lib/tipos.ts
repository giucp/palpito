// Tipos con la misma forma que las tablas de Supabase (palpito_guia.md §6),
// para que pasar de datos de ejemplo a la base sea un cambio de origen, no de forma.

export type Deporte = {
  id: string;
  nombre: string;
  icono: string; // id del <symbol> SVG
};

export type Seleccion = {
  id: string;
  nombre: string; // 'Local', 'Empate', 'Más de 2.5'...
  cuota: number;
};

export type Mercado = {
  id: string;
  tipo: string; // '1x2', 'ganador', 'total_goles'...
  nombre: string; // 'Resultado final'
  selecciones: Seleccion[];
};

export type Evento = {
  id: string;
  deporte: string;
  liga: string;
  equipoA: string;
  equipoB: string;
  hora: string; // texto de hora local; con la base será timestamptz formateado
  mercados: Mercado[];
};

// `SeleccionCupon` y `ModoCupon` vivían acá para el cupón de apostar contra la
// casa. Se fueron con él el 2026-07-26.

export type Vista = "lobby" | "vivo" | "apuestas" | "cuenta" | "juegos";
