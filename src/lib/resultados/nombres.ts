// Emparejar equipos y partidos entre fuentes distintas.
//
// El catálogo lo arma The Odds API, pero los resultados vienen de fuentes
// gratuitas que escriben los nombres a su manera: "Velez Sarsfield BA" contra
// "Vélez Sarsfield", "Atletico Paranaense" contra "Athletico-PR", "Talleres"
// contra "Talleres (Córdoba)". Si el emparejamiento falla, el partido no se
// liquida y la apuesta queda colgada, así que esto se equivoca hacia el "no sé":
// ante la duda no empareja y el evento espera (o cae a la fuente de pago).
//
// La ayuda grande es que la hora de comienzo coincide al minuto entre The Odds
// API y ESPN, verificado sobre la cartelera real. Así que el nombre no decide
// solo: primero se filtra por horario y el nombre nada más desempata entre los
// pocos partidos que arrancan a la misma hora en la misma liga.

// Palabras que no distinguen a un equipo de otro: sobran en una fuente y faltan
// en la otra. Ojo con quitar de más: "Deportes Concepción" y "Universidad de
// Concepción" son equipos distintos, así que "deportes" y "universidad" se quedan.
const RUIDO = new Set([
  "fc", "cf", "sc", "ca", "ac", "afc", "cd", "ec", "sd", "ss", "aa",
  "club", "de", "del", "da", "do", "dos", "the",
]);

// Casos que ninguna normalización puede acercar, porque una fuente usa la sigla
// y la otra el nombre entero: no comparten ni las letras. Se agregan a mano y de
// a uno; `scripts/probar-emparejamiento.ts` avisa cuál falta.
// La clave es el nombre ya limpio (sin acentos ni puntuación) y el valor es el
// nombre limpio de la otra fuente.
const ALIAS: Record<string, string> = {
  lafc: "los angeles fc", // ESPN escribe LAFC; The Odds API, Los Angeles FC

  // Brasil distingue clubes por el estado, y cada fuente lo escribe distinto:
  // The Odds API lo deletrea ("Paranaense") y ESPN lo abrevia ("PR"). Sin esto,
  // "Atletico Paranaense" se parece MÁS a "Atlético-MG" que a "Athletico-PR",
  // que es justo el error que liquidaría una apuesta con el partido equivocado.
  "atletico paranaense": "athletico pr",
  "atletico mineiro": "atletico mg",
  "bragantino sp": "red bull bragantino",
};

function limpiar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fuera acentos: "Lanús" → "Lanus"
    .toLowerCase()
    .replace(/['’.]/g, "") // "Newell's" → "newells", "D.C." → "dc"
    .replace(/[^a-z0-9]+/g, " ") // "Athletico-PR" → "athletico pr"
    .trim();
}

// "Vélez Sarsfield BA" → ["velez", "sarsfield", "ba"]
export function normalizar(nombre: string): string[] {
  const base = limpiar(nombre);
  return (ALIAS[base] ?? base).split(" ").filter((t) => t.length > 0 && !RUIDO.has(t));
}

// Distancia de edición, para tolerar variantes de una letra
// ("athletico"/"atletico", "bulls"/"bull").
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      anterior = temp;
    }
  }
  return fila[b.length];
}

function similitudToken(a: string, b: string): number {
  if (a === b) return 1;
  const largo = Math.max(a.length, b.length);
  if (largo < 4) return 0; // en tokens cortos ("pr", "mg") una letra cambia todo
  const s = 1 - distancia(a, b) / largo;
  return s < 0.75 ? 0 : s; // por debajo de eso no es una variante, es otro equipo
}

// Cuánto de `a` aparece en `b`, dando más peso a los tokens largos: en
// "Aldosivi Mar del Plata" lo que identifica al equipo es "aldosivi".
function cobertura(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let peso = 0;
  let logrado = 0;
  for (const t of a) {
    const mejor = Math.max(0, ...b.map((u) => similitudToken(t, u)));
    peso += t.length;
    logrado += mejor * t.length;
  }
  return peso === 0 ? 0 : logrado / peso;
}

