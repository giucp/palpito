"use client";

// Sonidos generados en el momento con Web Audio.
//
// **Nada de archivos, a propósito.** Un paquete de sonidos decentes son 100 o
// 200 KB que hay que descargar antes de que suene el primero; esto son unas
// líneas de código que ya vienen con la página y suenan al instante. Y como no
// hay archivo, tampoco hay una petición más al abrir la app.
//
// El navegador solo deja sonar tras un gesto del usuario, así que el contexto
// se crea en el primer toque (siempre viene de un botón).

type Efecto = "inicio" | "paso" | "gana" | "pierde" | "carta" | "dados";

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

// Quién quiere enterarse de que cambió. Es lo que permite que la pantalla lea
// esta preferencia con `useSyncExternalStore` en vez de copiarla a un estado
// suyo dentro de un efecto: así no hay un render de más al montar, y si algún
// día hay dos botones de sonido en pantalla no se contradicen entre ellos.
const oyentes = new Set<() => void>();

export function suscribirSonido(avisar: () => void): () => void {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function alternarSonido(): boolean {
  const nuevo = !preferencia();
  activo = nuevo;
  try {
    localStorage.setItem("sonido", nuevo ? "si" : "no");
  } catch {}
  for (const avisar of oyentes) avisar();
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

/**
 * Ruido filtrado en banda: el material con el que se hacen los sonidos reales.
 *
 * Una carta que se voltea y un dado que golpea la mesa no son notas: son ruido
 * con una forma. La diferencia entre los dos está en el filtro y en cuánto dura
 * —el roce del papel es largo y agudo, el golpe del dado es corto y con cuerpo—
 * así que las dos cosas salen de esta misma función con otros números.
 */
function banda(
  ac: AudioContext,
  desde: number,
  duracion: number,
  frecuencia: number,
  volumen: number,
  q = 1,
  hasta?: number
) {
  const muestras = Math.max(1, Math.floor(ac.sampleRate * duracion));
  const buffer = ac.createBuffer(1, muestras, ac.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;

  const fuente = ac.createBufferSource();
  const filtro = ac.createBiquadFilter();
  const gan = ac.createGain();
  filtro.type = "bandpass";
  filtro.Q.value = q;
  filtro.frequency.setValueAtTime(frecuencia, desde);
  if (hasta !== undefined) {
    filtro.frequency.exponentialRampToValueAtTime(Math.max(60, hasta), desde + duracion);
  }
  // Ataque casi instantáneo y caída rápida: así suena un golpe y no un soplido.
  gan.gain.setValueAtTime(0.0001, desde);
  gan.gain.exponentialRampToValueAtTime(volumen, desde + 0.004);
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

    case "carta":
      // El roce de una carta que se voltea.
      //
      // Son dos capas: el barrido de la carta despegándose —ruido agudo que baja
      // de 3500 a 900— y un golpecito seco al final, que es cuando toca la mesa.
      // Sin ese golpe suena a soplido; sin el barrido, a chasquido.
      banda(ac, t, 0.13, 3500, 0.09, 0.9, 900);
      banda(ac, t + 0.1, 0.05, 1500, 0.07, 2.5);
      break;

    case "dados": {
      // Dados rodando: golpes irregulares que se juntan y se apagan.
      //
      // Lo que hace que suene a dados y no a un redoble es que los tiempos NO
      // sean parejos. Se separan a mano, cada vez más juntos —como algo que
      // pierde impulso— y al final quedan dos golpes sueltos: los dados
      // asentándose. La frecuencia va cambiando un poco en cada golpe porque
      // dos caras nunca suenan igual.
      const golpes = [0, 0.075, 0.13, 0.175, 0.235, 0.28, 0.33, 0.42, 0.56];
      golpes.forEach((d, i) => {
        const resto = 1 - i / golpes.length;
        banda(ac, t + d, 0.045, 1100 + Math.random() * 900, 0.05 + resto * 0.07, 1.8);
      });
      // El asentamiento final, más grave y con algo de cuerpo.
      banda(ac, t + 0.62, 0.09, 420, 0.08, 1.2, 220);
      break;
    }
  }
}
