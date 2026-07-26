// Cómo te fue: el rendimiento sale de tus retos.
//
// Antes salía de los tickets contra la casa (`lib/apuestas.ts`). Eso se retiró
// con el resto del juego contra la casa, y dejar el anillo colgado de una
// fuente que ya no puede crecer habría sido mostrar un número muerto.
//
// La cuenta del balance, con la comisión adentro:
//
//   ganás  → el pozo es el doble de lo tuyo y Pálpito cobra su parte de ahí,
//            así que te queda `monto - comisión`
//   perdés → `-monto`
//   empate → vuelve lo tuyo menos media comisión: `-comisión / 2`
//
// Lo cancelado y lo que sigue en juego no suman ni restan: todavía no pasó nada.

export type RetoResumen = {
  estado: string;
  monto: number | string;
  comision_bps?: number | null;
  soyCreador: boolean;
  rival_id?: string | null;
};

export type Rendimiento = {
  total: number;
  ganadas: number;
  perdidas: number;
  empatadas: number;
  enJuego: number;
  apostado: number;
  balance: number;
};

export function calcularRendimiento(retos: RetoResumen[]): Rendimiento {
  let ganadas = 0;
  let perdidas = 0;
  let empatadas = 0;
  let enJuego = 0;
  let apostado = 0;
  let balance = 0;

  for (const r of retos) {
    const monto = Number(r.monto) || 0;
    const comision = (monto * 2 * (r.comision_bps ?? 50)) / 10000;

    if (r.estado === "pendiente" || r.estado === "aceptado") {
      enJuego++;
      continue;
    }
    if (r.estado === "cancelado") continue;

    apostado += monto;

    if (r.estado === "empate") {
      empatadas++;
      balance -= comision / 2;
      continue;
    }

    const gane =
      (r.estado === "ganado_creador" && r.soyCreador) ||
      (r.estado === "ganado_rival" && !r.soyCreador);

    if (gane) {
      ganadas++;
      balance += monto - comision;
    } else {
      perdidas++;
      balance -= monto;
    }
  }

  return {
    total: ganadas + perdidas + empatadas,
    ganadas,
    perdidas,
    empatadas,
    enJuego,
    apostado,
    balance,
  };
}
