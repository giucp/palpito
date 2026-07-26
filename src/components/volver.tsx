"use client";

import { useRouter } from "next/navigation";
import { Icono } from "./iconos";

// Botón de volver para las pantallas que se abren fuera de la app (un desafío,
// por ejemplo).
//
// Usa el historial cuando lo hay: si llegaste desde Retos, volvés a Retos, no
// al inicio. Si llegaste desde un enlace de WhatsApp no hay a dónde volver, así
// que va a la pestaña que corresponde. Antes el único camino era tocar el logo,
// que siempre dejaba en Deportes aunque vinieras de otro lado.
//
// El destino por defecto es Apuestas → Retos, que es donde viven los desafíos
// desde el 2026-07-26. Antes era Juegos, que ahora es solo el catálogo.

export function Volver({
  a = "/?ver=retos",
  texto = "Volver",
}: {
  a?: string;
  texto?: string;
}) {
  const router = useRouter();

  return (
    <button
      className="dsf-volver"
      onClick={() => {
        // `history.length > 1` distingue "abrí esto desde la app" de "pegué el
        // enlace en el navegador".
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(a);
      }}
    >
      <Icono id="i-back" />
      {texto}
    </button>
  );
}
