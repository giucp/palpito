// El mercado del día: los precios de Polymarket casados con la cartelera oficial.
//
// De dónde sale cada cosa:
//   precios  → Polymarket (gratis, sin clave)
//   abridores, FIP y el `gamePk` → MLB StatsAPI (gratis, oficial)
//
// Esto era `combos.ts`, la mitad de datos de los combos diarios. **Los combos se
// quitaron el 2026-07-29** —hacían más ruido que ayuda, y el motor de señales
// cubre la misma necesidad mejor y de a un pick, no de a cinco— pero esta parte
// se quedó porque el motor la necesita: es de acá que salen los precios contra
// los que se mide y el `gamePk` con el que después se resuelve.
//
// **Nunca se inventan probabilidades.** La de cada mercado es la que paga
// Polymarket, tal cual. Lo único que se hace acá es leerla bien, que ya costó
// tres bugs: ver `precioUtil`, `esElPartido` y el emparejamiento por hora.

const GAMMA = "https://gamma-api.polymarket.com";
const MLB = "https://statsapi.mlb.com/api/v1";

// Con menos entradas que esto, el FIP de un lanzador es ruido: dos aperturas
// buenas lo dejan en 3.00 y no significa nada. Se lo deja afuera antes que
// mostrar un número que parece sólido.
const ENTRADAS_MINIMAS = 40;

// La constante de liga del FIP. Sirve para comparar lanzadores entre sí, que es
// lo único que hacemos con ella.
const CONSTANTE_FIP = 3.15;

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

/**
 * El apodo con el que se casa un equipo: la última palabra del nombre.
 *
 * **Con una excepción que no es opcional:** los Boston Red Sox y los Chicago
 * White Sox terminan los dos en "Sox". Con la última palabra sola, un Red
 * Sox–White Sox daba la clave `sox|sox` y los dos equipos eran el mismo. Por eso
 * cuando la última palabra es "sox" se usan las dos últimas.
 */
const apodo = (nombre: string) => {
  const partes = normalizar(nombre).split(" ");
  const ultima = partes[partes.length - 1] ?? "";
  return ultima === "sox" && partes.length >= 2
    ? `${partes[partes.length - 2]}${ultima}`
    : ultima;
};

/**
 * ¿Este precio dice algo?
 *
 * Un mercado de Polymarket puede devolver un precio que **parece** una
 * probabilidad y no lo es:
 *
 *  · **0 o 1** es un mercado ya resuelto. Aparece en cuanto el partido termina,
 *    y no es "imposible", es "ya se sabe".
 *  · **0.5 clavado** es un mercado que **nadie operó**. No es una probabilidad
 *    del 50%: es la falta de una probabilidad.
 *
 * Costó un candidato inventado: en un Orioles–Tigers ya jugado, todas las líneas
 * normales estaban resueltas a 0 y la única en 0.5 era un "O/U 14.5" que nadie
 * había tocado. Como la línea principal se elige por cercanía a 0.5, el motor
 * recomendó "menos de 14.5 carreras", que en béisbol no existe.
 */
const precioUtil = (p: number) =>
  Number.isFinite(p) && p > 0.02 && p < 0.98 && Math.abs(p - 0.5) > 1e-9;

/**
 * Un total de MLB vive entre 5.5 y 13.5. Fuera de ahí es otro mercado.
 *
 * Es un cinturón de seguridad, no la defensa principal —esa es `precioUtil`—
 * pero atrapa de golpe los props de jugador (O/U 0.5 y 1.5 jonrones) y las
 * líneas alternativas absurdas, que son las dos formas en que esto se ensució.
 */
const LINEA_TOTAL_PLAUSIBLE = (n: number) => n >= 5.5 && n <= 13.5;

// Con qué se casa un partido de Polymarket con el de la cartelera de la MLB.
// Se exporta porque la resolución de los combos viejos —los que se guardaron
// antes de que se anotara el `gamePk`— la necesita para encontrar el partido.
export const clavePartido = (visita: string, local: string) =>
  `${apodo(visita)}|${apodo(local)}`;

// --------------------------------------------------------- los datos de un día

type Abridor = { nombre: string; fip: number | null };

/** Un partido de la cartelera oficial, con su hora, para poder distinguir los de una doble jornada. */
type JuegoDelDia = { juego: string; empieza: number; abridores: [Abridor, Abridor] };

type PartidoDelDia = {
  titulo: string;
  visita: string;
  local: string;
  hora: string;
  // `gamePk` de MLB StatsAPI, cuando el partido de Polymarket se pudo casar con
  // la cartelera oficial. Es lo que después permite resolver sin adivinar.
  juego: string | null;
  // Mercados, con la probabilidad que paga Polymarket
  ganaLocal: number | null;
  ganaVisita: number | null;
  under: { linea: number; p: number } | null;
  over: { linea: number; p: number } | null;
  paliza: { equipo: string; lado: "local" | "visita"; p: number } | null; // -1.5
  carreraPrimera: number | null;
  sinCarreraPrimera: number | null;
  abridorVisita: Abridor | null;
  abridorLocal: Abridor | null;
  fipPromedio: number | null;
};

