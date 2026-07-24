// Tabla de premios de "El Muelle". No tiene nada secreto —el jugador debe
// poder verla antes de apostar— así que vive aparte de la lógica del servidor
// para poder usarla también en el navegador.

export const DEVOLUCION = 0.97;

// Qué tan firme es cada tabla. La primera aguanta casi siempre; las últimas
// son una moneda al aire. Ese salto de tensión es lo que hace el juego.
export const FIRMEZA = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.62, 0.55, 0.48, 0.4];

export const TABLAS = FIRMEZA.length;

/**
 * Multiplicador al pisar cada tabla. Sale de la probabilidad de llegar hasta
 * ahí, de modo que se devuelva el 97% sin importar dónde te bajes.
 */
export function multiplicadores(): number[] {
  const out: number[] = [];
  let acumulado = 1;
  for (const firmeza of FIRMEZA) {
    acumulado *= firmeza;
    out.push(Math.floor((DEVOLUCION / acumulado) * 100) / 100);
  }
  return out;
}
