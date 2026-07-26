"use client";

import type { Carta as TipoCarta } from "@/lib/carta";

// La carta, dibujada en SVG.
//
// Nada de imágenes ni de tipografía haciendo de dibujo: son formas, así que se
// ve nítida en cualquier pantalla y pesa unos pocos kilobytes. El palo se dibuja
// con rutas propias por la misma razón que los iconos del resto de la app —los
// caracteres ♠♥♦♣ los pinta cada sistema a su manera y en Android salen feos.

const ROJO = "#d2364b";
const NEGRO = "#1b2230";

// Los cuatro palos, cada uno una ruta en una caja de 24×24.
const PALOS: Record<string, { d: string; rojo: boolean }> = {
  "♠": {
    d: "M12 2C9 6.5 3.5 9.5 3.5 14a4.3 4.3 0 0 0 7.1 3.3c-.2 1.9-.9 3.3-1.9 4.2h6.6c-1-.9-1.7-2.3-1.9-4.2A4.3 4.3 0 0 0 20.5 14C20.5 9.5 15 6.5 12 2Z",
    rojo: false,
  },
  "♥": {
    d: "M12 21.4C7 17.6 3 14.4 3 10.3A4.6 4.6 0 0 1 12 8a4.6 4.6 0 0 1 9 2.3c0 4.1-4 7.3-9 11.1Z",
    rojo: true,
  },
  "♦": { d: "M12 2 20.5 12 12 22 3.5 12Z", rojo: true },
  "♣": {
    d: "M12 2a4 4 0 0 0-3.1 6.5A4 4 0 1 0 8 16.3a4 4 0 0 0 3-1.2c-.1 2.4-.8 4.2-1.9 5.2h6.6c-1.1-1-1.8-2.8-1.9-5.2a4 4 0 0 0 3 1.2 4 4 0 1 0-.9-7.8A4 4 0 0 0 12 2Z",
    rojo: false,
  },
};

function Palo({ palo, className }: { palo: string; className?: string }) {
  const p = PALOS[palo] ?? PALOS["♠"];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={p.d} fill={p.rojo ? ROJO : NEGRO} />
    </svg>
  );
}

export function CartaVista({
  carta,
  volteada,
  destacada,
}: {
  carta: TipoCarta | null;
  volteada: boolean; // true = se ve la cara; false = el reverso
  destacada?: "gana" | "pierde" | null;
}) {
  const rojo = carta ? PALOS[carta.palo]?.rojo : false;

  return (
    <div className={`cta ${volteada ? "cara" : ""} ${destacada ?? ""}`}>
      <div className="cta-giro">
        {/* Reverso */}
        <div className="cta-dorso">
          <svg viewBox="0 0 60 88" aria-hidden="true">
            <defs>
              <pattern id="cta-trama" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M0 10 L10 0 M-2 2 L2 -2 M8 12 L12 8" stroke="#0f1a12" strokeWidth="1.6" />
              </pattern>
            </defs>
            <rect x="4" y="4" width="52" height="80" rx="7" fill="#b6ff3d" />
            <rect x="4" y="4" width="52" height="80" rx="7" fill="url(#cta-trama)" opacity="0.5" />
            <rect x="9" y="9" width="42" height="70" rx="4" fill="none" stroke="#0f1a12" strokeWidth="1.4" opacity="0.55" />
            {/* El latido de la marca */}
            <path
              d="M16 44h6l3-8 4 15 4-20 3 13h4"
              fill="none"
              stroke="#0f1a12"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Cara */}
        <div className="cta-cara">
          {carta && (
            <>
              <span className="cta-esquina arriba" style={{ color: rojo ? ROJO : NEGRO }}>
                <b>{carta.figura}</b>
                <Palo palo={carta.palo} />
              </span>
              <Palo palo={carta.palo} className="cta-centro" />
              <span className="cta-esquina abajo" style={{ color: rojo ? ROJO : NEGRO }}>
                <b>{carta.figura}</b>
                <Palo palo={carta.palo} />
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
