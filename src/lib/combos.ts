// Los combos del día: ocho parlays de MLB, cada uno con su regla escrita.
//
// De dónde sale cada cosa:
//   precios  → Polymarket (gratis, sin clave)
//   abridores y su FIP → MLB StatsAPI (gratis, oficial)
//
// **Cada combo dice en la tarjeta con qué regla se armó.** Eso no es un adorno:
// es lo único que separa esto de ocho parlays al azar. Y es lo que la estadística
// de aciertos va a juzgar con el tiempo.
//
// A propósito hay de los dos tipos:
//
//   - Cuatro **por mercado**: los que solo ordenan por precio. Son el patrón de
//     comparación, lo que cualquiera podría armar.
//   - Cuatro **por abridores**: los que usan el FIP de quien lanza, que es un
//     dato que el precio ya vio pero que a veces pondera distinto.
//
// En treinta días la estadística va a decir si los segundos le ganan a los
// primeros. Si no le ganan, se jubilan y se dice.
//
// Lo que NO hacemos: inventar probabilidades. La probabilidad de cada pata es la
// que paga Polymarket, tal cual. Nosotros solo elegimos cuáles van juntas.

const GAMMA = "https://gamma-api.polymarket.com";
const MLB = "https://statsapi.mlb.com/api/v1";

// Con menos entradas que esto, el FIP de un lanzador es ruido: dos aperturas
// buenas lo dejan en 3.00 y no significa nada. Se lo deja afuera antes que
// mostrar un número que parece sólido.
const ENTRADAS_MINIMAS = 40;

// La constante de liga del FIP. Sirve para comparar lanzadores entre sí, que es
// lo único que hacemos con ella.
const CONSTANTE_FIP = 3.15;

// Cómo se separan los partidos de buen pitcheo de los de mal pitcheo.
//
// Se probó con un umbral fijo —los dos abridores por debajo de 3.90— y no
// sirve: en una jornada normal **ningún** partido lo cumple, y los cuatro
// combos de pitcheo se caían todos. Un duelo con los dos lanzadores de élite es
// raro, no pasa todos los días.
//
// Se probó también con puro ranking y era peor: el cuarto lugar de "peor
// pitcheo" terminaba siendo un partido que no era malo sino el menos bueno de
// los que quedaban, y el mismo partido salía como "menos de 8.5" en un combo y
// "más de 8.5" en otro. Contradecirse en la misma pantalla es lo peor que
// podíamos hacer.
//
// Lo que queda: partir la jornada por la mitad. Los combos de buen pitcheo
// salen de la mitad buena y los de mal pitcheo de la mitad mala. Nunca se
// pisan, siempre hay material, y la regla se puede decir en una frase.
function partirJornada(partidos: PartidoDelDia[]) {
  const peorDeLosDos = (p: PartidoDelDia) =>
    Math.max(p.abridorVisita?.fip ?? 0, p.abridorLocal?.fip ?? 0);
  const mejorDeLosDos = (p: PartidoDelDia) =>
    Math.min(p.abridorVisita?.fip ?? 99, p.abridorLocal?.fip ?? 99);

  const ordenados = [...partidos].sort((a, b) => peorDeLosDos(a) - peorDeLosDos(b));
  const mitad = Math.ceil(ordenados.length / 2);
  return {
    peorDeLosDos,
    mejorDeLosDos,
    buenPitcheo: ordenados.slice(0, mitad),
    malPitcheo: ordenados.slice(mitad),
  };
}

export type Pata = {
  partido: string; // "Seattle Mariners vs. Texas Rangers"
  hora: string;
  pick: string; // "Menos de 7.5 carreras"
  probabilidad: number; // la que paga Polymarket
  // Por qué está en este combo. En los de mercado va vacío.
  motivo: string | null;
};

export type Combo = {
  id: string;
  nombre: string;
  regla: string;
  tipo: "mercado" | "abridores";
  patas: Pata[];
  multiplicador: number;
  probabilidad: number; // producto de las patas
};

// ------------------------------------------------------------------ auxiliares

type Crudo = Record<string, unknown>;
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {});
const txt = (v: unknown): string => (typeof v === "string" ? v : "");

