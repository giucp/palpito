"use client";

import { useEffect, useRef } from "react";

// Despegue vertical: el cohete sube y el cielo va cambiando por capas
// (noche → alto → estratosfera → espacio). Ese cambio de color es lo que da
// sensación de progreso, más que el número solo.
// Todo es pixel art dibujado a mano: cero imágenes, cero librerías.

const ANCHO = 200;
const ALTO = 150;

// Cohete de frente, 13×22. C = casco, R = franjas, V = ventana, A = aletas.
const COHETE = [
  ".....CC......",
  "....CCCC.....",
  "....CCCC.....",
  "...CCCCCC....",
  "...CCCCCC....",
  "..CCCCCCCC...",
  "..CCVVVVCC...",
  "..CCVVVVCC...",
  "..CCCCCCCC...",
  "..CCCCCCCC...",
  "..CRRRRRRC...",
  "..CRRRRRRC...",
  "..CCCCCCCC...",
  ".CCCCCCCCCC..",
  "AACCCCCCCCAA.",
  "AACCCCCCCCAA.",
  "AAACCCCCCAAA.",
  ".AACCCCCCAA..",
  "...CCCCCC....",
  "...CCCCCC....",
  "....CCCC.....",
  "....CCCC.....",
];

type Estado = "listo" | "volando" | "retirada" | "estrellada";

type Props = {
  estado: Estado;
  multiplicador: number;
  tema: "dark" | "light";
};

// Cada capa entra al alcanzar su multiplicador. La transición es suave para
// que se sienta un viaje y no un cambio brusco de pantalla.
export function capaDe(multiplicador: number): string {
  let nombre = CAPAS[0].nombre;
  for (const c of CAPAS) if (multiplicador >= c.desde) nombre = c.nombre;
  return nombre;
}

const CAPAS = [
  { desde: 1, nombre: "PISTA", cielo: ["#0a1430", "#12203a", "#16283c"], estrellas: 0.35 },
  { desde: 2, nombre: "NUBES", cielo: ["#111a3d", "#1b2b52", "#24365e"], estrellas: 0.55 },
  { desde: 5, nombre: "ESTRATOSFERA", cielo: ["#1a1140", "#2a1a5c", "#3a2470"], estrellas: 0.8 },
  { desde: 15, nombre: "ÓRBITA", cielo: ["#0a0620", "#140d33", "#1d1145"], estrellas: 1 },
  { desde: 50, nombre: "ESPACIO PROFUNDO", cielo: ["#04030d", "#080519", "#0d0a24"], estrellas: 1 },
];

const CAPAS_CLARO = [
  { desde: 1, nombre: "PISTA", cielo: ["#bfe0f5", "#d8ecf7", "#eaf4f2"], estrellas: 0 },
  { desde: 2, nombre: "NUBES", cielo: ["#9ccdf0", "#c2e2f5", "#dcefef"], estrellas: 0 },
  { desde: 5, nombre: "ESTRATOSFERA", cielo: ["#5a9fd4", "#8fc4e8", "#b8dced"], estrellas: 0.3 },
  { desde: 15, nombre: "ÓRBITA", cielo: ["#2a4a7a", "#4a72a8", "#7aa3cc"], estrellas: 0.7 },
  { desde: 50, nombre: "ESPACIO PROFUNDO", cielo: ["#0d1a33", "#1d2f52", "#33507a"], estrellas: 1 },
];

const ESTRELLAS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 41 + 13) % ANCHO,
  y: (i * 29 + 5) % ALTO,
  fase: (i * 0.83) % (Math.PI * 2),
  brillo: 0.4 + ((i * 7) % 10) / 16,
}));

const mezclar = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
};

