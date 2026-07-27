import { cerrarResultados } from "./sincronizacion";

// Programador interno: corre dentro del servidor de Next y no requiere ningún
// disparo manual. En producción lo sustituye el cron de GitHub Actions, que
// llama a /api/resultados cada 10 minutos; en local esto es lo que mantiene la
// cartelera al día mientras se trabaja.
//
// Antes tenía dos ciclos: uno para las cuotas de The Odds API y otro para los
// resultados. El de las cuotas se fue con The Odds API el 2026-07-27. Los
// resultados salen de statsapi.mlb.com y de la API pública de ESPN, gratis y sin
// tope, así que mirarlos seguido no cuesta nada y la ganancia se acredita a los
// pocos minutos de terminar el partido.
const CADA_RESULTADOS = 10 * 60 * 1000; // 10 min

async function cicloResultados() {
  try {
    const r = await cerrarResultados();
    if (r.eventosCerrados > 0 || r.eventosAnulados > 0) {
      const fuentes = Object.entries(r.porFuente)
        .map(([f, n]) => `${f}: ${n}`)
        .join(", ");
      console.log(
        `[automatización] resultados: ${r.eventosCerrados} eventos cerrados (${fuentes})` +
          (r.eventosAnulados > 0 ? `, ${r.eventosAnulados} anulados` : "")
      );
    }
  } catch (e) {
    console.error("[automatización] error cerrando resultados:", e);
  }
}

export function iniciarAutomatizacion() {
  console.log("[automatización] programador iniciado: resultados cada 10 min");
  // Arranque suave a los 15 s, para no pelearse con el arranque del servidor.
  setTimeout(() => cicloResultados(), 15_000);
  setInterval(() => cicloResultados(), CADA_RESULTADOS);
}
