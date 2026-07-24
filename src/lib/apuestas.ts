import { crearClienteNavegador } from "./supabase/client";

// Apuestas del usuario con todo el detalle necesario para el ticket:
// qué se jugó, en qué partido, si ya terminó y cómo quedó cada línea.

export type EstadoApuesta = "abierta" | "ganada" | "perdida" | "anulada";

export type LineaTicket = {
  id: string;
  cuota: number;
  estado: EstadoApuesta;
  pick: string;
  mercado: string;
  equipoA: string;
  equipoB: string;
  liga: string;
  comienzaAt: string;
  estadoEvento: string;
  marcadorA: number | null;
  marcadorB: number | null;
};

export type Ticket = {
  id: string;
  tipo: "simple" | "combinada";
  monto: number;
  cuotaTotal: number;
  gananciaPosible: number;
  estado: EstadoApuesta;
  creadaAt: string;
  liquidadaAt: string | null;
  lineas: LineaTicket[];
};

type FilaLinea = {
  id: string;
  cuota: number | string;
  estado: string | null;
  selecciones: {
    nombre: string;
    mercados: {
      nombre: string;
      eventos: {
        equipo_a: string;
        equipo_b: string;
        liga: string;
        comienza_at: string;
        estado: string;
        marcador_a: number | null;
        marcador_b: number | null;
      };
    };
  } | null;
};

type FilaApuesta = {
  id: string;
  tipo: string;
  monto: number | string;
  cuota_total: number | string;
  ganancia_posible: number | string;
  estado: string;
  created_at: string;
  liquidada_at: string | null;
  apuesta_lineas: FilaLinea[];
};

const SELECT =
  "id, tipo, monto, cuota_total, ganancia_posible, estado, created_at, liquidada_at, " +
  "apuesta_lineas(id, cuota, estado, selecciones(nombre, mercados(nombre, " +
  "eventos(equipo_a, equipo_b, liga, comienza_at, estado, marcador_a, marcador_b))))";

export async function cargarTickets(limite = 60): Promise<Ticket[]> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase
    .from("apuestas")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];

  return (data as unknown as FilaApuesta[]).map((a) => ({
    id: a.id,
    tipo: a.tipo === "combinada" ? "combinada" : "simple",
    monto: Number(a.monto),
    cuotaTotal: Number(a.cuota_total),
    gananciaPosible: Number(a.ganancia_posible),
    estado: (a.estado as EstadoApuesta) ?? "abierta",
    creadaAt: a.created_at,
    liquidadaAt: a.liquidada_at,
    lineas: (a.apuesta_lineas ?? []).map((l) => ({
      id: l.id,
      cuota: Number(l.cuota),
      estado: (l.estado as EstadoApuesta) ?? "abierta",
      pick: l.selecciones?.nombre ?? "—",
      mercado: l.selecciones?.mercados?.nombre ?? "—",
      equipoA: l.selecciones?.mercados?.eventos?.equipo_a ?? "",
      equipoB: l.selecciones?.mercados?.eventos?.equipo_b ?? "",
      liga: l.selecciones?.mercados?.eventos?.liga ?? "",
      comienzaAt: l.selecciones?.mercados?.eventos?.comienza_at ?? "",
      estadoEvento: l.selecciones?.mercados?.eventos?.estado ?? "programado",
      marcadorA: l.selecciones?.mercados?.eventos?.marcador_a ?? null,
      marcadorB: l.selecciones?.mercados?.eventos?.marcador_b ?? null,
    })),
  }));
}

// El pick con el nombre del equipo en vez de 'Local'/'Visitante'.
export function pickLegible(l: LineaTicket): string {
  if (l.pick === "Local") return l.equipoA;
  if (l.pick === "Visitante") return l.equipoB;
  return l.pick;
}

export type Estadisticas = {
  total: number;
  ganadas: number;
  perdidas: number;
  abiertas: number;
  anuladas: number;
  apostado: number;
  cobrado: number;
  enJuego: number;
  balance: number;
  acierto: number | null; // % sobre las ya resueltas
  porDia: Array<{ dia: string; etiqueta: string; total: number; balance: number }>;
};

export function calcularEstadisticas(tickets: Ticket[]): Estadisticas {
  const e: Estadisticas = {
    total: tickets.length,
    ganadas: 0,
    perdidas: 0,
    abiertas: 0,
    anuladas: 0,
    apostado: 0,
    cobrado: 0,
    enJuego: 0,
    balance: 0,
    acierto: null,
    porDia: [],
  };

  const dias = new Map<string, { total: number; balance: number }>();

  for (const t of tickets) {
    e.apostado += t.monto;
    if (t.estado === "ganada") {
      e.ganadas++;
      e.cobrado += t.gananciaPosible;
    } else if (t.estado === "perdida") {
      e.perdidas++;
    } else if (t.estado === "anulada") {
      e.anuladas++;
      e.cobrado += t.monto; // devolución
    } else {
      e.abiertas++;
      e.enJuego += t.monto;
    }

    // Balance del día: lo cobrado menos lo apostado.
    const dia = t.creadaAt.slice(0, 10);
    const prev = dias.get(dia) ?? { total: 0, balance: 0 };
    const cobro =
      t.estado === "ganada" ? t.gananciaPosible : t.estado === "anulada" ? t.monto : 0;
    dias.set(dia, {
      total: prev.total + 1,
      balance: prev.balance + cobro - t.monto,
    });
  }

  e.balance = e.cobrado - e.apostado;
  const resueltas = e.ganadas + e.perdidas;
  e.acierto = resueltas > 0 ? Math.round((e.ganadas / resueltas) * 100) : null;

  const hoy = new Date().toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  e.porDia = [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 7)
    .map(([dia, v]) => ({
      dia,
      etiqueta:
        dia === hoy
          ? "Hoy"
          : dia === ayer
            ? "Ayer"
            : new Date(`${dia}T12:00:00`).toLocaleDateString("es", {
                day: "numeric",
                month: "short",
              }),
      total: v.total,
      balance: v.balance,
    }));

  return e;
}