export function DespegueLienzo({ estado, multiplicador, tema }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const datos = useRef({ estado, multiplicador, tema });
  datos.current = { estado, multiplicador, tema };
  const caida = useRef(0);

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

    const dibujarCohete = (cx: number, cy: number, casco: string, franja: string) => {
      for (let f = 0; f < COHETE.length; f++) {
        for (let c = 0; c < COHETE[f].length; c++) {
          const ch = COHETE[f][c];
          if (ch === ".") continue;
          let color = casco;
          if (ch === "V") color = "#0b1020";
          if (ch === "R") color = franja;
          if (ch === "A") color = franja;
          px(cx + c, cy + f, 1, 1, color);
        }
      }
      // Reflejo de la ventana: un píxel claro que le da volumen.
      px(cx + 5, cy + 6, 1, 1, "#7fd4ff");
    };

    const pintar = () => {
      if (!vivo) return;
      cuadro++;
      const { estado: st, multiplicador: mult, tema: tm } = datos.current;
      const oscuro = tm === "dark";
      const capas = oscuro ? CAPAS : CAPAS_CLARO;
      const t = (performance.now() - t0) / 1000;

      // ---- Capa de cielo según la altura alcanzada ----
      let idx = 0;
      for (let i = 0; i < capas.length; i++) if (mult >= capas[i].desde) idx = i;
      const actual = capas[idx];
      const siguiente = capas[Math.min(idx + 1, capas.length - 1)];
      // Mezcla progresiva hacia la capa siguiente para que la transición se
      // sienta un viaje continuo y no un salto.
      const tramo =
        siguiente.desde > actual.desde
          ? Math.min(1, Math.max(0, (mult - actual.desde) / (siguiente.desde - actual.desde)))
          : 0;

      const cielo = ctx.createLinearGradient(0, 0, 0, ALTO);
      for (let p = 0; p < 3; p++) {
        cielo.addColorStop(p / 2, mezclar(actual.cielo[p], siguiente.cielo[p], tramo));
      }
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, ANCHO, ALTO);

      if (st === "estrellada") {
        px(0, 0, ANCHO, ALTO, "rgba(120,20,25,0.42)");
      }

      // ---- Estrellas: aparecen conforme se sube ----
      const densidad = actual.estrellas + (siguiente.estrellas - actual.estrellas) * tramo;
      if (densidad > 0.02) {
        // El desplazamiento hacia abajo da la sensación de que el cohete sube.
        const arrastre = (Math.log(Math.max(1, mult)) * 60) % ALTO;
        for (const e of ESTRELLAS) {
          if (e.brillo > densidad + 0.35) continue;
          const y = (e.y + arrastre) % ALTO;
          const parpadeo = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.5 + e.fase));
          px(e.x, y, 1, 1, `rgba(235,244,255,${(densidad * parpadeo).toFixed(2)})`);
        }
      }

      // ---- Suelo y torre: solo mientras se está abajo ----
      const alturaVuelo = Math.min(1, Math.log(Math.max(1, mult)) / Math.log(6));
      const ySuelo = ALTO - 14 + alturaVuelo * 40;
      if (ySuelo < ALTO + 4) {
        px(0, ySuelo, ANCHO, ALTO - ySuelo + 4, oscuro ? "#0c1a14" : "#c9d6c2");
        px(0, ySuelo, ANCHO, 1, oscuro ? "#1b3326" : "#aebfa6");
        // Torre de lanzamiento
        px(48, ySuelo - 26, 3, 26, oscuro ? "#2a3a4a" : "#8a97a3");
        px(48, ySuelo - 26, 12, 2, oscuro ? "#2a3a4a" : "#8a97a3");
        for (let y = ySuelo - 22; y < ySuelo; y += 6) px(51, y, 6, 1, oscuro ? "#22303e" : "#9aa7b3");
      }

      // ---- Cohete, siempre centrado: lo que se mueve es el mundo ----
      const cx = ANCHO / 2 - 6;
      const cyBase = ALTO / 2 - 16;

      if (st === "estrellada") {
        caida.current = Math.min(70, caida.current + 2.2);
        const cy = cyBase + caida.current;
        const giro = Math.sin(cuadro * 0.25) * 2;
        if (caida.current < 60) dibujarCohete(cx + giro, cy, "#8a6a6a", "#5a2a2a");
        // Explosión en anillos
        const edad = Math.min(1, (cuadro % 70) / 26);
        const radio = 4 + edad * 22;
        const tonos = ["#fff3c4", "#ffb03d", "#ff6b2c", "#ff5a5a"];
        for (let a = 0; a < 26; a++) {
          const ang = (a / 26) * Math.PI * 2;
          const r = radio * (0.65 + 0.35 * Math.sin(a * 1.9));
          px(cx + 6 + Math.cos(ang) * r, cyBase + 10 + Math.sin(ang) * r, 2, 2, tonos[a % 4]);
        }
      } else {
        const vibra = st === "volando" ? Math.sin(t * 22) * 0.9 : Math.sin(t * 2) * 1.2;
        const subida = st === "retirada" ? Math.min(50, (cuadro % 120) * 1.1) : 0;
        const cy = cyBase + vibra - subida;

        // Llama: crece con la velocidad, parpadea por cuadros.
        if (st === "volando" || st === "retirada") {
          const largo = 6 + (cuadro % 4) * 2 + Math.min(10, mult);
          for (let i = 0; i < largo; i++) {
            const w = Math.max(1, 6 - Math.floor(i / 2));
            const color = i < 3 ? "#fff3c4" : i < largo * 0.55 ? "#ffb03d" : "#ff6b2c";
            px(cx + 6 - w / 2, cy + 22 + i, w, 1, color);
          }
          // Humo que queda atrás
          for (let s = 0; s < 5; s++) {
            const sy = cy + 30 + s * 7 + ((cuadro * 2) % 7);
            px(cx + 4 + Math.sin(t * 3 + s) * 3, sy, 2, 2, "rgba(190,200,215,0.16)");
          }
        }

        dibujarCohete(
          cx,
          cy,
          st === "retirada" ? "#ffe98a" : "#e8eef5",
          st === "retirada" ? "#c9a227" : "#ff5a5a"
        );
      }

      requestAnimationFrame(pintar);
    };

    pintar();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (estado !== "estrellada") caida.current = 0;
  }, [estado]);

  return (
    <canvas
      ref={ref}
      width={ANCHO}
      height={ALTO}
      className="dsp-lienzo"
      aria-label="Despegue del cohete"
    />
  );
}
