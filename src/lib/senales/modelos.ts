import { posicion, ventaja } from "./normalizar.ts";
import type { Modelo, Senal } from "./tipos.ts";
import type { Partido } from "./datos.ts";

// Los modelos. Cada uno mira **una sola cosa** y no sabe nada de los demás.
//
// Que sean independientes no es un detalle de organización: es lo único que hace
// que "siete de ocho coinciden" signifique algo. Si un modelo usara por dentro lo
// que ya midió otro, coincidirían por construcción y el acuerdo sería un truco.
//
// Por eso, por ejemplo, el modelo de mercado NO se usa para inclinar a los
// demás: entra como un voto más, y si contradice al resto lo dice.
//
// Todos devuelven `null` cuando les faltan datos. Nunca 50.

/** A quién estamos juzgando: un equipo de un partido, no el partido. */
export type Candidato = {
  partido: Partido;
  lado: "local" | "visita";
};

const yo = (c: Candidato) => (c.lado === "local" ? c.partido.local : c.partido.visita);
const rival = (c: Candidato) => (c.lado === "local" ? c.partido.visita : c.partido.local);
const miAbridor = (c: Candidato) =>
  c.lado === "local" ? c.partido.abridorLocal : c.partido.abridorVisita;
const suAbridor = (c: Candidato) =>
  c.lado === "local" ? c.partido.abridorVisita : c.partido.abridorLocal;

const unaCifra = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------- abridores

/**
 * Quién abre, que es lo que más pesa en un partido de béisbol.
 *
 * Mira dos cosas y las promedia: **dónde cae el abridor en la jornada** (contra
 * los otros veintitantos que lanzan hoy) y **cuánta ventaja le saca al de
 * enfrente**. Las dos hacen falta: un abridor bueno contra otro mejor no es una
 * ventaja, y una ventaja grande entre dos malos tampoco es una recomendación.
 *
 * Se usa FIP y no efectividad porque la efectividad depende mucho de la defensa
 * que tenga atrás, y acá se quiere medir al lanzador.
 */
const abridores: Modelo<Candidato> = {
  id: "abridores",
  nombre: "Abridores",
  peso: 30,
  mirar: (c) => {
    const mio = miAbridor(c);
    const suyo = suAbridor(c);
    if (!mio?.fip || !suyo?.fip) return null;

    const enLaJornada = posicion(mio.fip, c.partido.jornada.fipsAbridores, false);
    if (enLaJornada === null) return null;

    // Media carrera de FIP es una diferencia que se nota; a una carrera entera
    // la ventaja ya es clara.
    const contraElOtro = ventaja(mio.fip, suyo.fip, 0.8, false);
    const score = Math.round(enLaJornada * 0.5 + contraElOtro * 0.5);

    const motivos: string[] = [];
    const dif = suyo.fip - mio.fip;
    if (dif >= 0.8) motivos.push(`${mio.nombre} le saca ${unaCifra(dif)} de FIP a ${suyo.nombre}`);
    else if (dif >= 0.3) motivos.push(`Ventaja del abridor, pero no enorme (${unaCifra(dif)} de FIP)`);
    else if (dif <= -0.3) motivos.push(`Abre peor: ${unaCifra(-dif)} de FIP por detrás`);
    else motivos.push("Abridores parejos");
    if (enLaJornada >= 85) motivos.push(`${mio.nombre} es de lo mejor que lanza hoy`);
    if (mio.kbb && mio.kbb >= 4) motivos.push(`Poncha ${unaCifra(mio.kbb)} por cada boleto`);

    return {
      score,
      motivos,
      datos: {
        abridor: mio.nombre,
        fip: Number(unaCifra(mio.fip)),
        fipRival: Number(unaCifra(suyo.fip)),
        entradas: mio.entradas,
        posicionEnLaJornada: enLaJornada,
      },
    };
  },
};

// ------------------------------------------------------------------ bullpen

/**
 * El bullpen, que es lo que decide los partidos después de la sexta.
 *
 * Es el modelo que más veces contradice a los demás, y por eso vale la pena
 * tenerlo aparte: un abridor excelente con un bullpen fundido es exactamente el
 * partido que no hay que recomendar.
 */
