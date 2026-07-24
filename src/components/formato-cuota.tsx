"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Las casas grandes muestran las cuotas en decimal (1.96) o americano (+96 / -143).
// El usuario elige y la preferencia se guarda en el navegador.
export type FormatoCuota = "decimal" | "americano";

export function cuotaAmericana(decimal: number): string {
  if (!Number.isFinite(decimal) || decimal <= 1) return "—";
  return decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
}

type Valor = {
  formato: FormatoCuota;
  cambiarFormato: (f: FormatoCuota) => void;
  fc: (decimal: number) => string; // formatea una cuota según la preferencia
};

// Americano por defecto, como las casas grandes: el signo dice de un vistazo
// quién es favorito. Quien prefiera decimal lo cambia en Cuenta.
const POR_DEFECTO: FormatoCuota = "americano";

const Ctx = createContext<Valor>({
  formato: POR_DEFECTO,
  cambiarFormato: () => {},
  fc: cuotaAmericana,
});

export const useFormatoCuota = () => useContext(Ctx);

export function ProveedorFormatoCuota({ children }: { children: React.ReactNode }) {
  const [formato, setFormato] = useState<FormatoCuota>(POR_DEFECTO);

  useEffect(() => {
    try {
      const g = localStorage.getItem("formatoCuota");
      if (g === "americano" || g === "decimal") setFormato(g);
    } catch {}
  }, []);

  const cambiarFormato = useCallback((f: FormatoCuota) => {
    setFormato(f);
    try {
      localStorage.setItem("formatoCuota", f);
    } catch {}
  }, []);

  const fc = useCallback(
    (decimal: number) =>
      formato === "americano" ? cuotaAmericana(decimal) : decimal.toFixed(2),
    [formato]
  );

  return <Ctx.Provider value={{ formato, cambiarFormato, fc }}>{children}</Ctx.Provider>;
}
