// ¿Es aleatorio puro o hay control? Las dos cosas, y esto lo muestra:
// cada ronda es aleatoria e independiente, pero la DISTRIBUCIÓN está calibrada.
// Uso: node scripts/probar-varianza.js
const { createHash, randomBytes } = require("crypto");

const VENTAJA = 0.03;
const crash = (s) => {
  const n = parseInt(createHash("sha256").update(s).digest("hex").slice(0, 13), 16);
  return Math.max(1, Math.floor(((1 - VENTAJA) / (1 - n / 2 ** 52)) * 100) / 100);
};

// Un jugador que siempre apuesta 10 y retira en 2x
function sesion(rondas) {
  let saldo = 0;
  for (let i = 0; i < rondas; i++) {
    saldo -= 10;
    if (crash(randomBytes(16).toString("hex")) >= 2) saldo += 20;
  }
  return saldo;
}

console.log("Mil jugadores, cada uno apostando 10 fichas y retirando en 2x\n");
for (const rondas of [10, 50, 200, 1000, 5000]) {
  const res = Array.from({ length: 1000 }, () => sesion(rondas));
  const ganaron = res.filter((r) => r > 0).length;
  const medio = res.reduce((a, b) => a + b, 0) / res.length;
  const apostado = rondas * 10;
  res.sort((a, b) => a - b);
  console.log(
    `Tras ${String(rondas).padStart(4)} rondas: ${String(ganaron).padStart(3)} de 1000 van ganando · ` +
      `resultado medio ${medio >= 0 ? "+" : ""}${medio.toFixed(0)} fichas (${((1 + medio / apostado) * 100).toFixed(1)}% devuelto)`
  );
  console.log(
    `                  el peor ${res[0]} · el mejor +${res[999]} · la mitad entre ${res[250]} y ${res[750]}\n`
  );
}

// ¿Y si alguien tiene una racha brutal?
let mejor = 0;
for (let n = 0; n < 20000; n++) {
  const c = crash(randomBytes(16).toString("hex"));
  if (c > mejor) mejor = c;
}
console.log(`En 20.000 rondas, el multiplicador más alto que salió: ${mejor.toFixed(2)}x`);
console.log(`Con una apuesta de 10 fichas eso habrían sido ${(mejor * 10).toFixed(0)} fichas de un golpe.`);
