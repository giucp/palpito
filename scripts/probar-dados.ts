// ¿Son justos los dados?
//
// Acá hay fichas de por medio, así que no alcanza con que "parezca aleatorio".
// Se juegan 500.000 partidas y se comprueban cinco cosas distintas:
//
//   1. Cada dado saca sus seis caras por igual.
//   2. Ninguno de los dos lados tiene ventaja. Es lo más importante: si el que
//      crea el reto ganara aunque fuera un 51%, el juego estaría amañado.
//   3. Las sumas siguen la campana de 2d6 (el 7 el doble que el 4, etc.).
//   4. Los empates antes de desempatar caen en el 11,3% teórico.
//   5. Después del desempate no queda prácticamente ningún empate.
//
// Y aparte, que la semilla mande: la misma semilla tiene que dar siempre la
// misma partida, que es lo que permite comprobarla después.
//
// Uso: node scripts/probar-dados.ts [partidas]

import { jugarDados, RONDAS } from "../src/lib/dados.ts";
import { nuevaSemilla } from "../src/lib/azar.ts";

const N = Number(process.argv[2] ?? 500_000);

let fallos = 0;
const mal = (msg: string) => {
  console.log(`   ✗ ${msg}`);
  fallos++;
};
const bien = (msg: string) => console.log(`   ✓ ${msg}`);

const caras = new Map<number, number>();
const sumas = new Map<number, number>();
let ganaCreador = 0;
let ganaRival = 0;
let empatesFinales = 0;
let rondasEmpatadas = 0;
let rondasTotales = 0;
let maxRondas = 0;

console.log(`Jugando ${N.toLocaleString("es")} partidas de dados…\n`);

for (let i = 0; i < N; i++) {
  const p = jugarDados(nuevaSemilla());

  for (const r of p.rondas) {
    rondasTotales++;
    if (r.creador.suma === r.rival.suma) rondasEmpatadas++;
    for (const lado of [r.creador, r.rival]) {
      for (const d of lado.dados) caras.set(d, (caras.get(d) ?? 0) + 1);
    }
  }
  // Para la campana se mira **solo la primera ronda**, y esto tiene truco.
  //
  // La ronda que decide la partida no sirve: es, por definición, una en la que
  // las dos sumas son distintas. Eso deja fuera desproporcionadamente al 7, que
  // es la suma que más empata, y sobrerrepresenta al 2 y al 12. Midiéndola así,
  // unos dados perfectos parecen torcidos (se probó: el 7 caía a 15,7% y el 2
  // subía a 3,0%). La primera ronda siempre existe y no está condicionada por
  // nada, así que es la muestra limpia.
  const primera = p.rondas[0];
  sumas.set(primera.creador.suma, (sumas.get(primera.creador.suma) ?? 0) + 1);
  sumas.set(primera.rival.suma, (sumas.get(primera.rival.suma) ?? 0) + 1);

  maxRondas = Math.max(maxRondas, p.rondas.length);
  if (p.gana === "creador") ganaCreador++;
  else if (p.gana === "rival") ganaRival++;
  else empatesFinales++;
}

// ---- 1) Las caras de los dados ----
console.log("1) Reparto de las caras");
const totalCaras = [...caras.values()].reduce((a, b) => a + b, 0);
for (let c = 1; c <= 6; c++) {
  const pct = ((caras.get(c) ?? 0) / totalCaras) * 100;
  const desvio = Math.abs(pct - 100 / 6);
  console.log(`   ${c}: ${pct.toFixed(3)}%  (esperado 16.667%)`);
  if (desvio > 0.25) mal(`la cara ${c} se desvía ${desvio.toFixed(3)} puntos`);
}
if (fallos === 0) bien("las seis caras salen por igual");

// ---- 2) ¿Alguien tiene ventaja? ----
console.log("\n2) Ventaja entre los dos lados");
const decididas = ganaCreador + ganaRival;
const pctCreador = (ganaCreador / decididas) * 100;
console.log(`   crea: ${pctCreador.toFixed(3)}%  ·  rival: ${(100 - pctCreador).toFixed(3)}%`);
if (Math.abs(pctCreador - 50) > 0.4) mal(`el que crea gana el ${pctCreador.toFixed(3)}% — hay ventaja`);
else bien("ninguno de los dos lados tiene ventaja");

// ---- 3) La campana de 2d6 ----
console.log("\n3) Reparto de las sumas");
const ESPERADO: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};
const totalSumas = [...sumas.values()].reduce((a, b) => a + b, 0);
let peor = 0;
for (let s = 2; s <= 12; s++) {
  const pct = ((sumas.get(s) ?? 0) / totalSumas) * 100;
  const esp = (ESPERADO[s] / 36) * 100;
  peor = Math.max(peor, Math.abs(pct - esp));
  const barra = "█".repeat(Math.round(pct * 2));
  console.log(`   ${String(s).padStart(2)}: ${pct.toFixed(2)}% (esp. ${esp.toFixed(2)}%) ${barra}`);
}
if (peor > 0.35) mal(`la campana se desvía hasta ${peor.toFixed(2)} puntos`);
else bien("las sumas siguen la campana de dos dados");

// ---- 4) y 5) Empates ----
console.log("\n4) Empates");
const pctEmpateRonda = (rondasEmpatadas / rondasTotales) * 100;
console.log(`   rondas empatadas: ${pctEmpateRonda.toFixed(3)}%  (teórico 11.265%)`);
if (Math.abs(pctEmpateRonda - 11.265) > 0.3) mal("la tasa de empate por ronda no es la teórica");
else bien("los empates por ronda caen donde deben");

console.log(`   partidas sin resolver tras ${RONDAS} rondas: ${empatesFinales}`);
console.log(`   máximo de rondas que hizo falta: ${maxRondas}`);
if (empatesFinales > 0) mal(`${empatesFinales} partidas quedaron en empate (se devuelve la plata)`);
else bien("todas las partidas terminaron con un ganador");

// ---- 6) La semilla manda ----
console.log("\n5) La misma semilla da la misma partida");
const s = nuevaSemilla();
const a = JSON.stringify(jugarDados(s));
const b = JSON.stringify(jugarDados(s));
if (a !== b) mal("dos partidas con la misma semilla salieron distintas");
else bien("la partida se puede rehacer desde la semilla");

console.log(`\n${fallos === 0 ? "Todo cuadra: los dados son justos." : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
