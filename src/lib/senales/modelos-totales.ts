import { posicion, ventaja } from "./normalizar.ts";
import type { Modelo } from "./tipos.ts";
import { fipEfectivo, type Partido } from "./datos.ts";

// Los modelos de totales: más o menos carreras que la línea de la casa.
//
// ## Por qué no se pueden reusar los modelos de ganador
//
// Los de ganador comparan **equipo contra equipo**: 50 es el empate y 90 quiere
// decir "este es mucho mejor que el otro". Acá eso no sirve, porque la pregunta
// no es quién es mejor sino **cuántas carreras van a caer entre los dos**. Dos
// ofensivas horribles enfrentadas dan un modelo de ganador en 50 —están
// igualadas— y un total bajísimo.
//
// Así que estos modelos miden otra cosa: **cuánto empuja este partido hacia
// arriba**, de 0 a 100, con 50 como neutral. Y como la apuesta tiene dos lados,
// el candidato "menos" es simplemente `100 − score`. Eso mantiene la simetría
// sin escribir cada modelo dos veces.
//
// ## Lo que sigue siendo igual
//
// La normalización es posicional dentro de la jornada: "de los doce partidos de
// hoy, este es de los que más carreras promete". No una curva inventada.

export type CandidatoTotal = {
  partido: Partido;
  tipo: "mas" | "menos";
  linea: number;
};

/** Da vuelta el score si el candidato es el "menos". */
const segunLado = (c: CandidatoTotal, empujeArriba: number) =>
  c.tipo === "mas" ? empujeArriba : 100 - empujeArriba;

const unaCifra = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------- abridores

/**
 * Los dos abridores juntos. Es lo que más manda en un total.
 *
 * Se suman los FIP y se mira dónde cae esa suma entre los partidos del día: un
 * partido donde abren dos con FIP 5.00 promete muchas más carreras que uno con
 * dos en 3.00, y eso no depende de cuál de los dos es mejor.
 */
const abridores: Modelo<CandidatoTotal> = {
  id: "abridores",
  nombre: "Abridores",
  peso: 30,
  mirar: (c) => {
    // `fipEfectivo` y no `.fip` a secas: si un abridor no llega al mínimo de
    // entradas de la temporada se lo juzga por sus últimas salidas. Con `.fip`
    // directo, un solo abridor con pocas entradas dejaba el partido entero sin
    // el modelo que más pesa, y eso son dos candidatos de totales perdidos.
    const l = fipEfectivo(c.partido.abridorLocal);
    const v = fipEfectivo(c.partido.abridorVisita);
    if (l === null || v === null) return null;

    const suma = l + v;
    // Cuanto MÁS alta la suma de FIP, más carreras: por eso `mayorEsMejor` va en
    // true aunque un FIP alto sea malo para el lanzador.
    const empuje = posicion(suma, c.partido.jornada.fipsSumados, true);
    if (empuje === null) return null;

    const motivos: string[] = [];
    if (empuje >= 75) motivos.push(`Los dos abridores permiten bastante (FIP suman ${unaCifra(suma)})`);
    else if (empuje <= 25) motivos.push(`Duelo de pitcheo: los FIP suman ${unaCifra(suma)}`);
    else motivos.push(`Abridores del montón (FIP suman ${unaCifra(suma)})`);

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: { fipSumado: Number(unaCifra(suma)), empujeArriba: empuje },
    };
  },
};

// ------------------------------------------------------------------ bullpens

const bullpens: Modelo<CandidatoTotal> = {
  id: "bullpens",
  nombre: "Bullpens",
  peso: 18,
  mirar: (c) => {
    const l = c.partido.local.bullpen;
    const v = c.partido.visita.bullpen;
    if (!l || !v) return null;

    const suma = l.era + v.era;
    const empuje = posicion(suma, c.partido.jornada.erasBullpenSumadas, true);
    if (empuje === null) return null;

    const motivos: string[] = [];
    if (empuje >= 75) motivos.push(`Bullpens flojos de los dos lados (efectividad suma ${unaCifra(suma)})`);
    else if (empuje <= 25) motivos.push(`Dos bullpens sólidos (efectividad suma ${unaCifra(suma)})`);
    else motivos.push(`Bullpens del montón`);

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: { eraSumada: Number(unaCifra(suma)), empujeArriba: empuje },
    };
  },
};