// 1 = idénticos. Es asimétrico a propósito: que a una fuente le sobre un
// agregado geográfico ("Talleres" vs "Talleres Córdoba") penaliza poco, pero
// penaliza algo, para que un nombre exacto siempre le gane a uno contenido.
export function parecido(a: string, b: string): number {
  const ta = normalizar(a);
  const tb = normalizar(b);
  const ida = cobertura(ta, tb);
  const vuelta = cobertura(tb, ta);
  return Math.max(ida, vuelta) * 0.7 + Math.min(ida, vuelta) * 0.3;
}

export type EventoLocal = {
  equipoA: string; // local
  equipoB: string; // visitante
  comienzaAt: string;
};

export type CandidatoExterno = {
  id: string;
  local: string;
  visitante: string;
  comienzaAt: string;
};

// Umbrales. Se eligieron midiendo contra la cartelera real con
// `scripts/probar-emparejamiento.ts`: con estos valores empareja todo lo que
// debe y no empareja nada que no deba.
const TOLERANCIA_MS = 90 * 60 * 1000; // los horarios coinciden al minuto; 90 min es holgura de sobra
const MIN_EQUIPO = 0.62; // cada equipo por separado tiene que parecerse
const MIN_TOTAL = 0.72; // y el promedio de los dos, un poco más
const MARGEN = 0.06; // el mejor tiene que despegarse del segundo, si no es ambiguo

// Segunda pasada, para cuando el horario no sirve de filtro. The Odds API
// publica el comienzo como medianoche cuando la hora todavía no está confirmada
// (pasa en Brasil), y ahí el partido real puede estar 18 h corrido. Como el
// horario deja de aportar, se le exige al nombre que sea casi exacto: en la
// misma liga y con dos días de margen, ningún par de equipos se repite.
const TOLERANCIA_AMPLIA_MS = 36 * 60 * 60 * 1000;
const MIN_TOTAL_AMPLIO = 0.95;

export type Emparejamiento<T extends CandidatoExterno> = {
  candidato: T;
  puntaje: number;
};

function mejorEn<T extends CandidatoExterno>(
  evento: EventoLocal,
  candidatos: T[],
  ventanaMs: number,
  minTotal: number
): Emparejamiento<T> | null {
  const hora = new Date(evento.comienzaAt).getTime();

  const puntuados = candidatos
    .filter((c) => Math.abs(new Date(c.comienzaAt).getTime() - hora) <= ventanaMs)
    .map((c) => {
      const local = parecido(evento.equipoA, c.local);
      const visitante = parecido(evento.equipoB, c.visitante);
      return { candidato: c, local, visitante, puntaje: (local + visitante) / 2 };
    })
    .filter((p) => p.local >= MIN_EQUIPO && p.visitante >= MIN_EQUIPO && p.puntaje >= minTotal)
    .sort((a, b) => b.puntaje - a.puntaje);

  if (puntuados.length === 0) return null;
  // Dos candidatos igual de buenos: no se puede decidir, mejor no liquidar.
  if (puntuados.length > 1 && puntuados[0].puntaje - puntuados[1].puntaje < MARGEN) return null;

  return { candidato: puntuados[0].candidato, puntaje: puntuados[0].puntaje };
}

export function emparejar<T extends CandidatoExterno>(
  evento: EventoLocal,
  candidatos: T[]
): Emparejamiento<T> | null {
  // Primero lo normal: mismo horario, nombre parecido.
  const ajustado = mejorEn(evento, candidatos, TOLERANCIA_MS, MIN_TOTAL);
  if (ajustado) return ajustado;
  // Y si no, el horario no era de fiar: que decida el nombre, casi exacto.
  return mejorEn(evento, candidatos, TOLERANCIA_AMPLIA_MS, MIN_TOTAL_AMPLIO);
}
