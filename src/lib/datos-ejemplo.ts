import type { Deporte, Evento } from "./tipos";

// Catálogo de deportes con sus iconos SVG propios (nunca emoji — guía §3.4).
export const DEPORTES: Deporte[] = [
  { id: "futbol", nombre: "Fútbol", icono: "d-futbol" },
  { id: "beisbol", nombre: "Béisbol", icono: "d-beis" },
  { id: "basket", nombre: "Baloncesto", icono: "d-basket" },
  { id: "tenis", nombre: "Tenis", icono: "d-tenis" },
  { id: "nfl", nombre: "Fútbol americano", icono: "d-nfl" },
  { id: "hockey", nombre: "Hockey", icono: "d-hockey" },
  { id: "mma", nombre: "MMA / Boxeo", icono: "d-mma" },
  { id: "voley", nombre: "Voleibol", icono: "d-voley" },
  { id: "golf", nombre: "Golf", icono: "d-golf" },
  { id: "esports", nombre: "Esports", icono: "d-esports" },
  { id: "f1", nombre: "Automovilismo", icono: "d-f1" },
  { id: "hipica", nombre: "Hípicas", icono: "d-hipica" },
];

// Respaldo local con la MISMA cartelera que supabase/seed.sql: partidos reales
// del viernes 24 de julio de 2026 (cuotas ilustrativas) + referencias ficticias.
// Se usa solo cuando la base no responde o está vacía.
let n = 0;
const id = () => `tmp-${++n}`;

type Sel = [string, number];
type Merc = { tipo: string; nombre: string; sel: Sel[] };

function evento(
  deporte: string,
  liga: string,
  equipoA: string,
  equipoB: string,
  hora: string,
  mercados: Merc[]
): Evento {
  return {
    id: id(),
    deporte,
    liga,
    equipoA,
    equipoB,
    hora,
    mercados: mercados.map((m) => ({
      id: id(),
      tipo: m.tipo,
      nombre: m.nombre,
      selecciones: m.sel.map(([nombre, cuota]) => ({ id: id(), nombre, cuota })),
    })),
  };
}

const m1x2 = (l: number, x: number, v: number): Merc => ({
  tipo: "1x2",
  nombre: "Resultado final",
  sel: [["Local", l], ["Empate", x], ["Visitante", v]],
});
const mDoble = (lx: number, lv: number, xv: number): Merc => ({
  tipo: "doble_oportunidad",
  nombre: "Doble oportunidad",
  sel: [["Local o Empate", lx], ["Local o Visitante", lv], ["Empate o Visitante", xv]],
});
const mAmbos = (si: number, no: number): Merc => ({
  tipo: "ambos_anotan",
  nombre: "Ambos equipos anotan",
  sel: [["Sí", si], ["No", no]],
});
const mTotalGoles = (
  m15: number, me15: number, m25: number, me25: number, m35: number, me35: number
): Merc => ({
  tipo: "total_goles",
  nombre: "Total de goles",
  sel: [
    ["Más de 1.5", m15], ["Menos de 1.5", me15],
    ["Más de 2.5", m25], ["Menos de 2.5", me25],
    ["Más de 3.5", m35], ["Menos de 3.5", me35],
  ],
});
const mHandicap = (l05: number, v05: number, l1: number, v1: number): Merc => ({
  tipo: "handicap",
  nombre: "Hándicap asiático",
  sel: [["Local -0.5", l05], ["Visitante +0.5", v05], ["Local -1.0", l1], ["Visitante +1.0", v1]],
});
const mMarcador = (c: [number, number, number, number, number, number]): Merc => ({
  tipo: "marcador",
  nombre: "Marcador exacto",
  sel: [["1-0", c[0]], ["2-0", c[1]], ["2-1", c[2]], ["0-0", c[3]], ["1-1", c[4]], ["0-1", c[5]]],
});
const mGanador = (l: number, v: number): Merc => ({
  tipo: "ganador",
  nombre: "Ganador",
  sel: [["Local", l], ["Visitante", v]],
});
const mLineaCarreras = (nl: string, cl: number, nv: string, cv: number): Merc => ({
  tipo: "linea_carreras",
  nombre: "Línea de carreras",
  sel: [[nl, cl], [nv, cv]],
});
const mTotalSimple = (tipo: string, nombre: string, linea: string, mas: number, menos: number): Merc => ({
  tipo,
  nombre,
  sel: [[`Más de ${linea}`, mas], [`Menos de ${linea}`, menos]],
});
const mPrimeras5 = (l: number, x: number, v: number): Merc => ({
  tipo: "primeras_5",
  nombre: "Primeras 5 entradas",
  sel: [["Local", l], ["Empate", x], ["Visitante", v]],
});

