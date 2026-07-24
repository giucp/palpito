"use client";

import { useEffect, useRef } from "react";

// Pixel art dibujado a mano en un lienzo de 200×120 que se escala sin
// suavizado. Todo son rectángulos: cero imágenes, cero librerías.

const ANCHO = 200;
const ALTO = 120;
const PASO = 34; // separación entre tablas, en píxeles del lienzo

// Gato de perfil. C = pelaje, O = ojo, R = rayas del lomo.
const GATO = [
  "..C.....C..",
  "..CC...CC..",
  "..CCCCCCC..",
  ".CCRCCRCCC.",
  ".CCCCCCCOC.",
  ".CCCCCCCCC.",
  "..CCCCCCC..",
  "..C.C.C.C..",
];

type Estado = "listo" | "jugando" | "cobrada" | "hundida";

type Props = {
  estado: Estado;
  posicion: number; // 0 = en tierra firme
  podridas: boolean[] | null; // solo al terminar
  total: number;
  tema: "dark" | "light";
};

const NUBES = [
  { x: 30, y: 16, w: 18 },
  { x: 96, y: 26, w: 24 },
  { x: 158, y: 12, w: 14 },
];

export function MuelleLienzo({ estado, posicion, podridas, total, tema }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const datos = useRef({ estado, posicion, podridas, total, tema });
  datos.current = { estado, posicion, podridas, total, tema };
  const camara = useRef(0);
  const gatoY = useRef(0);

  useEffect(() => {
    const lienzo = ref.current;
    if (!lienzo) return;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let vivo = true;
    let cuadro = 0;
    const t0 = performance.now();

    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const dibujarGato = (cx: number, cy: number, color: string, sombra: string) => {
      for (let f = 0; f < GATO.length; f++) {
        for (let c = 0; c < GATO[f].length; c++) {
          const ch = GATO[f][c];
          if (ch === ".") continue;
          let col = color;
          if (ch === "O") col = "#0b1020";
          if (ch === "R") col = sombra;
          px(cx + c, cy + f, 1, 1, col);
        }
      }
    };

    const pintar = () => {
      if (!vivo) return;
      cuadro++;
      const { estado: st, posicion: pos, podridas: pod, total: tot, tema: tm } = datos.current;
      const oscuro = tm === "dark";
      const t = (performance.now() - t0) / 1000;

      // La cámara persigue al gato con suavidad.
      const objetivo = Math.max(0, pos - 1) * PASO;
      camara.current += (objetivo - camara.current) * 0.12;
      const cam = camara.current;

      // ---- Cielo ----
      const cielo = ctx.createLinearGradient(0, 0, 0, ALTO);
      if (oscuro) {
        cielo.addColorStop(0, "#0b1a33");
        cielo.addColorStop(0.6, "#12283d");
        cielo.addColorStop(1, "#16303f");
      } else {
        cielo.addColorStop(0, "#a8d8f0");
        cielo.addColorStop(0.6, "#d9ecf5");
        cielo.addColorStop(1, "#eaf4f2");
      }
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, ANCHO, ALTO);

      // ---- Astro ----
      px(163, 18, 9, 9, oscuro ? "#e8eeff" : "#ffd75e");
      if (oscuro) px(166, 16, 6, 6, "#12283d"); // muesca lunar

      // ---- Nubes (van lento, dan sensación de avance) ----
      for (const n of NUBES) {
        const ciclo = ANCHO + 40;
        const x = (((n.x - cam * 0.12) % ciclo) + ciclo) % ciclo - 20;
        const col = oscuro ? "#1c3450" : "#ffffff";
        px(x, n.y, n.w, 3, col);
        px(x + 3, n.y - 2, n.w - 7, 2, col);
      }

      // ---- Mar ----
      const nivelMar = 78;
      px(0, nivelMar, ANCHO, ALTO - nivelMar, oscuro ? "#0d2233" : "#7fc2d8");
      for (let y = nivelMar + 4; y < ALTO; y += 5) {
        const desfase = Math.sin(t * 1.6 + y * 0.45) * 4;
        for (let x = -8; x < ANCHO; x += 14) {
          px(x + desfase + ((y * 3) % 7), y, 5, 1, oscuro ? "#16354a" : "#a5d8e6");
        }
      }
      px(0, nivelMar, ANCHO, 1, oscuro ? "#1d4a63" : "#bfe6ef");

      // ---- Tablas del muelle ----
      const yTabla = 70;
      for (let i = 0; i <= tot; i++) {
        const x = 22 + i * PASO - cam;
        if (x < -PASO || x > ANCHO + PASO) continue;

        const esTierra = i === 0;
        const pisada = i <= pos;
        const rota = pod && i > 0 && pod[i - 1];
        // Solo se sabe que una tabla estaba podrida cuando la partida terminó.
        const revelarRota = rota && st !== "jugando";

        let colorTabla = oscuro ? "#8a6b45" : "#b08a5c";
        let colorBorde = oscuro ? "#6b5133" : "#8d6d45";
        if (esTierra) {
          colorTabla = oscuro ? "#4a5c3a" : "#7d9463";
          colorBorde = oscuro ? "#38472c" : "#63784e";
        } else if (revelarRota) {
          colorTabla = "#5a3030";
          colorBorde = "#3d1f1f";
        } else if (pisada) {
          colorTabla = "#b6ff3d";
          colorBorde = "#7cb424";
        }

        const ancho = esTierra ? 30 : 24;
        if (revelarRota && i <= pos) {
          // La que cedió: dos mitades cayendo.
          px(x - 2, yTabla + 3, 10, 4, colorTabla);
          px(x + 14, yTabla + 5, 10, 4, colorTabla);
        } else {
          px(x, yTabla, ancho, 5, colorTabla);
          px(x, yTabla + 5, ancho, 1, colorBorde);
          // Postes que se hunden en el agua
          px(x + 3, yTabla + 6, 2, 12, colorBorde);
          px(x + ancho - 5, yTabla + 6, 2, 12, colorBorde);
        }
      }

      // ---- Gato ----
      const xGato = 22 + pos * PASO - cam + (pos === 0 ? 9 : 6);
      if (st === "hundida") {
        // Se hunde: burbujas y chapoteo.
        gatoY.current = Math.min(46, gatoY.current + 1.4);
        const y = yTabla - 8 + gatoY.current;
        if (gatoY.current < 26) dibujarGato(xGato, y, "#c9a227", "#a07f18");
        for (let b = 0; b < 5; b++) {
          const bt = (t * 2 + b * 0.6) % 2;
          px(xGato + 2 + b * 2, nivelMar - bt * 16, 1, 1, "#cfeaf5");
        }
        px(xGato - 2, nivelMar - 1, 14, 2, oscuro ? "#2a5f7d" : "#cfeaf5");
      } else {
        gatoY.current = 0;
        const brinco = st === "cobrada" ? Math.abs(Math.sin(t * 5)) * 6 : Math.sin(t * 2.4) * 1.2;
        dibujarGato(
          xGato,
          yTabla - 8 - brinco,
          st === "cobrada" ? "#ffe98a" : oscuro ? "#e8e2d6" : "#4a4034",
          st === "cobrada" ? "#c9a227" : oscuro ? "#c3b9a6" : "#2f2820"
        );
      }

      // ---- Brillos al cobrar ----
      if (st === "cobrada") {
        for (let a = 0; a < 10; a++) {
          const ang = (a / 10) * Math.PI * 2 + t * 2;
          const r = 12 + Math.sin(t * 3 + a) * 4;
          px(xGato + 5 + Math.cos(ang) * r, yTabla - 6 + Math.sin(ang) * r, 1, 1, "#b6ff3d");
        }
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
      className="mll-lienzo"
      aria-label="El muelle"
    />
  );
}
