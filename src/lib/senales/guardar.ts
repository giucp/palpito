import { crearClienteAdmin } from "../supabase/admin.ts";
import { traerResultados } from "../resultados-mlb.ts";
import { traerPartidosDelDia, clavePartido } from "../mercado-mlb.ts";
import { traerJornada, type TotalMercado } from "./datos.ts";
import { MODELOS, candidatosDe, nombreDe } from "./modelos.ts";
import {
  MODELOS_TOTALES,
  candidatosTotalDe,
  nombreTotalDe,
  OPCIONES_TOTALES,
} from "./modelos-totales.ts";
import { MODELOS_LINEA, candidatoLineaDe, nombreLineaDe } from "./modelos-linea.ts";
import { juzgar, medir, proyectarPar, puertaDeScore } from "./motor.ts";

// Guardar lo que dijo el motor cada día, y comprobarlo después.
//
// Sin esto el motor es una opinión. Con esto, en un mes se puede contestar la
// única pregunta que importa: **¿los que el motor eligió ganaron más que los que
// descartó?**
//
// ## Se guardan TODOS los candidatos, no solo los que entran
//
// Es la decisión de fondo de este archivo. Guardar solo los recomendados
// permitiría decir "acertamos el 62%", y ese número no significa nada suelto: si
// los descartados también ganaron el 62%, el motor no está eligiendo, está
// mirando. Los descartados son el grupo de comparación, y sin ellos no hay forma
// de saber si los umbrales están donde deben.
//
// ## Y se guarda el detalle de cada modelo
//
// Así, dentro de tres meses, se puede preguntar cosas como "¿el modelo de
// descanso aportó algo?" sin volver a calcular nada: la respuesta está en la
// tabla.

/**
 * Las familias que se guardan cada día. **Solo una: quién gana.**
 *
 * Se llegó acá en dos pasos y por el mismo razonamiento del dueño, que es el
 * correcto: **cada familia necesita su propia muestra**. Con tres, los resultados
 * de cada día se reparten en tres y ninguna llega nunca a decir algo. Y afinar
 * tres cosas a la vez sin haber afinado ninguna es trabajo perdido.
 *
 * **Totales, fuera el 2026-07-28.** Eran los más frágiles: dependen de la línea
 * de Polymarket, que es la parte que más problemas dio (totales de primeras cinco
 * entradas colándose como del juego completo, líneas alternativas absurdas,
 * mercados sin operar con precio de 0.5 clavado). Y no tienen modelo de mercado,
 * porque la casa mueve la línea para que los dos lados paguen igual: ese precio
 * no informa nada.
 *
 * **Run line, fuera el 2026-07-30.** Acá hubo dato, no solo criterio: medida
 * sobre tres días, es **la única familia con diferencia negativa** —los elegidos
 * acertaron 25% y los descartados 39%—, o sea que el motor elegía peor que el
 * azar dentro de esa familia. Y ganar por dos o más exige una precisión que este
 * motor no tiene: se probó que el "ambiente de carreras" no lo predice
 * (ganadores con 19 de ambiente, perdedores con 89).
 *
 * **No se borró nada de nada**: `modelos-totales.ts` y `modelos-linea.ts` siguen
 * enteros, y las filas guardadas del 27 al 30 se siguen viendo en el panel.
 * **Volver es agregar el nombre a esta lista y nada más.**
 */
const FAMILIAS: string[] = ["ganador"];

/**
 * Con menos abridores anunciados que esto no se calcula la jornada.
 *
 * El modelo de abridores pesa el 30% y los anuncios llegan a lo largo de la
 * mañana. Calcular a las 6 AM daría una foto sin la mitad de los abridores, y
 * como cada jornada se guarda una sola vez, esa foto mala quedaría para siempre.
 */
const MINIMO_ANUNCIADOS = 0.7;

export type ResumenSenales = {
  fecha: string;
  guardados: number;
  entran: number;
  motivo?: string;
};

