import { posicion, ventaja } from "./normalizar.ts";
import type { Modelo } from "./tipos.ts";
import type { Partido } from "./datos.ts";

// La tercera familia: **ganar por dos o más carreras** (la "run line" de −1.5).
//
// ## Por qué necesita sus propios modelos
//
// Esta apuesta es la unión de las otras dos, y esa es toda su gracia. Para
// cubrir el −1.5 hacen falta **dos cosas a la vez**:
//
//   1. Que el equipo sea claramente mejor — eso lo miden los modelos de ganador.
//   2. Que el partido tenga carreras — eso lo miden los de totales.
//
// Y la segunda es la que se olvida. Un abridor dominante en un parque frío
// termina en 2-1: ganaste y no cubriste. Un equipo mucho mejor que el rival en
// un partido de pocas carreras es **mal candidato a run line aunque sea buen
// candidato a ganador**, y si no se mide el ambiente de carreras aparte, esa
// distinción se pierde.
//
// Por eso acá hay un modelo que no existe en ninguna de las otras dos familias:
// `ambiente`, que pregunta "¿en este partido va a haber carreras suficientes
// para que una diferencia de dos sea posible?".
//
// ## El mercado sí es un modelo acá
//
// Al revés que en los totales. La línea de un total la mueve la casa hasta que
// los dos lados paguen igual, así que ese precio no dice nada; el −1.5 en
// cambio es una línea **fija**, y el precio se mueve libremente entre el 35% y
// el 55% según lo dominante que sea el favorito. Ahí sí hay información.

export type CandidatoLinea = {
  partido: Partido;
  lado: "local" | "visita";
  equipo: string;
  /** Lo que paga el mercado por ese equipo ganando por 2 o más. */
  precio: number;
};

const yo = (c: CandidatoLinea) => (c.lado === "local" ? c.partido.local : c.partido.visita);
const rival = (c: CandidatoLinea) => (c.lado === "local" ? c.partido.visita : c.partido.local);
const miAbridor = (c: CandidatoLinea) =>
  c.lado === "local" ? c.partido.abridorLocal : c.partido.abridorVisita;
const suAbridor = (c: CandidatoLinea) =>
  c.lado === "local" ? c.partido.abridorVisita : c.partido.abridorLocal;

const unaCifra = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------- abridores

/**
 * La ventaja del abridor propio sobre el de enfrente.
 *
 * Acá pesa **la ventaja y no la calidad absoluta**, al revés que en el ganador,
 * donde se miran las dos. Para cubrir el −1.5 lo que importa es la distancia
 * entre los dos abridores: dos ases enfrentados dan un partido cerrado por muy
 * buenos que sean los dos.
 */
const abridores: Modelo<CandidatoLinea> = {
  id: "abridores",
  nombre: "Ventaja al abrir",
  peso: 25,
  mirar: (c) => {
    const mio = miAbridor(c)?.fip;
    const suyo = suAbridor(c)?.fip;
    if (mio === null || mio === undefined || suyo === null || suyo === undefined) return null;

    const score = ventaja(mio, suyo, 0.8, false);
    const dif = suyo - mio;
    const motivos = [
      dif >= 1.2
        ? `Ventaja grande al abrir: ${unaCifra(dif)} de FIP`
        : dif >= 0.5
          ? `Ventaja al abrir de ${unaCifra(dif)} de FIP`
          : dif <= -0.5
            ? `Abre peor que el rival (${unaCifra(-dif)} de FIP)`
            : "Abridores parejos: difícil sacar dos carreras",
    ];
    return { score, motivos, datos: { fip: Number(unaCifra(mio)), fipRival: Number(unaCifra(suyo)) } };
  },
};

// ----------------------------------------------------------------- ofensiva

