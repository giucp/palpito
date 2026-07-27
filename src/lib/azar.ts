import { createHash, randomBytes } from "crypto";

// El azar de los juegos entre amigos, en un solo sitio.
//
// La idea es la misma para todos: al crear el reto se inventa una semilla
// secreta y se publica **su hash** antes de que nadie juegue. Al terminar se
// revela la semilla, y cualquiera puede rehacer las cuentas y comprobar que el
// resultado estaba decidido desde el principio y que nadie lo tocó.
//
// Que esto viva acá y no dentro de cada juego no es orden por el orden: si cada
// juego se inventara su propio azar, habría que volver a demostrar que cada uno
// es justo. Así se demuestra una vez.

/** Un número de 0 a `tope-1`, decidido por la semilla y una etiqueta. */
export function numeroDe(semilla: string, etiqueta: string, tope: number): number {
  // 13 dígitos hexadecimales son 52 bits, más que de sobra. El resto introduce
  // un sesgo de una parte en 2^52 hacia los números bajos —hay que dividir 2^52
  // entre 6 y no da exacto— que son 15 ceros detrás de la coma. Para que se
  // notara en el reparto habría que jugar más partidas que átomos hay en una
  // ciudad.
  const hex = createHash("sha256").update(`${semilla}:${etiqueta}`).digest("hex").slice(0, 13);
  return parseInt(hex, 16) % tope;
}

/** La semilla secreta de un reto. */
export const nuevaSemilla = () => randomBytes(24).toString("hex");

/** Lo único que se publica antes de jugar. */
export const hashDe = (semilla: string) => createHash("sha256").update(semilla).digest("hex");