const bullpen: Modelo<Candidato> = {
  id: "bullpen",
  nombre: "Bullpen",
  peso: 20,
  mirar: (c) => {
    const mio = yo(c).bullpen;
    const suyo = rival(c).bullpen;
    if (!mio || !suyo) return null;

    const enLaLiga = posicion(mio.era, c.partido.jornada.erasBullpen, false);
    if (enLaLiga === null) return null;

    const contraElOtro = ventaja(mio.era, suyo.era, 0.7, false);
    const score = Math.round(enLaLiga * 0.55 + contraElOtro * 0.45);

    const motivos: string[] = [];
    if (enLaLiga >= 80) motivos.push(`Bullpen entre los mejores de la liga (${unaCifra(mio.era)} de efectividad)`);
    else if (enLaLiga <= 30) motivos.push(`Bullpen flojo: ${unaCifra(mio.era)} de efectividad`);
    const dif = suyo.era - mio.era;
    if (Math.abs(dif) >= 0.6) {
      motivos.push(
        dif > 0
          ? `Diferencia importante de bullpen a favor (${unaCifra(dif)})`
          : `El rival tiene mejor bullpen (${unaCifra(-dif)})`
      );
    }
    if (motivos.length === 0) motivos.push("Bullpens parejos");

    return {
      score,
      motivos,
      datos: {
        era: Number(unaCifra(mio.era)),
        eraRival: Number(unaCifra(suyo.era)),
        relevistas: mio.lanzadores,
        posicionEnLaLiga: enLaLiga,
      },
    };
  },
};

// ----------------------------------------------------------------- ofensiva

const ofensiva: Modelo<Candidato> = {
  id: "ofensiva",
  nombre: "Ofensiva",
  peso: 20,
  mirar: (c) => {
    const mia = yo(c).ofensiva;
    const suya = rival(c).ofensiva;
    if (!mia || !suya) return null;

    const porCarreras = posicion(mia.carrerasPorJuego, c.partido.jornada.carrerasOfensivas, true);
    const porOps = posicion(mia.ops, c.partido.jornada.opsOfensivas, true);
    if (porCarreras === null || porOps === null) return null;

    // Las dos miden lo mismo por caminos distintos: una cuenta lo que produjo y
    // la otra la calidad del contacto. Si se separan mucho, algo raro pasa.
    const enLaLiga = Math.round((porCarreras + porOps) / 2);
    const contraElOtro = ventaja(mia.carrerasPorJuego, suya.carrerasPorJuego, 0.8, true);
    const score = Math.round(enLaLiga * 0.6 + contraElOtro * 0.4);

    const motivos: string[] = [];
    if (enLaLiga >= 80) motivos.push(`Ofensiva de las mejores: ${unaCifra(mia.carrerasPorJuego)} carreras por juego`);
    else if (enLaLiga <= 30) motivos.push(`Ofensiva floja: ${unaCifra(mia.carrerasPorJuego)} carreras por juego`);
    const dif = mia.carrerasPorJuego - suya.carrerasPorJuego;
    if (dif >= 0.7) motivos.push(`Produce ${unaCifra(dif)} carreras más por juego que el rival`);
    if (motivos.length === 0) motivos.push("Ofensivas parejas");

    return {
      score,
      motivos,
      datos: {
        carrerasPorJuego: Number(unaCifra(mia.carrerasPorJuego)),
        ops: mia.ops,
        posicionPorCarreras: porCarreras,
        posicionPorOps: porOps,
      },
    };
  },
};

// -------------------------------------------------------------------- forma

/**
 * Cómo llega, no cómo fue la temporada.
 *
 * Rachas cortas a propósito: los últimos diez y el diferencial de carreras. Una
 * racha de veinte juegos ya no habla del momento actual, habla del equipo.
 */
