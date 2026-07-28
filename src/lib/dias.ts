// El día, escrito para que se lea de un vistazo.
//
// Vive aparte porque lo usan dos pantallas que no se conocen entre sí —los
// combos y el panel de señales— y las dos tenían el mismo problema: un selector
// lleno de `2026-07-27` obliga a leer, restar y recordar qué día es hoy. Con
// "Ayer" no hay nada que calcular.

/**
 * La zona en la que Pálpito cierra el día.
 *
 * Importa que sea una sola y que esté acá: si una pantalla usara la zona del
 * navegador y otra esta, un usuario de otro huso vería "Hoy" en un día y
 * "Ayer" en el otro para la misma fecha.
 */
export const ZONA = "America/Caracas";

/** El día de hoy, en la zona de Pálpito, como `2026-07-28`. */
export const hoyEnCaracas = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

/** El día anterior a una fecha `AAAA-MM-DD`. */
const anterior = (fecha: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(
    // A mediodía UTC para que restar un día no se coma la fecha por el desfase
    // de zona: a las 00:00 de una fecha, en Caracas todavía es el día anterior.
    new Date(Date.parse(`${fecha}T12:00:00Z`) - 86_400_000)
  );

/**
 * "Hoy", "Ayer" o "26 jul".
 *
 * `hoy` se puede pasar para que la pantalla y el servidor coincidan; si no, se
 * calcula.
 */
export function nombreDia(fecha: string, hoy = hoyEnCaracas()): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === anterior(hoy)) return "Ayer";
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${fecha}T12:00:00Z`));
}
