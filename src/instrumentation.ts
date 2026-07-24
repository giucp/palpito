// Punto de arranque del servidor (convención de Next). Enciende el
// programador interno una sola vez por proceso.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // En Vercel no hay proceso siempre encendido: allí mandan los crons
  // (vercel.json) que llaman a /api/sincronizar y /api/resultados.
  if (process.env.VERCEL === "1") return;
  const global = globalThis as typeof globalThis & { __palpitoAutomatizacion?: boolean };
  if (global.__palpitoAutomatizacion) return;
  global.__palpitoAutomatizacion = true;

  const { iniciarAutomatizacion } = await import("./lib/automatizacion");
  iniciarAutomatizacion();
}