const forma: Modelo<Candidato> = {
  id: "forma",
  nombre: "Forma reciente",
  peso: 10,
  mirar: (c) => {
    const mia = yo(c).forma;
    const suya = rival(c).forma;
    if (!mia || !suya || !Number.isFinite(mia.ultimos10)) return null;

    const porDiez = (mia.ultimos10 / 10) * 100;
    const porDiferencial = posicion(mia.difPorJuego, c.partido.jornada.difCarreras, true);
    if (porDiferencial === null) return null;

    const score = Math.round(porDiez * 0.5 + porDiferencial * 0.5);

    const motivos: string[] = [];
    motivos.push(`${mia.ultimos10} de 10 en los últimos diez`);
    if (mia.difPorJuego >= 0.5) motivos.push(`Diferencial de carreras favorable (+${unaCifra(mia.difPorJuego)} por juego)`);
    else if (mia.difPorJuego <= -0.5) motivos.push(`Diferencial en contra (${unaCifra(mia.difPorJuego)} por juego)`);
    if (mia.racha) motivos.push(`Racha: ${mia.racha}`);

    return {
      score,
      motivos,
      datos: {
        ultimos10: mia.ultimos10,
        ultimos10Rival: suya.ultimos10,
        difPorJuego: Number(unaCifra(mia.difPorJuego)),
        racha: mia.racha,
      },
    };
  },
};

// ------------------------------------------------------------------ mercado

/**
 * Qué opina el mercado. **Entra como un voto más, no como el árbitro.**
 *
 * Esta es una decisión de fondo. Lo fácil sería inclinar todo hacia el precio de
 * Polymarket y quedar siempre cerca de lo que pasa; pero entonces esto sería un
 * ranking de favoritos con adornos, que es exactamente lo que no queremos.
 *
 * Su peso es bajo a propósito, y su valor real está en lo contrario de lo que
 * parece: cuando el mercado contradice a los otros modelos, el motor lo detecta
 * y saca el partido. Un desacuerdo grande con el mercado no es una oportunidad,
 * es una señal de que nos falta un dato que ellos sí tienen.
 */
const mercado: Modelo<Candidato> = {
  id: "mercado",
  nombre: "Mercado",
  peso: 5,
  mirar: (c) => {
    const m = c.partido.mercado;
    if (!m) return null;
    const mio = c.lado === "local" ? m.local : m.visita;
    if (!Number.isFinite(mio) || mio <= 0) return null;

    // El precio ya es una probabilidad de 0 a 1: se lleva a 0-100 tal cual, sin
    // retocarlo. Es el único modelo cuyo número no lo calculamos nosotros.
    const score = Math.round(mio * 100);
    const motivos = [
      mio >= 0.6
        ? `El mercado lo ve favorito claro (${Math.round(mio * 100)}%)`
        : mio >= 0.5
          ? `El mercado lo ve levemente favorito (${Math.round(mio * 100)}%)`
          : `El mercado no lo ve favorito (${Math.round(mio * 100)}%)`,
    ];
    return { score, motivos, datos: { precio: mio } };
  },
};

// ----------------------------------------------------------------- desgaste

/**
 * Cuánto trabajó el bullpen en los últimos tres días.
 *
 * Es distinto del modelo de bullpen y por eso va aparte: uno mide **qué tan
 * bueno es**, este mide **cómo llega**. Un bullpen de élite que tiró once
 * entradas en tres días hoy no es un bullpen de élite, y son dos preguntas
 * independientes — que es justo lo que hace que valga la pena contarlos como dos
 * votos y no como uno.
 */
const desgaste: Modelo<Candidato> = {
  id: "desgaste",
  nombre: "Descanso",
  peso: 8,
  mirar: (c) => {
    const mio = yo(c).desgaste;
    const suyo = rival(c).desgaste;
    if (!mio || !suyo) return null;

    // Referencia: un bullpen tira unas 3 o 4 entradas por partido, así que nueve
    // en tres días es normal y catorce es mucho.
    const score = ventaja(mio.entradas3dias, suyo.entradas3dias, 4, false);

    const motivos: string[] = [];
    if (mio.entradas3dias >= 13) motivos.push(`Bullpen exigido: ${mio.entradas3dias.toFixed(1)} entradas en tres días`);
    else if (mio.entradas3dias <= 6) motivos.push(`Bullpen descansado (${mio.entradas3dias.toFixed(1)} entradas en tres días)`);
    if (mio.relevistasAyer >= 5) motivos.push(`Ayer usaron ${mio.relevistasAyer} relevistas`);
    const dif = suyo.entradas3dias - mio.entradas3dias;
    if (dif >= 4) motivos.push(`Llega más entero que el rival (${dif.toFixed(1)} entradas menos)`);
    else if (dif <= -4) motivos.push(`El rival llega más descansado (${(-dif).toFixed(1)} entradas menos)`);
    if (motivos.length === 0) motivos.push("Los dos bullpens llegan parecido");

    return {
      score,
      motivos,
      datos: {
        entradas3dias: Number(mio.entradas3dias.toFixed(1)),
        entradas3diasRival: Number(suyo.entradas3dias.toFixed(1)),
        lanzamientos3dias: mio.lanzamientos3dias,
        relevistasAyer: mio.relevistasAyer,
      },
    };
  },
};

