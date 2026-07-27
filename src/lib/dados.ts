// Con extensión .ts, como en `resultados/index.ts`: así `scripts/probar-dados.ts`
// puede importar este archivo con node y probar el código que de verdad corre.
import { numeroDe } from "./azar.ts";

// Dados: dos cada uno, gana quien sume más.
//
// Verificable igual que la carta: todo sale de una semilla secreta cuyo hash se
// publica antes de que nadie juegue (ver `azar.ts`).
//
// ## El desempate
//
// Con dos dados contra dos dados se empata **1 de cada 9 partidas** (11,3%: hay
// 146 formas de igualar entre las 1296 posibles). Es demasiado seguido para
// terminar en "no ganó nadie", así que se vuelve a tirar.
//
// Lo importante: **las tiradas de desempate ya están decididas desde el
// principio**, no se sortean cuando hace falta. La semilla define de una vez una
// serie de rondas, y se juega la primera en la que las sumas se separan. Eso
// mantiene la partida comprobable de punta a punta —con la semilla se rehacen
// todas las rondas, incluidas las empatadas— y hace que no importe quién tira
// primero ni cuánto tarde el otro.
//
// Con 12 rondas, la probabilidad de que empaten las 12 es de 3 entre un billón.
// Si pasara, se devuelve la plata: el código lo contempla porque "casi nunca" no
// es "nunca".

export const RONDAS = 12;

export type Tirada = {
  dados: [number, number];
  suma: number;
};

export type Ronda = { creador: Tirada; rival: Tirada };

export type Partida = {
  // Las rondas jugadas: las que empataron y, al final, la que decidió. En la
  // enorme mayoría de las partidas es una sola.
  rondas: Ronda[];
  gana: "creador" | "rival" | "empate";
};

const unDado = (semilla: string, etiqueta: string) => numeroDe(semilla, etiqueta, 6) + 1;

function tirada(semilla: string, ronda: number, quien: "creador" | "rival"): Tirada {
  const a = unDado(semilla, `dados:${quien}:${ronda}:a`);
  const b = unDado(semilla, `dados:${quien}:${ronda}:b`);
  return { dados: [a, b], suma: a + b };
}

/** La partida entera, decidida por la semilla. */
export function jugarDados(semilla: string): Partida {
  const rondas: Ronda[] = [];
  for (let i = 0; i < RONDAS; i++) {
    const creador = tirada(semilla, i, "creador");
    const rival = tirada(semilla, i, "rival");
    rondas.push({ creador, rival });
    if (creador.suma !== rival.suma) {
      return { rondas, gana: creador.suma > rival.suma ? "creador" : "rival" };
    }
  }
  return { rondas, gana: "empate" };
}

/** Solo lo de uno de los dos, que es lo único que se le puede enseñar antes de que jueguen los dos. */
export function tiradasDe(semilla: string, quien: "creador" | "rival"): Tirada[] {
  return jugarDados(semilla).rondas.map((r) => r[quien]);
}