/**
 * Los precios de Polymarket, que son el voto del mercado.
 *
 * Si falla, el motor sigue con un modelo menos y se nota en `midieron`. Es
 * preferible una jornada con siete modelos a no guardar nada: el día no se
 * repite.
 */
export type Paliza = { equipo: string; lado: "local" | "visita"; p: number };

export async function mercadoDelDia(fecha: string): Promise<{
  ganador: Map<string, { local: number; visita: number }>;
  totales: Map<string, TotalMercado>;
  palizas: Map<string, Paliza>;
}> {
  const ganador = new Map<string, { local: number; visita: number }>();
  const totales = new Map<string, TotalMercado>();
  const palizas = new Map<string, Paliza>();
  try {
    for (const p of await traerPartidosDelDia(fecha)) {
      // **La clave es el `gamePk`**, y solo se cae al par de apodos si no se
      // pudo casar con la cartelera oficial. En una doble jornada los dos
      // partidos comparten apodos, así que con la clave vieja el segundo pisaba
      // al primero: los dos se quedaban con la misma línea de total, que era la
      // del partido equivocado en uno de los dos casos.
      const clave = p.juego || clavePartido(p.visita, p.local);
      if (p.ganaLocal !== null && p.ganaVisita !== null) {
        ganador.set(clave, { local: p.ganaLocal, visita: p.ganaVisita });
      }
      // `traerPartidosDelDia` ya se queda con la línea principal y ya filtra los
      // totales de primeras cinco entradas, que es la trampa clásica de estos
      // datos: parecen del juego completo y no lo son.
      if (p.over && p.under) {
        totales.set(clave, { linea: p.over.linea, mas: p.over.p, menos: p.under.p });
      }
      if (p.paliza) palizas.set(clave, p.paliza);
    }
  } catch {}
  return { ganador, totales, palizas };
}

/**
 * Calcula la jornada y la guarda. Si ya estaba guardada, no hace nada.
 *
 * **`mercado` se pasa como función a propósito, no como valor ya calculado.**
 * Traerlo son unas treinta consultas a Polymarket y a la MLB, y la jornada se
 * guarda **una vez al día**: con el valor ya hecho, cada corrida del cron pagaba
 * esas treinta consultas para descubrir un renglón después que no hacía falta
 * ninguna. Con el cron cada cinco minutos serían más de ocho mil consultas
 * diarias tiradas a la basura, a dos servicios gratuitos de los que este
 * proyecto depende.
 */
