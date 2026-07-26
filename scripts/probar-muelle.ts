import { pasosDelMuelle, cede, PREMIOS, FIRMEZA, TABLAS } from "../src/lib/muelle.ts";

const N = 400_000;
console.log(`Simulación de ${N.toLocaleString("es")} partidas por estrategia\n`);
console.log(" me bajo en   veces que llego   esperado   retorno real   ventaja");

for (let objetivo = 1; objetivo <= TABLAS; objetivo++) {
  let llegadas = 0;
  let devuelto = 0;
  for (let n = 0; n < N; n++) {
    const pasos = pasosDelMuelle(`sim-${objetivo}-${n}`);
    let vivo = true;
    for (let i = 0; i < objetivo && vivo; i++) {
      // El jugador elige al azar: no puede saber cuál está podrida.
      const lado = Math.random() < 0.5 ? 0 : 1;
      if (cede(pasos[i], lado)) vivo = false;
    }
    if (vivo) {
      llegadas++;
      devuelto += PREMIOS[objetivo - 1];
    }
  }
  let teorico = 1;
  for (let i = 0; i < objetivo; i++) teorico *= FIRMEZA[i];
  const rtp = devuelto / N;
  console.log(
    String(objetivo).padStart(12),
    ((llegadas / N) * 100).toFixed(2).padStart(14) + "%",
    ((teorico * 100).toFixed(2) + "%").padStart(11),
    ((rtp * 100).toFixed(3) + "%").padStart(14),
    (((1 - rtp) * 100).toFixed(3) + "%").padStart(10)
  );
}