async function pedir(url: string, intentos = 3): Promise<unknown> {
  for (let i = 1; i <= intentos; i++) {
    try {
      // Sin cache: los precios se mueven y una copia vencida es un dato falso
      // (ver `lib/tablero.ts`).
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {}
    if (i < intentos) await new Promise((s) => setTimeout(s, 400 * i));
  }
  return null;
}

// FIP: jonrones, boletos y ponches, que es lo que un lanzador controla de
// verdad. Se usa en vez de la efectividad porque la efectividad depende mucho
// de la defensa que tenga atrás.
function calcularFip(s: Crudo): number | null {
  const entradas = parseFloat(txt(s.inningsPitched));
  if (!entradas || entradas < ENTRADAS_MINIMAS) return null;
  const hr = Number(s.homeRuns) || 0;
  const bb = Number(s.baseOnBalls) || 0;
  const golpeados = Number(s.hitByPitch) || 0;
  const k = Number(s.strikeOuts) || 0;
  return (13 * hr + 3 * (bb + golpeados) - 2 * k) / entradas + CONSTANTE_FIP;
}

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const apodo = (nombre: string) => normalizar(nombre).split(" ").pop() ?? "";

// --------------------------------------------------------- los datos de un día

type Abridor = { nombre: string; fip: number | null };

type PartidoDelDia = {
  titulo: string;
  visita: string;
  local: string;
  hora: string;
  // Mercados, con la probabilidad que paga Polymarket
  ganaLocal: number | null;
  ganaVisita: number | null;
  under: { linea: number; p: number } | null;
  over: { linea: number; p: number } | null;
  paliza: { equipo: string; p: number } | null; // -1.5
  carreraPrimera: number | null;
  sinCarreraPrimera: number | null;
  abridorVisita: Abridor | null;
  abridorLocal: Abridor | null;
  fipPromedio: number | null;
};

async function abridoresDelDia(fecha: string): Promise<Map<string, [Abridor, Abridor]>> {
  const mapa = new Map<string, [Abridor, Abridor]>();
  const j = obj(
    await pedir(`${MLB}/schedule?sportId=1&date=${fecha}&hydrate=probablePitcher,team`)
  );
  const juegos = lista(obj(lista(j.dates)[0]).games);

  await Promise.all(
    juegos.map(async (g) => {
      const equipos = obj(g.teams);
      const lados = ["away", "home"] as const;
      const salida: Abridor[] = [];
      for (const lado of lados) {
        const p = obj(obj(equipos[lado]).probablePitcher);
        const id = p.id;
        if (!id) {
          salida.push({ nombre: "", fip: null });
          continue;
        }
        const info = obj(
          await pedir(`${MLB}/people/${id}?hydrate=stats(group=[pitching],type=[season])`)
        );
        const stat = obj(
          obj(lista(obj(lista(info.people)[0]).stats)[0]).splits
            ? obj(lista(obj(lista(obj(lista(info.people)[0]).stats)[0]).splits)[0]).stat
            : {}
        );
        salida.push({ nombre: txt(p.fullName), fip: calcularFip(stat) });
      }
      const visita = txt(obj(obj(equipos.away).team).name);
      const local = txt(obj(obj(equipos.home).team).name);
      if (visita && local) mapa.set(`${apodo(visita)}|${apodo(local)}`, [salida[0], salida[1]]);
    })
  );

  return mapa;
}

async function mercadosDelDia(fecha: string): Promise<Crudo[]> {
  const acum: Crudo[] = [];
  for (let salto = 0; salto < 400; salto += 100) {
    const j = await pedir(
      `${GAMMA}/events?tag_slug=mlb&closed=false&limit=100&offset=${salto}`
    );
    const lote = lista(j);
    acum.push(...lote);
    if (lote.length < 100) break;
  }
  return acum.filter((e) => txt(e.eventDate) === fecha && e.ended !== true);
}

// Saca de un evento de Polymarket todos los mercados que sabemos leer.
function leerMercados(ev: Crudo): Omit<PartidoDelDia, "abridorVisita" | "abridorLocal" | "fipPromedio"> | null {
  const equipos = lista(ev.teams);
  if (equipos.length !== 2) return null;
  const visita = txt(obj(equipos[0]).name);
  const local = txt(obj(equipos[1]).name);
  if (!visita || !local) return null;

  const salida = {
    titulo: txt(ev.title),
    visita,
    local,
    hora: txt(ev.startTime),
    ganaLocal: null as number | null,
    ganaVisita: null as number | null,
    under: null as { linea: number; p: number } | null,
    over: null as { linea: number; p: number } | null,
    paliza: null as { equipo: string; p: number } | null,
    carreraPrimera: null as number | null,
    sinCarreraPrimera: null as number | null,
  };

  const totales: { linea: number; pU: number; pO: number }[] = [];

  for (const m of lista(ev.markets)) {
    const pregunta = txt(m.question);
    let nombres: string[];
    let precios: number[];
    try {
      nombres = JSON.parse(txt(m.outcomes) || "[]");
      precios = JSON.parse(txt(m.outcomePrices) || "[]").map(Number);
    } catch {
      continue;
    }
    if (nombres.length !== 2 || !precios[0]) continue;

    // Las primeras cinco entradas son otro mercado: no entran.
    if (/1st 5 Innings/i.test(pregunta)) continue;

    // Ganador
    if (nombres.some((n) => n.includes(local)) && nombres.some((n) => n.includes(visita))
        && !/Spread|O\/U/i.test(pregunta)) {
      const iL = nombres.findIndex((n) => n.includes(local));
      salida.ganaLocal = precios[iL];
      salida.ganaVisita = precios[1 - iL];
      continue;
    }

    // Total
    const total = pregunta.match(/O\/U ([\d.]+)/);
    if (total) {
      const iU = nombres.findIndex((n) => /under/i.test(n));
      if (iU >= 0) totales.push({ linea: Number(total[1]), pU: precios[iU], pO: precios[1 - iU] });
      continue;
    }

    // Línea de carreras a −1.5
    const spread = pregunta.match(/^Spread: (.+) \(-1\.5\)$/);
    if (spread) {
      const equipo = spread[1];
      const i = nombres.findIndex((n) => n.includes(equipo));
      if (i >= 0 && (!salida.paliza || precios[i] > salida.paliza.p)) {
        salida.paliza = { equipo, p: precios[i] };
      }
      continue;
    }

    // Carrera en la primera entrada
    if (/run scored in the first inning/i.test(pregunta)) {
      const iSi = nombres.findIndex((n) => /^yes$/i.test(n));
      if (iSi >= 0) {
        salida.carreraPrimera = precios[iSi];
        salida.sinCarreraPrimera = precios[1 - iSi];
      }
    }
  }

  // De las líneas alternativas, la principal: la que el mercado tiene más
  // pareja. Es la que la casa considera "la" línea del partido.
  if (totales.length) {
    totales.sort((a, b) => Math.abs(a.pU - 0.5) - Math.abs(b.pU - 0.5));
    salida.under = { linea: totales[0].linea, p: totales[0].pU };
    salida.over = { linea: totales[0].linea, p: totales[0].pO };
  }

  return salida;
}

export async function traerPartidosDelDia(fecha: string): Promise<PartidoDelDia[]> {
  const [eventos, abridores] = await Promise.all([mercadosDelDia(fecha), abridoresDelDia(fecha)]);

  const partidos: PartidoDelDia[] = [];
  for (const ev of eventos) {
    const base = leerMercados(ev);
    if (!base) continue;
    const par = abridores.get(`${apodo(base.visita)}|${apodo(base.local)}`);
    const av = par?.[0] ?? null;
    const al = par?.[1] ?? null;
    const fips = [av?.fip, al?.fip].filter((x): x is number => typeof x === "number");
    partidos.push({
      ...base,
      abridorVisita: av,
      abridorLocal: al,
      // Solo hay promedio si se conoce el FIP de los dos. Con uno solo no se
      // puede llamar "duelo de pitcheo" a nada.
      fipPromedio: fips.length === 2 ? (fips[0] + fips[1]) / 2 : null,
    });
  }
  return partidos;
}

// ------------------------------------------------------------------ las reglas

// En 24 horas y no en "07:10 p. m.": va pegada al nombre del partido, que ya es
// largo, y en una pantalla de 320 el "p. m." hacía que la hora se recortara
// entera. "19:10" ocupa la mitad y se entiende igual.
const hora = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Caracas",
      }).format(new Date(iso))
    : "";