export async function guardarSenales(
  fecha: string,
  mercado?: () => Promise<{
    ganador: Map<string, { local: number; visita: number }>;
    totales: Map<string, TotalMercado>;
    palizas: Map<string, Paliza>;
  }>
): Promise<ResumenSenales> {
  const supabase = crearClienteAdmin();

  // Se mira **por familia** y no por día entero. Así, si un día se agrega una
  // familia nueva —los totales llegaron después que los ganadores— la jornada ya
  // guardada no bloquea a la que falta, y no hay que borrar lo de antes para
  // sumar lo nuevo. Borrarlo se llevaría por delante la curación manual.
  const { data: yaHay } = await supabase
    .from("senales_dia")
    .select("mercado")
    .eq("fecha", fecha);
  const guardadas = new Set((yaHay ?? []).map((f) => f.mercado as string));
  if (FAMILIAS.every((f) => guardadas.has(f))) {
    return { fecha, guardados: 0, entran: 0, motivo: "ya_estaba" };
  }

  // Recién acá se pagan las consultas de mercado: pasada la puerta de arriba,
  // que es la que corta el 99% de las corridas del día.
  const m = await mercado?.();
  const partidos = await traerJornada(fecha, m?.ganador, m?.totales, m?.palizas);
  if (partidos.length === 0) return { fecha, guardados: 0, entran: 0, motivo: "sin_jornada" };

  const conAbridores = partidos.filter((p) => p.abridorLocal && p.abridorVisita).length;
  if (conAbridores / partidos.length < MINIMO_ANUNCIADOS) {
    return { fecha, guardados: 0, entran: 0, motivo: "faltan_abridores" };
  }

  const comun = (p: (typeof partidos)[number]) => ({
    fecha,
    juego: p.juego,
    partido: p.titulo,
    hora: p.hora || null,
  });

  // Las familias se arman en **tres pasadas**, y el orden importa:
  //
  //   1. MEDIR cada candidato con todos los modelos.
  //   2. PROYECTAR los dos candidatos de un partido a escala espejo, para que el
  //      50 signifique "empate entre estos dos" en los nueve modelos y no solo en
  //      cinco. Sin este paso las puertas leen calidad del partido creyendo que
  //      leen ventaja — ver `proyectarPar`.
  //   3. JUZGAR sobre lo proyectado, y al final `puertaDeScore`, que mira la
  //      jornada entera y no se puede contestar de a un partido.
  const juzgarFamilia = <C>(
    pares: Array<{ p: (typeof partidos)[number]; c: C }>,
    modelos: Parameters<typeof juzgar<C>>[1],
    opciones?: Parameters<typeof juzgar<C>>[2]
  ) => {
    const medidos = pares.map(({ p, c }) => ({ p, c, med: medir(c, modelos) }));

    // Los candidatos de un mismo partido son los que forman par.
    const porJuego = new Map<string, typeof medidos>();
    for (const x of medidos) {
      porJuego.set(x.p.juego, [...(porJuego.get(x.p.juego) ?? []), x]);
    }
    const proyectado = new Map<(typeof medidos)[number], ReturnType<typeof medir>>();
    const calidades = new Map<string, number>();
    for (const [juego, grupo] of porJuego) {
      // Con un solo candidato no hay par que proyectar (la run line publica uno
      // por partido): se deja el crudo, que es lo que había antes.
      if (grupo.length !== 2) {
        for (const x of grupo) proyectado.set(x, x.med);
        continue;
      }
      const r = proyectarPar(grupo[0].med, grupo[1].med);
      proyectado.set(grupo[0], r.a);
      proyectado.set(grupo[1], r.b);
      // Cuánta calidad de partido se descartó, promediada entre los modelos.
      // Se registra, no se usa para decidir: es hipótesis, no puerta.
      if (r.calidad.length) {
        calidades.set(
          juego,
          Math.round(r.calidad.reduce((a, x) => a + x.sobre, 0) / r.calidad.length)
        );
      }
    }

    const veredictos = puertaDeScore(
      medidos.map((x) => juzgar(x.c, modelos, opciones, proyectado.get(x)))
    );
    return medidos.map((x, i) => ({
      p: x.p,
      c: x.c,
      v: veredictos[i],
      calidad: calidades.get(x.p.juego) ?? null,
    }));
  };

  // Quién gana
  const deGanador = juzgarFamilia(
    partidos.flatMap((p) => candidatosDe(p).map((c) => ({ p, c }))),
    MODELOS
  ).map(({ p, c, v }) => ({
    ...comun(p),
    mercado: "ganador",
    linea: null as number | null,
    lado: c.lado,
    equipo: nombreDe(c),
    score: v.score,
    midieron: v.midieron,
    total_modelos: v.total,
    acuerdo: v.acuerdo,
    entra: v.entra,
    motivo_descarte: v.motivoDescarte,
    contradice: v.contradice ? v.contradice.id : null,
    detalle: v.detalle,
  }));

  // Más o menos carreras. Solo donde el mercado publicó una línea: sin línea no
  // hay apuesta que juzgar, e inventarnos una sería medirnos contra nosotros
  // mismos.
  const deTotales = juzgarFamilia(
    partidos.flatMap((p) => candidatosTotalDe(p).map((c) => ({ p, c }))),
    MODELOS_TOTALES,
    OPCIONES_TOTALES
  ).map(({ p, c, v }) => ({
    ...comun(p),
    mercado: "total",
    linea: c.linea,
    lado: c.tipo,
    equipo: nombreTotalDe(c),
    score: v.score,
    midieron: v.midieron,
    total_modelos: v.total,
    acuerdo: v.acuerdo,
    entra: v.entra,
    motivo_descarte: v.motivoDescarte,
    contradice: v.contradice ? v.contradice.id : null,
    detalle: v.detalle,
  }));

  // Ganar por dos o más: la run line. Un solo candidato por partido, el que el
  // mercado publica con −1.5.
  const deLinea = juzgarFamilia(
    partidos.flatMap((p) => candidatoLineaDe(p).map((c) => ({ p, c }))),
    MODELOS_LINEA
  ).map(({ p, c, v }) => ({
    ...comun(p),
    mercado: "linea",
    linea: 1.5,
    lado: c.lado,
    equipo: nombreLineaDe(c),
    score: v.score,
    midieron: v.midieron,
    total_modelos: v.total,
    acuerdo: v.acuerdo,
    entra: v.entra,
    motivo_descarte: v.motivoDescarte,
    contradice: v.contradice ? v.contradice.id : null,
    detalle: v.detalle,
  }));

  // Cada familia entra si está en `FAMILIAS` y no se guardó ya hoy. Los totales
  // quedan fuera por la lista, no por estar comentados: el cálculo sigue vivo
  // arriba y basta con volver a nombrarlos para que entren.
  const activa = (f: string) => FAMILIAS.includes(f) && !guardadas.has(f);
  const filas = [
    ...(activa("ganador") ? deGanador : []),
    ...(activa("total") ? deTotales : []),
    ...(activa("linea") ? deLinea : []),
  ];
  if (filas.length === 0) return { fecha, guardados: 0, entran: 0, motivo: "ya_estaba" };

  const { error } = await supabase.from("senales_dia").insert(filas);
  // Si dos corridas coinciden, la segunda choca con la clave única y no pasa
  // nada: la jornada ya quedó guardada por la primera.
  if (error && !error.message.includes("un_senal_por_dia")) {
    console.error("[senales] guardar:", error.message);
    return { fecha, guardados: 0, entran: 0, motivo: "error" };
  }

  // Se cuenta lo que **quedó en la tabla**, no lo que se mandó.
  //
  // No es paranoia: la clave única no incluía el mercado, las filas de run line
  // chocaban con las de ganador del mismo partido, y como ese choque cae en el
  // `catch` de arriba la ruta contestaba "guardados: 12" sin haber guardado
  // ninguna. Un fallo que se declara a sí mismo como éxito no se descubre nunca.
  const { count } = await supabase
    .from("senales_dia")
    .select("*", { count: "exact", head: true })
    .eq("fecha", fecha);
  const guardados = (count ?? 0) - (yaHay?.length ?? 0);

  return {
    fecha,
    guardados,
    entran: filas.filter((f) => f.entra).length,
    ...(guardados < filas.length ? { motivo: `solo entraron ${guardados} de ${filas.length}` } : {}),
  };
}

