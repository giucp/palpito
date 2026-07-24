"use client";

// Sonidos de 8 bits generados en el momento con Web Audio. Nada de archivos:
// pesa cero, carga al instante y combina con el pixel art.
// El navegador solo deja sonar tras un gesto del usuario, así que el contexto
// se crea en el primer toque (siempre viene de un botón).

type Efecto = "inicio" | "paso" | "gana" | "pierde";

let ctx: AudioContext | null = null;
let activo: boolean | null = null;

function preferencia(): boolean {
  if (activo !== null) return activo;
  try {
    activo = localStorage.getItem("sonido") !== "no";
  } catch {
    activo = true;
  }
  return activo;
}

export function sonidoActivo(): boolean {
  return preferencia();
}

export function alternarSonido(): boolean {
  const nuevo = !preferencia();
  activo = nuevo;
  try {
    localStorage.setItem("sonido", nuevo ? "si" : "no");
  } catch {}
  return nuevo;
}

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Una nota cuadrada, que es el timbre clásico de consola de 8 bits. */
function nota(
  ac: AudioContext,
  frecuencia: number,
  desde: number,
  duracion: number,
  volumen = 0.16,
  tipo: OscillatorType = "square",
  hasta?: number
) {
  const osc = ac.createOscillator();
  const gan = ac.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, desde);
  if (hasta !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, hasta), desde + duracion);
  // Ataque muy corto y caída suave: sin el ataque suena un "clic" feo.
  gan.gain.setValueAtTime(0.0001, desde);
  gan.gain.exponentialRampToValueAtTime(volumen, desde + 0.008);
  gan.gain.exponentialRampToValueAtTime(0.0001, desde + duracion);
  osc.connect(gan).connect(ac.destination);
  osc.start(desde);
  osc.stop(desde + duracion + 0.02);
}

/** Ruido corto, para el golpe de cuando algo revienta. */
function ruido(ac: AudioContext, desde: number, duracion: number, volumen = 0.14) {
  const muestras = Math.floor(ac.sampleRate * duracion);
  const buffer = ac.createBuffer(1, muestras, ac.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) {
    // Se apaga hacia el final para que no corte de golpe.
    datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras);
  }
  const fuente = ac.createBufferSource();
  const gan = ac.createGain();
  const filtro = ac.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(1400, desde);
  filtro.frequency.exponentialRampToValueAtTime(200, desde + duracion);
  gan.gain.setValueAtTime(volumen, desde);
  gan.gain.exponentialRampToValueAtTime(0.0001, desde + duracion);
  fuente.buffer = buffer;
  fuente.connect(filtro).connect(gan).connect(ac.destination);
  fuente.start(desde);
}

export function sonar(efecto: Efecto) {
  if (!preferencia()) return;
  const ac = contexto();
  if (!ac) return;
  const t = ac.currentTime;

  switch (efecto) {
    case "inicio":
      // Barrido hacia arriba: algo arranca.
      nota(ac, 200, t, 0.28, 0.14, "square", 620);
      break;
    case "paso":
      // Blip seco para cada salto.
      nota(ac, 760, t, 0.07, 0.11);
      nota(ac, 1140, t + 0.045, 0.06, 0.07);
      break;
    case "gana": {
      // Arpegio mayor: la típica fanfarria de premio.
      const notas = [523.25, 659.25, 783.99, 1046.5];
      notas.forEach((f, i) => nota(ac, f, t + i * 0.075, 0.16, 0.15));
      nota(ac, 1318.5, t + 0.3, 0.24, 0.1, "triangle");
      break;
    }
    case "pierde":
      // Caída grave más un golpe: se acabó.
      nota(ac, 420, t, 0.45, 0.15, "sawtooth", 70);
      ruido(ac, t, 0.32);
      break;
  }
}