// Devuelve, por partido, quiénes abren y el id oficial del juego. El id se
// aprovecha de acá porque esta consulta ya trae la cartelera del día entera: no
// cuesta nada llevárselo y es lo que después resuelve los combos sin adivinar.
async function abridoresDelDia(
  fecha: string
): Promise<Map<string, JuegoDelDia[]>> {
  // **Una lista por clave, no un juego.** En una doble jornada los mismos dos
  // equipos juegan dos veces el mismo día: con un solo valor por clave, el
  // segundo partido pisaba al primero y los dos se quedaban con el mismo
  // `gamePk` —el del que llegara último—, que es la peor forma de fallar,
  // porque después se resuelve contra el marcador del partido equivocado.
  const mapa = new Map<string, JuegoDelDia[]>();
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
      if (visita && local) {
        const clave = `${apodo(visita)}|${apodo(local)}`;
        mapa.set(clave, [
          ...(mapa.get(clave) ?? []),
          {
            juego: String(g.gamePk ?? ""),
            empieza: Date.parse(txt(g.gameDate)) || 0,
            abridores: [salida[0], salida[1]],
          },
        ]);
      }
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
  return acum.filter(
    (e) => txt(e.eventDate) === fecha && e.ended !== true && esElPartido(txt(e.title))
  );
}

/**
 * ¿Este evento es el partido, o uno de los satélites que Polymarket cuelga de él?
 *
 * Del mismo partido salen varios eventos con el mismo par de equipos:
 * `"… - Player Props"`, `"… - First 5 Innings Winner"`. Todos tienen los mismos
 * dos `teams`, así que **casaban con la misma clave y se pisaban entre sí**, y
 * los props traían totales de 0.5 y 1.5 —jonrones de un jugador— que no son
 * totales de carreras de nada.
 *
 * El partido de verdad es el que **no** lleva sufijo tras " - ".
 */
const esElPartido = (titulo: string) => !/ - /.test(titulo);

// Saca de un evento de Polymarket todos los mercados que sabemos leer.
function leerMercados(
  ev: Crudo
): Omit<PartidoDelDia, "abridorVisita" | "abridorLocal" | "fipPromedio" | "juego"> | null {
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
    paliza: null as { equipo: string; lado: "local" | "visita"; p: number } | null,
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
      if (precioUtil(precios[iL])) {
        salida.ganaLocal = precios[iL];
        salida.ganaVisita = precios[1 - iL];
      }
      continue;
    }

    // Total
    const total = pregunta.match(/O\/U ([\d.]+)/);
    if (total) {
      const iU = nombres.findIndex((n) => /under/i.test(n));
      const linea = Number(total[1]);
      if (iU >= 0 && precioUtil(precios[iU]) && LINEA_TOTAL_PLAUSIBLE(linea)) {
        totales.push({ linea, pU: precios[iU], pO: precios[1 - iU] });
      }
      continue;
    }

    // Línea de carreras a −1.5
    const spread = pregunta.match(/^Spread: (.+) \(-1\.5\)$/);
    if (spread) {
      const equipo = spread[1];
      const i = nombres.findIndex((n) => n.includes(equipo));
      if (i >= 0 && precioUtil(precios[i]) && (!salida.paliza || precios[i] > salida.paliza.p)) {
        // Polymarket a veces nombra al equipo corto ("Phillies") y a veces
        // largo. Se guarda de qué lado está, que es lo que no se presta a duda.
        const esLocal = normalizar(local).includes(normalizar(equipo));
        salida.paliza = { equipo, lado: esLocal ? "local" : "visita", p: precios[i] };
      }
      continue;
    }

    // Carrera en la primera entrada
    if (/run scored in the first inning/i.test(pregunta)) {
      const iSi = nombres.findIndex((n) => /^yes$/i.test(n));
      if (iSi >= 0 && precioUtil(precios[iSi])) {
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
  const usados = new Set<string>();
  for (const ev of eventos) {
    const base = leerMercados(ev);
    if (!base) continue;

    // De los juegos de esos dos equipos hoy, el que empiece más cerca de la hora
    // que dice Polymarket, y que no se haya usado ya. Con un solo partido esto
    // da lo mismo de siempre; con una doble jornada es lo que evita que los dos
    // eventos se lleven el mismo `gamePk`.
    const candidatos = (abridores.get(`${apodo(base.visita)}|${apodo(base.local)}`) ?? []).filter(
      (j) => !usados.has(j.juego)
    );
    const empieza = Date.parse(base.hora) || 0;
    const par = candidatos.length
      ? candidatos.reduce((a, b) =>
          Math.abs(a.empieza - empieza) <= Math.abs(b.empieza - empieza) ? a : b
        )
      : undefined;
    if (par) usados.add(par.juego);

    const av = par?.abridores[0] ?? null;
    const al = par?.abridores[1] ?? null;
    const fips = [av?.fip, al?.fip].filter((x): x is number => typeof x === "number");
    partidos.push({
      ...base,
      juego: par?.juego || null,
      abridorVisita: av,
      abridorLocal: al,
      // Solo hay promedio si se conoce el FIP de los dos. Con uno solo no se
      // puede llamar "duelo de pitcheo" a nada.
      fipPromedio: fips.length === 2 ? (fips[0] + fips[1]) / 2 : null,
    });
  }
  return partidos;
}