/**
 * Marca qué candidatos acertaron, con los partidos ya terminados.
 *
 * Acertar es que **ese equipo ganó**, y se marca igual para los descartados: son
 * el grupo de comparación y sin su resultado no sirven de nada.
 */
export async function resolverSenales(): Promise<{ resueltos: number; pendientes: number }> {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("senales_dia")
    .select("id, fecha, juego, lado, mercado, linea")
    .is("resuelto_at", null)
    .order("fecha", { ascending: true })
    .limit(500);

  if (!data || data.length === 0) return { resueltos: 0, pendientes: 0 };

  // Una consulta de resultados por fecha, no una por candidato.
  const porFecha = new Map<string, typeof data>();
  for (const f of data) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f]);

  let resueltos = 0;
  let pendientes = 0;
  const ahora = new Date().toISOString();

  for (const [fecha, filas] of porFecha) {
    const resultados = await traerResultados(fecha);
    for (const f of filas) {
      const r = resultados.get(f.juego);
      if (!r || (!r.finalizado && !r.cancelado)) {
        pendientes++;
        continue;
      }
      // Un partido que no se jugó no acertó ni falló: se cierra sin resultado
      // para que no vuelva a mirarse, pero queda fuera de la estadística.
      let gano: boolean | null = null;
      if (!r.cancelado) {
        if (f.mercado === "linea") {
          // Cubre el −1.5 si ganó por dos o más. Perder o ganar por una, no.
          const dif =
            f.lado === "local"
              ? r.carrerasLocal - r.carrerasVisita
              : r.carrerasVisita - r.carrerasLocal;
          gano = dif >= 2;
        } else if (f.mercado === "total") {
          const total = r.carrerasLocal + r.carrerasVisita;
          const linea = Number(f.linea);
          // Empate exacto con la línea: ni acierta ni falla, como en cualquier
          // casa. Las líneas de Polymarket son de media carrera, así que casi
          // nunca pasa, pero "casi nunca" no es "nunca".
          gano =
            !Number.isFinite(linea) || total === linea
              ? null
              : f.lado === "mas"
                ? total > linea
                : total < linea;
        } else {
          gano =
            f.lado === "local"
              ? r.carrerasLocal > r.carrerasVisita
              : r.carrerasVisita > r.carrerasLocal;
        }
      }

      await supabase
        .from("senales_dia")
        .update({ gano, resuelto_at: ahora })
        .eq("id", f.id);
      resueltos++;
    }
  }

  return { resueltos, pendientes };
}

