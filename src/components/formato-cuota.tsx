"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  cuotaAmericana,
  formatearCuota,
  FORMATO_POR_DEFECTO,
  type FormatoCuota,
} from "@/lib/cuota";

// Las casas grandes muestran las cuotas en decimal (1.96) o americano (+96 / -143).
// El usuario elige y la preferencia se guarda en el navegador. El cálculo vive en
// `@/lib/cuota` para que el servidor pueda usar el mismo al dibujar el ticket.
export type { FormatoCuota };
export { cuotaAmericana };

type Valor = {
  formato: FormatoCuota;
  cambiarFormato: (f: FormatoCuota) => void;
  fc: (decimal: number) => string; // formatea una cuota según la preferencia
};

const POR_DEFECTO = FORMATO_POR_DEFECTO;

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

  const fc = useCallback((decimal: number) => formatearCuota(decimal, formato), [formato]);

  return <Ctx.Provider value={{ formato, cambiarFormato, fc }}>{children}</Ctx.Provider>;
}
