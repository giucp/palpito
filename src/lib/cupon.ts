import type { ModoCupon, SeleccionCupon } from "./tipos";

export const fmt = (n: number) => "$" + n.toFixed(2);

// Lo que no se puede combinar son dos picks del MISMO MERCADO, porque se
// excluyen entre sí ("gana Racing" y "empate" no pueden acertar a la vez).
// Dos mercados distintos del mismo partido sí valen: "gana Racing" + "menos de
// 1.5 goles" es un 1-0, perfectamente posible.
// Devuelve los ids de mercado que aparecen más de una vez.
export function mercadosEnConflicto(sel: SeleccionCupon[]): Set<string> {
  const veces = new Map<string, number>();
  for (const s of sel) veces.set(s.mercadoId, (veces.get(s.mercadoId) ?? 0) + 1);
  return new Set([...veces.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

// Cálculo del cupón (palpito_guia.md §5):
// - Simples: cada selección es una apuesta independiente.
//   Apuesta total = monto × N. Ganancia = suma de (monto × cuota).
// - Combinada: una sola apuesta. Cuota total = producto. Ganancia = monto × cuota.
export function calcular(
  sel: SeleccionCupon[],
  modo: ModoCupon,
  monto: number
): { apuesta: number; cuota: number; ganancia: number } {
  if (sel.length === 0) return { apuesta: 0, cuota: 0, ganancia: 0 };

  if (modo === "combinada") {
    const cuota = sel.reduce((a, s) => a * s.cuota, 1);
    return { apuesta: monto, cuota, ganancia: monto * cuota };
  }

  const apuesta = monto * sel.length;
  const ganancia = sel.reduce((a, s) => a + monto * s.cuota, 0);
  return { apuesta, cuota: ganancia / apuesta, ganancia };
}
