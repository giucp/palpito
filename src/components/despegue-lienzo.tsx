"use client";

import { useEffect, useRef } from "react";

// Pixel art de verdad: se dibuja en un lienzo diminuto (200×140) y se escala
// sin suavizado, así cada píxel queda cuadrado y nítido. Nada de imágenes:
// todo son rectángulos, así que pesa cero y carga al instante.

const ANCHO = 200;
const ALTO = 140;

// Avión de perfil subiendo. C = casco, V = cabina, F = fuego del motor.
const NAVE = [
  "......CC..",
  ".....CCCC.",
  "..CCCCCCVC",
  "FFCCCCCCCC",
  "FFCCCCCCC.",
  "..CCCCC...",
  "...CC.....",
];

type Estado = "listo" | "volando" | "retirada" | "estrellada";

type Props = {
  estado: Estado;
  multiplicador: number;
  tema: "dark" | "light";
};

// Cada estrella tiene su propio parpadeo para que el cielo no se sienta muerto.
const ESTRELLAS = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 37 + 11) % ANCHO,
  y: (i * 23 + 7) % 88,
  fase: (i * 0.7) % (Math.PI * 2),
}));

// Perfil de cerros del fondo, en píxeles.
const CERROS = Array.from({ length: ANCHO }, (_, x) =>
  Math.round(
    14 +
      6 * Math.sin(x * 0.045) +
      4 * Math.sin(x * 0.11 + 1.3) +
      3 * Math.sin(x * 0.021 + 0.4)
  )
);

// El avión avanza mucho al principio y se va frenando: así nunca se sale del
// lienzo por más que suba el multiplicador.
const progreso = (m: number) => 1 - 1 / (1 + 0.32 * Math.max(0, m - 1));

export function DespegueLienzo({ estado, multiplicador, tema }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const inicio = useRef<number>(0);
  const datos = useRef({ estado, multiplicador, tema });
  datos.current = { estado, multiplicador, tema };

  useEffect(() => {
    const lienzo = ref.current;
    if (!lienzo) return;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let vivo = true;
    let cuadro = 0;
    inicio.current = performance.now();

    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const dibujarNave = (cx: number, cy: number, colorCasco: string, llama: boolean) => {
      for (let f = 0; f < NAVE.length; f++) {
        for (let c = 0; c < NAVE[f].length; c++) {
          const ch = NAVE[f][c];
          if (ch === ".") continue;
          let color = colorCasco;
          if (ch === "V") color = "#0b1020";
          if (ch === "F") {
            if (!llama || cuadro % 4 < 2) continue;
            color = cuadro % 8 < 4 ? "#ffb03d" : "#ff6b2c";
          }
          px(cx + c, cy + f, 1, 1, color);
        }
      }
    };

    const pintar = () => {
      if (!vivo) return;
      cuadro++;
      const { estado: st, multiplicador: mult, tema: tm } = datos.current;
      const oscuro = tm === "dark";
      const t = (performance.now() - inicio.current) / 1000;

      // ---- Cielo ----
      const cielo = ctx.createLinearGradient(0, 0, 0, ALTO);
      if (st === "estrellada") {
        cielo.addColorStop(0, oscuro ? "#2a0b12" : "#f7d6d6");
        cielo.addColorStop(1, oscuro ? "#12060a" : "#e8b9b9");
      } else if (oscuro) {
        cielo.addColorStop(0, "#0a1430");
        cielo.addColorStop(0.55, "#0d1a24");
        cielo.addColorStop(1, "#08090b");
      } else {
        cielo.addColorStop(0, "#bfe0f5");
        cielo.addColorStop(0.6, "#e6f0e2");
        cielo.addColorStop(1, "#f1f3ef");
      }
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, ANCHO, ALTO);

      // ---- Estrellas (solo de noche) ----
      if (oscuro && st !== "estrellada") {
        for (const e of ESTRELLAS) {
          const brillo = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + e.fase));
          px(e.x, e.y, 1, 1, `rgba(230,240,255,${brillo.toFixed(2)})`);
        }
      }

      // ---- Cerros del fondo, con desplazamiento lento ----
      const desliz = Math.floor(progreso(mult) * 26);
      for (let x = 0; x < ANCHO; x++) {
        const h = CERROS[(x + desliz) % ANCHO];
        px(x, ALTO - 12 - h, 1, h + 12, oscuro ? "#121b2b" : "#cfd9cc");
        px(x, ALTO - 12 - h, 1, 1, oscuro ? "#1b2942" : "#bcc9b8");
      }

      // ---- Suelo ----
      px(0, ALTO - 12, ANCHO, 12, oscuro ? "#0b1119" : "#dde5d8");
      for (let x = (desliz * 2) % 8; x < ANCHO; x += 8) {
        px(x, ALTO - 7, 4, 1, oscuro ? "#1d2a3a" : "#c2cdbd");
      }

      // ---- Trayectoria y avión ----
      const p = progreso(mult);
      const naveX = 16 + p * 150;
      const naveY = ALTO - 24 - p * 96;

      const lima = "#b6ff3d";
      const rojo = "#ff5a5a";
      const colorEstela = st === "estrellada" ? rojo : lima;

      // Estela: la misma curva que sigue el avión, pintada por detrás.
      const pasos = 46;
      for (let i = 0; i <= pasos; i++) {
        const q = (i / pasos) * p;
        const x = 16 + q * 150;
        const y = ALTO - 24 - q * 96;
        const grosor = i > pasos - 6 ? 2 : 1;
        px(x, y + 5, grosor, grosor, colorEstela);
        if (i % 3 === 0) px(x, y + 6, 1, 1, `${colorEstela}55`);
      }

      if (st === "estrellada") {
        // Explosión: anillos de píxeles que se abren.
        const edad = Math.min(1, (cuadro % 60) / 22);
        const radio = 3 + edad * 16;
        const tonos = ["#fff3c4", "#ffb03d", "#ff6b2c", "#ff5a5a"];
        for (let a = 0; a < 20; a++) {
          const ang = (a / 20) * Math.PI * 2;
          const r = radio * (0.7 + 0.3 * Math.sin(a * 2.3));
          px(
            naveX + 5 + Math.cos(ang) * r,
            naveY + 3 + Math.sin(ang) * r,
            2,
            2,
            tonos[a % tonos.length]
          );
        }
        px(naveX + 3, naveY + 1, 5, 5, "#3a1010");
      } else if (st === "retirada") {
        // Destello y el avión escapando hacia arriba.
        const salto = Math.min(30, (cuadro % 90) * 0.9);
        dibujarNave(naveX, naveY - salto, "#ffe98a", true);
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const r = 6 + (cuadro % 30) * 0.7;
          px(naveX + 5 + Math.cos(ang) * r, naveY + 3 + Math.sin(ang) * r, 1, 1, lima);
        }
      } else {
        const flote = st === "listo" ? Math.sin(t * 2.2) * 1.5 : Math.sin(t * 9) * 0.8;
        dibujarNave(naveX, naveY + flote, oscuro ? "#e8f0f5" : "#2b3440", st === "volando");
      }

      requestAnimationFrame(pintar);
    };

    pintar();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={ANCHO}
      height={ALTO}
      className="dsp-lienzo"
      aria-label="Animación del despegue"
    />
  );
}
