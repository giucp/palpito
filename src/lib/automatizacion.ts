import { crearClienteAdmin } from "./supabase/admin";
import { cerrarResultados, sincronizarCartelera } from "./sincronizacion";

// Programador interno: corre dentro del servidor de Next y no requiere ningún
// disparo manual. (Al desplegar en Vercel esto se sustituye por Vercel Cron.)

// Cada corrida cuesta créditos de The Odds API (500/mes en el plan gratis, unos
// 16 por día). Revisar resultados cada 30 min los quemaba en pocos días, y para
// apuestas pre-partido no hace falta liquidar al minuto.
const CADA_RESULTADOS = 2 * 60 * 60 * 1000; // 2 h
const CADA_SINCRONIZACION = 12 * 60 * 60 * 1000; // 12 h

async function faltaSincronizar(): Promise<boolean> {
  try {
    const supabase = crearClienteAdmin();

    // ¿Hay selecciones de la API sin metadatos de liquidación? (autocuración)
    const { count: sinLado } = await supabase
      .from("selecciones")
      .select("id", { count: "exact", head: true })
      .is("lado", null)
      .not("mercado_id", "is", null);

    const { data: ultimo } = await supabase
      .from("eventos")
      .select("created_at")
      .not("externo_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimo) return true; // nunca se ha sincronizado
    const viejo = Date.now() - new Date(ultimo.created_at).getTime() > CADA_SINCRONIZACION;
    return viejo || (sinLado ?? 0) > 0;
  } catch {
    return false;
  }
}

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
    if (!process.env.ODDS_API_KEY) return;
    const r = await cerrarResultados();
    if (r.eventosCerrados > 0 || r.ligasConsultadas.length > 0 || r.eventosAnulados > 0) {
      console.log(
        `[automatización] resultados: ${r.eventosCerrados} eventos cerrados, ` +
          `${r.apuestasCerradas} apuestas liquidadas` +
          (r.eventosAnulados > 0 ? `, ${r.eventosAnulados} anulados por antigüedad` : "") +
          ` (${r.ligasConsultadas.join(", ") || "—"})`
      );
    }
  } catch (e) {
    console.error("[automatización] error cerrando resultados:", e);
  }
}

export function iniciarAutomatizacion() {
  console.log("[automatización] programador iniciado: cartelera cada 12 h, resultados cada 2 h");
  // Arranque suave a los 15 s: sincroniza si hace falta y revisa resultados.
  setTimeout(async () => {
    await cicloSincronizacion();
    await cicloResultados();
  }, 15_000);
  setInterval(() => cicloSincronizacion(), CADA_SINCRONIZACION);
  setInterval(() => cicloResultados(), CADA_RESULTADOS);
}