/**
 * Cómo le va al motor, comparando los elegidos contra los descartados.
 *
 * **La segunda columna es la que importa.** Un 62% de acierto entre los
 * elegidos no dice nada si los descartados también ganaron el 62%: querría decir
 * que el motor no está eligiendo, está mirando.
 */
export async function balanceSenales(): Promise<{
  elegidos: { n: number; aciertos: number };
  descartados: { n: number; aciertos: number };
  curados: { n: number; aciertos: number };
  /** Donde el humano y el motor no coincidieron, y quién tenía razón. */
  discrepancias: { n: number; ganoElHumano: number; ganoElMotor: number };
  porModelo: Record<string, { n: number; aciertos: number }>;
}> {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("senales_dia")
    .select("entra, curado, gano, detalle")
    .not("gano", "is", null)
    .limit(10000);

  const elegidos = { n: 0, aciertos: 0 };
  const descartados = { n: 0, aciertos: 0 };
  const curados = { n: 0, aciertos: 0 };
  const discrepancias = { n: 0, ganoElHumano: 0, ganoElMotor: 0 };
  const porModelo: Record<string, { n: number; aciertos: number }> = {};

  for (const f of (data ?? []) as Array<{
    entra: boolean;
    curado: boolean | null;
    gano: boolean;
    detalle: Array<{ id: string; score: number | null }>;
  }>) {
    const grupo = f.entra ? elegidos : descartados;
    grupo.n++;
    if (f.gano) grupo.aciertos++;

    // La serie manual, aparte.
    if (f.curado === true) {
      curados.n++;
      if (f.gano) curados.aciertos++;
    }

    // Donde los dos no coincidieron: quién acertó.
    //
    // Es la comparación que de verdad enseña algo. Que las dos series acierten
    // parecido no dice nada si eligen casi lo mismo; lo que importa es qué pasa
    // justo donde se separan.
    if (f.curado !== null && f.curado !== f.entra) {
      discrepancias.n++;
      // El humano quiso tomarla: acierta si ganó. El humano la sacó: acierta si perdió.
      if (f.curado === f.gano) discrepancias.ganoElHumano++;
      else discrepancias.ganoElMotor++;
    }

    // Cuánto acierta cada modelo por su cuenta, cuando se moja de verdad
    // (por encima de 65). Es lo que dice si un modelo aporta o solo hace ruido.
    for (const d of f.detalle ?? []) {
      if (d.score === null || d.score < 65) continue;
      const m = (porModelo[d.id] ??= { n: 0, aciertos: 0 });
      m.n++;
      if (f.gano) m.aciertos++;
    }
  }

  return { elegidos, descartados, curados, discrepancias, porModelo };
}
