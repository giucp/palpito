import {
  CADA_SINCRONIZACION_MS,
  cerrarResultados,
  faltaSincronizar,
  sincronizarCartelera,
} from "./sincronizacion";

// Programador interno: corre dentro del servidor de Next y no requiere ningún
// disparo manual. (Al desplegar en Vercel esto se sustituye por Vercel Cron.)

// Los resultados salen de fuentes gratuitas y sin tope (ver src/lib/resultados),
// así que mirarlos seguido no cuesta nada y la ganancia se acredita a los pocos
// minutos de terminar el partido. Lo que sí cuesta créditos son las cuotas.
const CADA_RESULTADOS = 10 * 60 * 1000; // 10 min
// Se revisa cada 6 h si toca sincronizar; el freno de verdad (y el porqué de su
// valor) está en CADA_SINCRONIZACION_MS, en sincronizacion.ts.
const CADA_REVISION_CARTELERA = 6 * 60 * 60 * 1000;

async function cicloSincronizacion(forzar = false) {
  try {
    if (!process.env.ODDS_API_KEY) return;
    if (!forzar && !(await faltaSincronizar())) {
      console.log("[automatización] cartelera al día, no se sincroniza");
      return;
    }
    console.log("[automatización] sincronizando cartelera…");
    const r = await sincronizarCartelera();
    console.log(
      `[automatización] cartelera lista: ${r.resumen
        .filter((x) => x.eventos > 0)
        .map((x) => `${x.liga} (${x.eventos})`)
        .join(", ")} · créditos restantes: ${r.creditosRestantes ?? "?"}`
    );
  } catch (e) {
    console.error("[automatización] error sincronizando:", e);
  }
}

async function cicloResultados() {
  try {
    // Ya no hace falta ODDS_API_KEY para esto: las fuentes propias no la usan.
    const r = await cerrarResultados();
    if (r.eventosCerrados > 0 || r.eventosAnulados > 0) {
      const fuentes = Object.entries(r.porFuente)
        .map(([f, n]) => `${f}: ${n}`)
        .join(", ");
      console.log(
        `[automatización] resultados: ${r.eventosCerrados} eventos cerrados (${fuentes}), ` +
          `${r.apuestasCerradas} apuestas liquidadas` +
          (r.eventosAnulados > 0 ? `, ${r.eventosAnulados} anulados` : "") +
          (r.ligasPlanB.length > 0
            ? ` · plan B en ${r.ligasPlanB.join(", ")} (quedan ${r.creditosRestantes ?? "?"} créditos)`
            : "")
      );
    }
  } catch (e) {
    console.error("[automatización] error cerrando resultados:", e);
  }
}

export function iniciarAutomatizacion() {
  const horas = Math.round(CADA_SINCRONIZACION_MS / 3600_000);
  console.log(
    `[automatización] programador iniciado: cartelera cada ${horas} h, resultados cada 10 min`
  );
  // Arranque suave a los 15 s: sincroniza si hace falta y revisa resultados.
  setTimeout(async () => {
    await cicloSincronizacion();
    await cicloResultados();
  }, 15_000);
  setInterval(() => cicloSincronizacion(), CADA_REVISION_CARTELERA);
  setInterval(() => cicloResultados(), CADA_RESULTADOS);
}