const ofensiva: Modelo<CandidatoLinea> = {
  id: "ofensiva",
  nombre: "Ventaja al batear",
  peso: 20,
  mirar: (c) => {
    const mia = yo(c).ofensiva;
    const suya = rival(c).ofensiva;
    if (!mia || !suya) return null;

    const score = ventaja(mia.carrerasPorJuego, suya.carrerasPorJuego, 0.8, true);
    const dif = mia.carrerasPorJuego - suya.carrerasPorJuego;
    const motivos = [
      dif >= 0.8
        ? `Produce ${unaCifra(dif)} carreras más por juego que el rival`
        : dif <= -0.8
          ? `Produce ${unaCifra(-dif)} carreras menos por juego`
          : "Ofensivas parejas",
    ];
    return {
      score,
      motivos,
      datos: { carreras: Number(unaCifra(mia.carrerasPorJuego)), carrerasRival: Number(unaCifra(suya.carrerasPorJuego)) },
    };
  },
};

// ------------------------------------------------------------------ bullpen

/**
 * El bullpen, que acá cuenta doble de raro: **una ventaja de dos carreras se
 * pierde en una entrada mala**. Es el modelo que más veces debería frenar una
 * run line que por lo demás pinta bien.
 */
const bullpen: Modelo<CandidatoLinea> = {
  id: "bullpen",
  nombre: "Bullpen que aguante",
  peso: 15,
  mirar: (c) => {
    const mio = yo(c).bullpen;
    const suyo = rival(c).bullpen;
    if (!mio || !suyo) return null;

    const enLaLiga = posicion(mio.era, c.partido.jornada.erasBullpen, false);
    if (enLaLiga === null) return null;
    const contraElOtro = ventaja(mio.era, suyo.era, 0.7, false);
    const score = Math.round(enLaLiga * 0.5 + contraElOtro * 0.5);

    const motivos = [
      enLaLiga >= 75
        ? `Bullpen de los que sostienen una ventaja (${unaCifra(mio.era)})`
        : enLaLiga <= 30
          ? `Bullpen flojo (${unaCifra(mio.era)}): una ventaja de dos no está segura`
          : `Bullpen del montón (${unaCifra(mio.era)})`,
    ];
    return { score, motivos, datos: { era: Number(unaCifra(mio.era)), posicion: enLaLiga } };
  },
};

// ----------------------------------------------------------------- ambiente

/**
 * **El modelo propio de esta familia, y el que la justifica.**
 *
 * En un partido de pocas carreras, una diferencia de dos es rara aunque uno sea
 * mucho mejor: los duelos de pitcheo terminan 2-1 y 1-0. Este modelo no mira
 * quién es mejor —de eso ya se ocupan los otros— sino si el partido va a tener
 * carreras suficientes para que ganar por dos sea siquiera posible.
 *
 * Es exactamente la señal que se pierde si uno arma la run line copiando los
 * modelos del ganador, y es la razón de que esta familia exista aparte.
 */
const ambiente: Modelo<CandidatoLinea> = {
  id: "ambiente",
  nombre: "Ambiente de carreras",
  peso: 15,
  mirar: (c) => {
    const p = c.partido;
    const carreras =
      p.local.ofensiva && p.visita.ofensiva
        ? p.local.ofensiva.carrerasPorJuego + p.visita.ofensiva.carrerasPorJuego
        : NaN;
    if (!Number.isFinite(carreras)) return null;

    const porOfensivas = posicion(carreras, p.jornada.carrerasSumadas, true);
    if (porOfensivas === null) return null;

    // La línea del mercado es la mejor medida del ambiente que existe, cuando
    // está: resume todo lo que las casas saben del parque, el clima y los
    // abridores en un solo número.
    const porLinea = p.total ? ventaja(p.total.linea, 8.5, 1.2, true) : null;
    const score = porLinea === null
      ? porOfensivas
      : Math.round(porOfensivas * 0.45 + porLinea * 0.55);

    const motivos: string[] = [];
    if (p.total) {
      motivos.push(
        p.total.linea >= 9.5
          ? `La casa pone la línea en ${p.total.linea}: se espera un partido de carreras`
          : p.total.linea <= 7.5
            ? `Línea baja (${p.total.linea}): partido cerrado, ganar por dos es difícil`
            : `Línea de ${p.total.linea}, ambiente normal`
      );
    }
    if (porOfensivas >= 75) motivos.push(`Las dos ofensivas suman ${unaCifra(carreras)} carreras por juego`);
    else if (porOfensivas <= 25) motivos.push(`Dos ofensivas flojas (${unaCifra(carreras)} entre las dos)`);

    return {
      score,
      motivos,
      datos: {
        carrerasSumadas: Number(unaCifra(carreras)),
        linea: p.total?.linea ?? null,
        porOfensivas,
      },
    };
  },
};

