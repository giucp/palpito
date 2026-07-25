// Formato de cuotas, sin depender del navegador.
//
// Vive acá y no en el componente porque la imagen del ticket se dibuja en el
// servidor y necesita formatear con el mismo criterio: si la pantalla dice +310
// y la imagen que compartís dice 4.10, parecen dos apuestas distintas.

export type FormatoCuota = "decimal" | "americano";

// Americano por defecto, como las casas grandes: el signo dice de un vistazo
// quién es favorito. Quien prefiera decimal lo cambia en Cuenta.
export const FORMATO_POR_DEFECTO: FormatoCuota = "americano";

export function cuotaAmericana(decimal: number): string {
  if (!Number.isFinite(decimal) || decimal <= 1) return "—";
  return decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
}

export function formatearCuota(decimal: number, formato: FormatoCuota): string {
  return formato === "americano" ? cuotaAmericana(decimal) : decimal.toFixed(2);
}

export function esFormato(v: string | null): v is FormatoCuota {
  return v === "americano" || v === "decimal";
}