// ------------------------------------------------------------------ ofensivas

const ofensivas: Modelo<CandidatoTotal> = {
  id: "ofensivas",
  nombre: "Ofensivas",
  peso: 20,
  mirar: (c) => {
    const l = c.partido.local.ofensiva;
    const v = c.partido.visita.ofensiva;
    if (!l || !v) return null;

    const suma = l.carrerasPorJuego + v.carrerasPorJuego;
    const empuje = posicion(suma, c.partido.jornada.carrerasSumadas, true);
    if (empuje === null) return null;

    const motivos = [
      empuje >= 75
        ? `Dos ofensivas que producen (${unaCifra(suma)} carreras por juego entre las dos)`
        : empuje <= 25
          ? `Dos ofensivas flojas (${unaCifra(suma)} carreras por juego entre las dos)`
          : `Ofensivas del montón (${unaCifra(suma)} entre las dos)`,
    ];

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: { carrerasSumadas: Number(unaCifra(suma)), empujeArriba: empuje },
    };
  },
};

// -------------------------------------------------------------------- parque

/**
 * El estadio. Por ahora **solo por altura**, y hay que decirlo.
 *
 * La altura es un factor real y grande —Coors Field está a 5190 pies y es el
 * parque más ofensivo de la liga por lejos— pero no es lo único: las distancias
 * de las cercas y el aire de cada ciudad también pesan, y eso pide una tabla de
 * factores de parque que todavía no tenemos.
 *
 * Se deja con peso bajo justamente por eso: mide algo verdadero pero incompleto,
 * y fingir que mide el parque entero sería peor que no medirlo.
 */
const parque: Modelo<CandidatoTotal> = {
  id: "parque",
  nombre: "Parque",
  peso: 8,
  mirar: (c) => {
    const e = c.partido.estadio;
    if (!e || e.elevacion === null) return null;

    const empuje = posicion(e.elevacion, c.partido.jornada.elevaciones, true);
    if (empuje === null) return null;

    const motivos: string[] = [];
    if (e.elevacion >= 3000) motivos.push(`${e.nombre} está a ${e.elevacion} pies: el aire fino empuja la pelota`);
    else if (e.elevacion <= 100) motivos.push(`${e.nombre} está al nivel del mar`);
    else motivos.push(`${e.nombre}, ${e.elevacion} pies`);

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: { elevacion: e.elevacion, empujeArriba: empuje },
    };
  },
};

// --------------------------------------------------------------------- clima

/**
 * Temperatura y viento.
 *
 * El viento solo cuenta con su dirección: 20 km/h hacia el jardín central empuja
 * la pelota y 20 km/h hacia home la frena, así que la velocidad sola no dice
 * nada. `empuja` ya viene resuelto en los datos, cruzando la dirección del
 * viento con la orientación del estadio.
 *
 * El calor también suma: el aire caliente es menos denso y la pelota viaja más.
 */
const clima: Modelo<CandidatoTotal> = {
  id: "clima",
  nombre: "Clima",
  peso: 12,
  mirar: (c) => {
    const cl = c.partido.clima;
    if (!cl) return null;

    // Bajo techo cerrado no hay clima que valga: se declara neutral en vez de
    // inventarle un empuje.
    if (cl.bajoTecho) {
      const datos: Record<string, number> = { bajoTecho: 1 };
      return { score: 50, motivos: ["Estadio techado: el clima no influye"], datos };
    }
    if (cl.empuja === null || !Number.isFinite(cl.viento)) return null;

    // Viento: la componente por la velocidad. 25 km/h de frente o de espalda es
    // mucho para una pelota de béisbol.
    const porViento = 50 + (cl.empuja * Math.min(cl.viento, 30) * 50) / 30;
    // Temperatura: 15 °C frena, 32 °C empuja.
    const porTemperatura = Number.isFinite(cl.temperatura)
      ? 50 + ((cl.temperatura - 23) * 50) / 12
      : 50;
    const empuje = Math.round(
      Math.max(0, Math.min(100, porViento * 0.65 + porTemperatura * 0.35))
    );

    const motivos: string[] = [];
    if (cl.viento >= 12 && cl.empuja >= 0.4) motivos.push(`Viento de ${Math.round(cl.viento)} km/h hacia el jardín: empuja`);
    else if (cl.viento >= 12 && cl.empuja <= -0.4) motivos.push(`Viento de ${Math.round(cl.viento)} km/h de frente: frena`);
    else motivos.push(`Viento flojo o cruzado (${Math.round(cl.viento)} km/h)`);
    if (cl.temperatura >= 30) motivos.push(`${Math.round(cl.temperatura)} °C: el aire caliente ayuda a la pelota`);
    else if (cl.temperatura <= 16) motivos.push(`${Math.round(cl.temperatura)} °C: hace frío y la pelota viaja menos`);
    if (cl.lluvia >= 50) motivos.push(`${Math.round(cl.lluvia)}% de lluvia`);

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: {
        temperatura: Math.round(cl.temperatura),
        viento: Math.round(cl.viento),
        empujaViento: Number(cl.empuja.toFixed(2)),
        empujeArriba: empuje,
      },
    };
  },
};