// ------------------------------------------------------------------- splits

/**
 * Cómo le pega este equipo a la mano del que abre enfrente.
 *
 * Un equipo con OPS .790 contra zurdos y .690 contra derechos no es el mismo
 * equipo según quién le lance. Es de los pocos modelos que puede contradecir a la
 * ofensiva general, y por eso está separado de ella.
 */
const splits: Modelo<Candidato> = {
  id: "splits",
  nombre: "Contra esa mano",
  peso: 7,
  mirar: (c) => {
    const mios = yo(c).splits;
    const suyos = rival(c).splits;
    const abreEnfrente = suAbridor(c);
    const abroYo = miAbridor(c);
    if (!mios || !suyos || !abreEnfrente?.mano || !abroYo?.mano) return null;

    const mio = abreEnfrente.mano === "L" ? mios.vsZurdo : mios.vsDerecho;
    const suyo = abroYo.mano === "L" ? suyos.vsZurdo : suyos.vsDerecho;
    if (mio === null || suyo === null) return null;

    // 60 puntos de OPS es una diferencia que se nota en una temporada.
    const score = ventaja(mio, suyo, 0.06, true);
    const mano = abreEnfrente.mano === "L" ? "zurdos" : "derechos";
    const manoRival = abroYo.mano === "L" ? "zurdos" : "derechos";

    const motivos = [`OPS ${mio.toFixed(3)} contra ${mano}, que es lo que abre enfrente`];
    const dif = mio - suyo;
    if (Math.abs(dif) >= 0.05) {
      motivos.push(
        dif > 0
          ? `Le pega mejor a esa mano que el rival a los ${manoRival} (${dif.toFixed(3)} de OPS)`
          : `El rival le pega mejor a los ${manoRival} (${(-dif).toFixed(3)} de OPS)`
      );
    }

    return {
      score,
      motivos,
      datos: { ops: mio, opsRival: suyo, manoDelRival: abreEnfrente.mano },
    };
  },
};

// --------------------------------------------------------------------- bajas

/**
 * A quién le falta gente.
 *
 * Es el modelo más crudo de todos y hay que decirlo: cuenta **cuántos** están
 * lesionados, no **quiénes**. Perder al mejor bateador no pesa lo mismo que
 * perder al último del bullpen, y esto no distingue. Está igual porque una
 * diferencia grande de bajas sí dice algo, pero su peso es bajo a propósito y
 * mejorarlo pide datos de valor por jugador que hoy no tenemos.
 */
const bajas: Modelo<Candidato> = {
  id: "bajas",
  nombre: "Bajas",
  peso: 5,
  mirar: (c) => {
    const mias = yo(c).bajas;
    const suyas = rival(c).bajas;
    if (!mias || !suyas) return null;

    const score = ventaja(mias.lesionados, suyas.lesionados, 4, false);
    const motivos: string[] = [];
    motivos.push(`${mias.lesionados} en lista de lesionados (el rival, ${suyas.lesionados})`);
    if (mias.nombres.length) motivos.push(`Entre ellos: ${mias.nombres.slice(0, 3).join(", ")}`);

    return {
      score,
      motivos,
      datos: { lesionados: mias.lesionados, lesionadosRival: suyas.lesionados },
    };
  },
};

// Ocho modelos, cada uno mirando una cosa distinta. El acuerdo entre ellos es
// lo que decide, no el promedio.
export const MODELOS: Modelo<Candidato>[] = [
  abridores,
  bullpen,
  ofensiva,
  forma,
  desgaste,
  splits,
  bajas,
  mercado,
];

/** Los dos candidatos de un partido: gana el local, o gana el visitante. */
export const candidatosDe = (p: Partido): Candidato[] => [
  { partido: p, lado: "local" },
  { partido: p, lado: "visita" },
];

export const nombreDe = (c: Candidato) => yo(c).nombre;

export type { Senal };