const unaCifra = (n: number) => n.toFixed(2);

function armar(
  id: string,
  nombre: string,
  regla: string,
  tipo: Combo["tipo"],
  patas: Pata[],
  cuantas: number
): Combo | null {
  // Nunca dos patas del mismo partido: se multiplicarían probabilidades que no
  // son independientes y el número final sería mentira.
  const vistos = new Set<string>();
  const limpias: Pata[] = [];
  for (const p of patas) {
    if (vistos.has(p.partido)) continue;
    vistos.add(p.partido);
    limpias.push(p);
    if (limpias.length === cuantas) break;
  }
  if (limpias.length < cuantas) return null; // sin material suficiente, no se publica

  const probabilidad = limpias.reduce((a, p) => a * p.probabilidad, 1);
  return {
    id,
    nombre,
    regla,
    tipo,
    patas: limpias,
    multiplicador: limpias.reduce((a, p) => a / p.probabilidad, 1),
    probabilidad,
  };
}

export function armarCombos(partidos: PartidoDelDia[]): Combo[] {
  const combos: (Combo | null)[] = [];
  const conFip = partidos.filter((p) => p.fipPromedio !== null);

  const pata = (p: PartidoDelDia, pick: string, prob: number, motivo: string | null): Pata => ({
    partido: p.titulo,
    hora: hora(p.hora),
    pick,
    probabilidad: prob,
    motivo,
  });

  const duelo = (p: PartidoDelDia) =>
    `${p.abridorVisita?.nombre} ${unaCifra(p.abridorVisita?.fip ?? 0)} vs ` +
    `${p.abridorLocal?.nombre} ${unaCifra(p.abridorLocal?.fip ?? 0)}`;

  // Cuando lo que justifica la pata es que alguien viene mal, ese va primero.
  const elFlojo = (p: PartidoDelDia) => {
    const v = p.abridorVisita;
    const l = p.abridorLocal;
    const peor = (v?.fip ?? 0) >= (l?.fip ?? 0) ? v : l;
    const otro = peor === v ? l : v;
    return `${peor?.nombre} ${unaCifra(peor?.fip ?? 0)} · enfrente ${otro?.nombre} ${unaCifra(otro?.fip ?? 0)}`;
  };

  // ---- Por mercado: lo que cualquiera armaría ordenando por precio ----

  const favoritos = partidos
    .flatMap((p) =>
      [
        p.ganaLocal !== null ? { p, equipo: p.local, prob: p.ganaLocal } : null,
        p.ganaVisita !== null ? { p, equipo: p.visita, prob: p.ganaVisita } : null,
      ].filter((x): x is { p: PartidoDelDia; equipo: string; prob: number } => x !== null)
    )
    .sort((a, b) => b.prob - a.prob);

  combos.push(
    armar(
      "favoritos",
      "Favoritos",
      "Los cuatro equipos con más probabilidad de ganar según el mercado.",
      "mercado",
      favoritos.map((f) => pata(f.p, `Gana ${f.equipo}`, f.prob, null)),
      4
    )
  );

  combos.push(
    armar(
      "bombazo",
      "El bombazo",
      "Los seis favoritos más marcados del día. Para divertirse, no para ganar.",
      "mercado",
      favoritos.map((f) => pata(f.p, `Gana ${f.equipo}`, f.prob, null)),
      6
    )
  );

  combos.push(
    armar(
      "paliza",
      "Paliza",
      "Los cuatro equipos con más chance de ganar por dos carreras o más.",
      "mercado",
      partidos
        .filter((p) => p.paliza)
        .sort((a, b) => b.paliza!.p - a.paliza!.p)
        .map((p) => pata(p, `${p.paliza!.equipo} gana por 2 o más`, p.paliza!.p, null)),
      4
    )
  );

  combos.push(
    armar(
      "arranque",
      "Arranque caliente",
      "Los cuatro partidos donde el mercado ve más probable que se anote en la primera entrada.",
      "mercado",
      partidos
        .filter((p) => p.carreraPrimera !== null)
        .sort((a, b) => b.carreraPrimera! - a.carreraPrimera!)
        .map((p) => pata(p, "Se anota en la 1ª entrada", p.carreraPrimera!, null)),
      4
    )
  );

  // ---- Por abridores: acá el FIP manda y el precio va atrás ----

  // Ojo con ordenar por el promedio de los dos abridores: esconde justo lo que
  // importa. Un FIP de 2.62 contra uno de 5.36 promedia 3.99 y se colaba en
  // "peor pitcheo" teniendo al mejor lanzador del día. Para que sea un duelo
  // tienen que ser buenos **los dos**, así que manda el peor de los dos.
  const { peorDeLosDos, mejorDeLosDos, buenPitcheo, malPitcheo } = partirJornada(conFip);

  combos.push(
    armar(
      "duelo",
      "Duelo de pitcheo",
      "De la mitad de la jornada con mejor pitcheo, los cuatro donde abren dos buenos.",
      "abridores",
      buenPitcheo
        .filter((p) => p.under)
        .sort((a, b) => peorDeLosDos(a) - peorDeLosDos(b))
        .map((p) => pata(p, `Menos de ${p.under!.linea} carreras`, p.under!.p, duelo(p))),
      4
    )
  );

  // La regla dice "el peor abridor", no "los dos peores", y es a propósito: en
  // una jornada normal no hay cuatro partidos donde los dos vengan mal. Con la
  // otra redacción, el combo terminaba mostrando a Max Fried —FIP 2.62, de los
  // mejores del día— bajo un título que decía que ninguno venía bien.
  //
  // Se ordena por el peor de los dos, que es el que justifica la elección, y el
  // texto de cada pata lo pone primero.
  combos.push(
    armar(
      "lluvia",
      "Lluvia de carreras",
      "Los cuatro partidos donde abre el peor lanzador de la jornada.",
      "abridores",
      malPitcheo
        .filter((p) => p.over)
        .sort((a, b) => peorDeLosDos(b) - peorDeLosDos(a))
        .map((p) => pata(p, `Más de ${p.over!.linea} carreras`, p.over!.p, elFlojo(p))),
      4
    )
  );

  combos.push(
    armar(
      "temprano",
      "Nadie anota temprano",
      "Sin carreras en la primera entrada, en los cuatro partidos con mejores abridores.",
      "abridores",
      buenPitcheo
        .filter((p) => p.sinCarreraPrimera !== null)
        .sort((a, b) => peorDeLosDos(a) - peorDeLosDos(b))
        .map((p) => pata(p, "Sin carreras en la 1ª entrada", p.sinCarreraPrimera!, duelo(p))),
      4
    )
  );

  // Los que el mercado no ve favoritos pero llevan al mejor abridor del duelo.
  const perros = conFip
    .map((p) => {
      const visitaEsFavorita = (p.ganaVisita ?? 0) > (p.ganaLocal ?? 0);
      const noFavorito = visitaEsFavorita
        ? { equipo: p.local, prob: p.ganaLocal, fip: p.abridorLocal?.fip, rival: p.abridorVisita?.fip }
        : { equipo: p.visita, prob: p.ganaVisita, fip: p.abridorVisita?.fip, rival: p.abridorLocal?.fip };
      return { p, ...noFavorito };
    })
    // Que el no favorito tenga mejor abridor que el favorito: ahí está la gracia.
    .filter((x) => x.prob !== null && typeof x.fip === "number" && typeof x.rival === "number" && x.fip < x.rival)
    .sort((a, b) => (a.fip as number) - (b.fip as number));

  combos.push(
    armar(
      "perros",
      "Perros con dientes",
      "Equipos que el mercado no ve favoritos, pero que ponen al mejor abridor del duelo.",
      "abridores",
      perros.map((x) =>
        pata(
          x.p,
          `Gana ${x.equipo}`,
          x.prob as number,
          `${x.equipo === x.p.local ? x.p.abridorLocal?.nombre : x.p.abridorVisita?.nombre} ` +
            `${unaCifra(x.fip as number)} contra ${unaCifra(x.rival as number)}`
        )
      ),
      4
    )
  );

  return combos.filter((c): c is Combo => c !== null);
}