// ------------------------------------------------------------------ descanso

/**
 * Bullpens cansados = más carreras.
 *
 * Un bullpen que tiró mucho en los últimos días llega con sus mejores brazos sin
 * disponibilidad, y los que entran son los de atrás. Es de las señales más
 * claras hacia arriba, y es independiente de qué tan bueno sea el bullpen en
 * general —que ya lo mide otro modelo.
 */
const descanso: Modelo<CandidatoTotal> = {
  id: "descanso",
  nombre: "Descanso",
  peso: 7,
  mirar: (c) => {
    const l = c.partido.local.desgaste;
    const v = c.partido.visita.desgaste;
    if (!l || !v) return null;

    const suma = l.entradas3dias + v.entradas3dias;
    // 18 entradas entre los dos en tres días es normal; 28 es mucho.
    const empuje = ventaja(suma, 20, 8, true);

    const motivos: string[] = [];
    if (suma >= 26) motivos.push(`Los dos bullpens vienen exigidos (${suma.toFixed(1)} entradas en tres días)`);
    else if (suma <= 12) motivos.push(`Los dos bullpens llegan descansados`);
    else motivos.push(`Carga normal de bullpen`);

    return {
      score: segunLado(c, empuje),
      motivos,
      datos: { entradas3dias: Number(suma.toFixed(1)), empujeArriba: empuje },
    };
  },
};

// ------------------------------------------------------------------- mercado

// ------------------------------------------------------- por qué no hay mercado
//
// **En el motor de ganador el mercado es un modelo. Acá NO, y no es un olvido.**
//
// La línea de un total la elige la casa justamente para que los dos lados paguen
// casi lo mismo: si el "más de 8.5" pagara mucho mejor que el "menos", todo el
// dinero iría a un lado y moverían la línea a 9. Así que el precio de un total
// está clavado cerca del 50% **por construcción**, y un modelo que siempre dice
// 50 no es un voto: es ruido con nombre propio.
//
// Se probó y se vio: con el mercado adentro, ningún total pasaba nunca, porque
// ese modelo votaba en contra de los dos lados a la vez todos los días.
//
// Lo que sí tiene información es el **movimiento** de la línea —que abra en 8.5
// y llegue a 9 dice algo— pero eso pide guardar la línea varias veces al día, y
// hoy se guarda una sola. Queda anotado como lo próximo.

export const MODELOS_TOTALES: Modelo<CandidatoTotal>[] = [
  abridores,
  ofensivas,
  bullpens,
  clima,
  parque,
  descanso,
];

/**
 * En totales, un modelo por debajo de esto se está absteniendo, no votando en
 * contra. Ver el comentario de `Opciones` en `motor.ts`.
 */
export const OPCIONES_TOTALES = { neutral: 45 };

/**
 * Los dos candidatos de un total: más de la línea, o menos.
 *
 * Solo existe si el mercado publicó una línea. Sin línea no hay apuesta que
 * juzgar: inventarnos una y compararla con nuestros propios modelos sería
 * medirnos contra nosotros mismos.
 */
export const candidatosTotalDe = (p: Partido): CandidatoTotal[] =>
  p.total ? [
    { partido: p, tipo: "mas", linea: p.total.linea },
    { partido: p, tipo: "menos", linea: p.total.linea },
  ] : [];

export const nombreTotalDe = (c: CandidatoTotal) =>
  `${c.tipo === "mas" ? "Más" : "Menos"} de ${c.linea}`;