export const EVENTOS: Evento[] = [
  // ---- Fútbol · Argentina · Torneo Clausura (hoy, reales) ----
  evento("futbol", "Argentina · Torneo Clausura", "Gimnasia de Mendoza", "Central Córdoba", "15:45", [
    m1x2(2.4, 3.1, 2.9), mDoble(1.36, 1.32, 1.5), mAmbos(1.95, 1.78),
    mTotalGoles(1.3, 3.3, 2.1, 1.68, 3.9, 1.24),
  ]),
  evento("futbol", "Argentina · Torneo Clausura", "Racing", "Gimnasia La Plata", "18:00", [
    m1x2(1.6, 3.7, 5.6), mDoble(1.13, 1.25, 2.2), mAmbos(2.05, 1.7),
    mTotalGoles(1.26, 3.55, 1.95, 1.8, 3.45, 1.28),
    mHandicap(1.6, 2.28, 2.2, 1.62), mMarcador([5.5, 6.25, 8.0, 8.5, 7.5, 13.0]),
  ]),
  evento("futbol", "Argentina · Torneo Clausura", "Vélez", "Instituto", "18:00", [
    m1x2(1.85, 3.3, 4.4), mDoble(1.2, 1.31, 1.88), mAmbos(2.0, 1.74),
    mTotalGoles(1.28, 3.45, 2.0, 1.76, 3.6, 1.26),
  ]),
  evento("futbol", "Argentina · Torneo Clausura", "Huracán", "Banfield", "20:15", [
    m1x2(2.3, 3.0, 3.3), mDoble(1.31, 1.36, 1.58), mAmbos(1.9, 1.83),
    mTotalGoles(1.33, 3.15, 2.15, 1.65, 4.1, 1.21),
  ]),
  evento("futbol", "Argentina · Torneo Clausura", "Platense", "Unión", "20:15", [
    m1x2(2.5, 2.95, 3.1), mDoble(1.36, 1.39, 1.51), mAmbos(1.92, 1.8),
    mTotalGoles(1.35, 3.05, 2.2, 1.62, 4.25, 1.2),
  ]),

  // ---- Fútbol · Colombia · Primera A (hoy, reales) ----
  evento("futbol", "Colombia · Primera A", "Llaneros", "Pereira", "18:00", [
    m1x2(2.25, 3.0, 3.4), mDoble(1.29, 1.36, 1.6), mAmbos(1.98, 1.75),
    mTotalGoles(1.31, 3.25, 2.12, 1.66, 4.0, 1.22),
  ]),
  evento("futbol", "Colombia · Primera A", "Deportivo Cali", "Jaguares de Córdoba", "20:30", [
    m1x2(1.75, 3.4, 4.9), mDoble(1.16, 1.29, 2.0), mAmbos(2.1, 1.66),
    mTotalGoles(1.27, 3.5, 1.98, 1.78, 3.55, 1.27),
    mHandicap(1.75, 2.05, 2.45, 1.53), mMarcador([5.25, 6.0, 7.75, 7.9, 7.25, 11.5]),
  ]),

  // ---- Fútbol · Chile y Paraguay (hoy, reales) ----
  evento("futbol", "Chile · Primera División", "Colo Colo", "Deportes Limache", "18:00", [
    m1x2(1.48, 4.1, 6.5), mDoble(1.09, 1.21, 2.5), mAmbos(2.2, 1.62),
    mTotalGoles(1.24, 3.75, 1.85, 1.9, 3.25, 1.32),
    mHandicap(1.48, 2.55, 1.98, 1.78), mMarcador([4.9, 5.4, 7.5, 9.5, 8.25, 15.0]),
  ]),
  evento("futbol", "Paraguay · División Profesional", "Cerro Porteño", "Trinidense", "19:00", [
    m1x2(1.52, 3.95, 6.2), mDoble(1.1, 1.22, 2.42), mAmbos(2.15, 1.64),
    mTotalGoles(1.25, 3.65, 1.88, 1.87, 3.35, 1.3),
    mHandicap(1.52, 2.45, 2.05, 1.72), mMarcador([5.0, 5.6, 7.6, 9.0, 8.0, 14.0]),
  ]),

  // ---- Béisbol · MLB (hoy, reales; equipo local primero) ----
  evento("beisbol", "Estados Unidos · MLB", "Pirates", "Cubs", "18:40", [
    mGanador(2.2, 1.68), mLineaCarreras("Local +1.5", 1.52, "Visitante -1.5", 2.5),
    mTotalSimple("total_carreras", "Total de carreras", "8.5", 1.95, 1.87), mPrimeras5(2.3, 3.9, 1.98),
  ]),
  evento("beisbol", "Estados Unidos · MLB", "Phillies", "Yankees", "18:45", [
    mGanador(1.83, 1.99), mLineaCarreras("Local -1.5", 2.6, "Visitante +1.5", 1.5),
    mTotalSimple("total_carreras", "Total de carreras", "9.0", 1.92, 1.9), mPrimeras5(2.05, 3.8, 2.2),
  ]),
  evento("beisbol", "Estados Unidos · MLB", "Mets", "Dodgers", "19:10", [
    mGanador(2.1, 1.74), mLineaCarreras("Local +1.5", 1.48, "Visitante -1.5", 2.65),
    mTotalSimple("total_carreras", "Total de carreras", "8.5", 1.98, 1.84), mPrimeras5(2.25, 3.85, 2.02),
  ]),
  evento("beisbol", "Estados Unidos · MLB", "Red Sox", "Blue Jays", "19:15", [
    mGanador(1.95, 1.87), mLineaCarreras("Local -1.5", 2.75, "Visitante +1.5", 1.45),
    mTotalSimple("total_carreras", "Total de carreras", "9.5", 1.9, 1.92), mPrimeras5(2.15, 3.75, 2.1),
  ]),
  evento("beisbol", "Estados Unidos · MLB", "Rangers", "Mariners", "20:05", [
    mGanador(1.9, 1.92), mLineaCarreras("Local -1.5", 2.7, "Visitante +1.5", 1.46),
    mTotalSimple("total_carreras", "Total de carreras", "8.0", 1.95, 1.87), mPrimeras5(2.12, 3.8, 2.14),
  ]),
  evento("beisbol", "Estados Unidos · MLB", "Giants", "Angels", "22:15", [
    mGanador(1.65, 2.28), mLineaCarreras("Local -1.5", 2.3, "Visitante +1.5", 1.6),
    mTotalSimple("total_carreras", "Total de carreras", "8.5", 2.0, 1.82), mPrimeras5(1.92, 3.85, 2.35),
  ]),

  // ---- Otros deportes · referencia (ficticios) ----
  evento("basket", "NBA · Partido de referencia (ficticio)", "Lakers", "Celtics", "Sáb 19:00", [
    mGanador(1.9, 1.92), mTotalSimple("total_puntos", "Total de puntos", "219.5", 1.9, 1.9),
  ]),
  evento("tenis", "ATP · Partido de referencia (ficticio)", "C. Alcaraz", "J. Sinner", "Sáb 14:00", [
    mGanador(1.85, 1.95), mTotalSimple("total_juegos", "Total de juegos", "22.5", 1.87, 1.93),
  ]),
  evento("mma", "UFC · Cartelera de referencia (ficticio)", "I. Makhachev", "A. Volkanovski", "Sáb 23:00", [
    mGanador(1.42, 2.9),
  ]),
  evento("esports", "CS2 · Serie de referencia (ficticio)", "FaZe", "NAVI", "Sáb 16:00", [
    mGanador(1.88, 1.92), mTotalSimple("total_mapas", "Total de mapas", "2.5", 1.8, 2.0),
  ]),
];
