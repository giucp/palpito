// Comprueba que "El Muelle" devuelve el 97% sin importar dónde te bajes.
// Uso: node scripts/probar-muelle.js
const { createHash, randomBytes } = require("crypto");

const DEVOLUCION = 0.97;
const FIRMEZA = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.62, 0.55, 0.48, 0.4];

const mults = (() => {
  const out = [];
  let acc = 1;
  for (const f of FIRMEZA) {
    acc *= f;
    out.push(Math.floor((DEVOLUCION / acc) * 100) / 100);
  }
  return out;
})();

const podridas = (semilla) =>
  FIRMEZA.map((f, i) => {
    const hex = createHash("sha256").update(`${semilla}:${i}`).digest("hex").slice(0, 13);
    return parseInt(hex, 16) / 2 ** 52 >= f;
  });

console.log("Tabla   paga    aguanta   llegar hasta aquí");
let acumulado = 1;
for (let i = 0; i < FIRMEZA.length; i++) {
  acumulado *= FIRMEZA[i];
  console.log(
    `  ${String(i + 1).padStart(2)}   ${mults[i].toFixed(2).padStart(7)}x   ${(FIRMEZA[i] * 100).toFixed(0).padStart(3)}%      ${(acumulado * 100).toFixed(2).padStart(6)}%`
  );
}

const N = 300000;
console.log(`\nSimulando ${N.toLocaleString("es")} partidas por estrategia…\n`);
console.log("Si siempre te bajas en la tabla…   devolución");
for (let objetivo = 1; objetivo <= FIRMEZA.length; objetivo++) {
  let cobrado = 0;
  for (let n = 0; n < N; n++) {
    const p = podridas(randomBytes(16).toString("hex"));
    let vivo = true;
    for (let i = 0; i < objetivo; i++) {
      if (p[i]) {
        vivo = false;
        break;
      }
    }
    if (vivo) cobrado += mults[objetivo - 1];
  }
  console.log(`   ${String(objetivo).padStart(2)}                          ${((cobrado / N) * 100).toFixed(2)}%`);
}