// -------------------------------------------------------------------- forma

const forma: Modelo<CandidatoLinea> = {
  id: "forma",
  nombre: "Forma reciente",
  peso: 10,
  mirar: (c) => {
    const mia = yo(c).forma;
    const suya = rival(c).forma;
    if (!mia || !suya || !Number.isFinite(mia.ultimos10)) return null;

    // Acá el diferencial de carreras pesa más que el récord: ganar de a una no
    // sirve para cubrir el −1.5, y el diferencial es lo que distingue al que
    // gana apretado del que golea.
    const porDiferencial = posicion(mia.difPorJuego, c.partido.jornada.difCarreras, true);
    if (porDiferencial === null) return null;
    const porDiez = (mia.ultimos10 / 10) * 100;
    const score = Math.round(porDiferencial * 0.65 + porDiez * 0.35);

    const motivos = [`${mia.ultimos10} de 10, diferencial ${mia.difPorJuego >= 0 ? "+" : ""}${unaCifra(mia.difPorJuego)} por juego`];
    if (mia.difPorJuego >= 0.8) motivos.push("Viene ganando con holgura, no de a una");

    return { score, motivos, datos: { ultimos10: mia.ultimos10, difPorJuego: Number(unaCifra(mia.difPorJuego)) } };
  },
};

// ------------------------------------------------------------------- mercado

/**
 * Lo que paga el mercado por ese equipo ganando por dos o más.
 *
 * Acá **sí** es un modelo, al revés que en los totales, y la diferencia importa:
 * la línea de un total la mueve la casa hasta que los dos lados paguen igual, así
 * que ese precio no informa. El −1.5 es una línea fija, y su precio se mueve
 * libre según lo dominante que sea el favorito. Un −1.5 al 50% y uno al 38% son
 * dos partidos distintos, y el número lo dice.
 */
const mercado: Modelo<CandidatoLinea> = {
  id: "mercado",
  nombre: "Mercado",
  peso: 15,
  mirar: (c) => {
    if (!Number.isFinite(c.precio) || c.precio <= 0) return null;
    // Cubrir el −1.5 es más difícil que ganar, así que el precio vive por debajo
    // del 50% casi siempre. Se estira contra 42%, que es el centro real de este
    // mercado, para que un 50% no parezca apenas favorito cuando es mucho.
    const score = Math.round(Math.max(0, Math.min(100, 50 + (c.precio - 0.42) * 350)));
    return {
      score,
      motivos: [`El mercado paga que gane por 2 o más al ${Math.round(c.precio * 100)}%`],
      datos: { precio: c.precio },
    };
  },
};

export const MODELOS_LINEA: Modelo<CandidatoLinea>[] = [
  abridores,
  ofensiva,
  bullpen,
  ambiente,
  forma,
  mercado,
];

/**
 * El candidato de run line de un partido, si el mercado lo publicó.
 *
 * **Uno solo por partido**, no dos. Polymarket publica el −1.5 del favorito, y
 * el otro lado no es "el rival gana por 2 o más" sino "+1.5", que es otra
 * apuesta con otra lógica: se gana perdiendo por poco. Meterla acá sería juzgar
 * dos cosas distintas con la misma vara.
 */
export const candidatoLineaDe = (p: Partido): CandidatoLinea[] =>
  p.paliza
    ? [{ partido: p, lado: p.paliza.lado, equipo: p.paliza.equipo, precio: p.paliza.p }]
    : [];

export const nombreLineaDe = (c: CandidatoLinea) => `${c.equipo} por 2+`;
