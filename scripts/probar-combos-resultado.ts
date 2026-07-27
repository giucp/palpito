// ¿Resuelve bien los combos?
//
// Acá no hay dinero de por medio, pero sí algo que se rompe callado: una pata
// resuelta al revés no se nota en pantalla —dice "no pegó" con toda naturalidad—
// y envenena la estadística de la regla, que es justamente lo que le da sentido
// a la sección. Un error así se descubriría meses después, o nunca.
//
// Por eso se comprueban dos cosas distintas:
//
// 1. **Contra una fuente independiente.** El ganador que calcula `resolverPata`
//    comparando carreras se compara con el `isWinner` que la propia MLB publica.
//    Si el local y el visitante estuvieran cambiados, esto lo canta.
//
// 2. **Invariantes.** Más de X y menos de X no pueden ser las dos verdaderas ni
//    las dos falsas; ganar por 2 o más obliga a ganar; anotar y no anotar en la
//    primera se excluyen. Son las contradicciones que delatan un signo al revés.
//
// Uso: node scripts/probar-combos-resultado.ts [fecha]   (por defecto, ayer)

import { traerResultados, resolverPata } from "../src/lib/combos-resultado.ts";

const fecha =
  process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const MLB = "https://statsapi.mlb.com/api/v1";

let fallos = 0;
const mal = (msg: string) => {
  console.log(`   ✗ ${msg}`);
  fallos++;
};

const resultados = await traerResultados(fecha);
const r = await fetch(`${MLB}/schedule?sportId=1&date=${fecha}&hydrate=linescore`);
const juegos = (await r.json()).dates?.[0]?.games ?? [];

console.log(`Cartelera del ${fecha}: ${juegos.length} partidos\n`);

let probados = 0;
for (const g of juegos) {
  const pk = String(g.gamePk);
  const res = resultados.get(pk);
  if (!res) {
    mal(`${pk} no quedó en el mapa de resultados`);
    continue;
  }
  if (!res.finalizado || res.cancelado) continue;
  probados++;

  const visita = g.teams.away.team.name;
  const local = g.teams.home.team.name;
  const total = res.carrerasLocal + res.carrerasVisita;

  const ganaLocal = resolverPata({ mercado: "gana", lado: "local", equipo: local }, res);
  const ganaVisita = resolverPata({ mercado: "gana", lado: "visita", equipo: visita }, res);
  const palizaLocal = resolverPata({ mercado: "paliza", lado: "local", equipo: local }, res);
  const mas = resolverPata({ mercado: "total", mas: true, linea: 8.5 }, res);
  const menos = resolverPata({ mercado: "total", mas: false, linea: 8.5 }, res);
  const anota = resolverPata({ mercado: "primera", anota: true }, res);
  const noAnota = resolverPata({ mercado: "primera", anota: false }, res);

  console.log(
    `${visita} ${res.carrerasVisita} — ${res.carrerasLocal} ${local}` +
      `  · 1ª: ${res.primera} · total ${total}` +
      `  → gana ${ganaLocal ? "local" : "visita"}, ${mas ? "más" : "menos"} de 8.5,` +
      ` ${anota ? "sí" : "no"} anotan en la 1ª`
  );

  // 1) Contra el ganador que publica la MLB — fuente independiente del marcador.
  const localGanoSegunMlb = g.teams.home.isWinner === true;
  if (ganaLocal !== localGanoSegunMlb) {
    mal(
      `${visita} en ${local}: la MLB dice que ganó el ${localGanoSegunMlb ? "local" : "visitante"}` +
        ` y nosotros el ${ganaLocal ? "local" : "visitante"}`
    );
  }

  // 2) Invariantes.
  if (ganaLocal === ganaVisita) mal(`${visita} en ${local}: ganan los dos o ninguno`);
  if (mas === menos) mal(`${visita} en ${local}: más y menos de 8.5 dan lo mismo`);
  if (anota === noAnota) mal(`${visita} en ${local}: anotan y no anotan en la 1ª`);
  if (palizaLocal && !ganaLocal) mal(`${visita} en ${local}: gana por 2 o más pero no gana`);
  if (palizaLocal !== res.carrerasLocal - res.carrerasVisita >= 2) {
    mal(`${visita} en ${local}: la paliza no cuadra con la diferencia`);
  }
  if (res.primera !== null) {
    const primeraReal =
      (g.linescore?.innings?.[0]?.away?.runs ?? 0) + (g.linescore?.innings?.[0]?.home?.runs ?? 0);
    if (res.primera !== primeraReal) mal(`${visita} en ${local}: la 1ª entrada no cuadra`);
  }
}

// Un partido que no terminó no se resuelve: se deja pendiente. Comprobado
// aparte porque es la diferencia entre "todavía no" y "falló", y confundirlas
// sería dar por perdido un combo que sigue vivo.
const enJuego = juegos.find(
  (g: { status?: { abstractGameState?: string } }) => g.status?.abstractGameState === "Live"
);
if (enJuego) {
  const res = resultados.get(String(enJuego.gamePk))!;
  const v = resolverPata({ mercado: "gana", lado: "local", equipo: "" }, res);
  if (v !== null) mal("un partido en juego se resolvió en vez de quedar pendiente");
  else console.log("\nUn partido en juego quedó pendiente, como debe ser.");
}

console.log(
  `\n${probados} partidos terminados comprobados · ` +
    (fallos === 0 ? "todo cuadra" : `${fallos} FALLOS`)
);
process.exit(fallos === 0 ? 0 : 1);
