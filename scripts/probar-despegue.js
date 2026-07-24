// Comprueba que la curva de "Despegue" reparte como debe.
// Uso: node scripts/probar-despegue.js
const { createHash, randomBytes } = require("crypto");

const VENTAJA = 0.03;
const TOPE = 1000;

function puntoCrash(semilla) {
  const hex = createHash("sha256").update(semilla).digest("hex").slice(0, 13);
  const n = parseInt(hex, 16);
  const r = n / 2 ** 52;
  return Math.min(TOPE, Math.max(1, Math.floor(((1 - VENTAJA) / (1 - r)) * 100) / 100));
}

const N = 200000;
const puntos = [];
for (let i = 0; i < N; i++) puntos.push(puntoCrash(randomBytes(24).toString("hex")));

const pct = (x) => ((puntos.filter((p) => p >= x).length / N) * 100).toFixed(2);
console.log(`Rondas simuladas: ${N.toLocaleString("es")}\n`);
console.log("Probabilidad de llegar a…   real     teórica (0.97/x)");
for (const x of [1.5, 2, 3, 5, 10, 50, 100]) {
  console.log(`   ${String(x).padStart(5)}x        ${pct(x).padStart(6)}%   ${((97 / x)).toFixed(2)}%`);
}

// Devolución al jugador: si siempre retiraras en X, ¿cuánto recuperas?
console.log("\nDevolución al jugador si retiras siempre en…");
for (const x of [1.2, 1.5, 2, 3, 5]) {
  const ganadas = puntos.filter((p) => p >= x).length;
  console.log(`   ${String(x).padStart(4)}x   ${(((ganadas * x) / N) * 100).toFixed(2)}%`);
}

const inmediatas = puntos.filter((p) => p <= 1.01).length;
console.log(`\nSe estrella de inmediato (≤1.01x): ${((inmediatas / N) * 100).toFixed(2)}%`);
console.log(`Multiplicador mediano: ${puntos.sort((a, b) => a - b)[Math.floor(N / 2)].toFixed(2)}x`);
