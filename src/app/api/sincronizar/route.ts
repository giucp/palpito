import { NextResponse, type NextRequest } from "next/server";
import { faltaSincronizar, sincronizarCartelera } from "@/lib/sincronizacion";

export const maxDuration = 300;

// En local la sincronización corre sola (src/lib/automatizacion.ts).
// En Vercel la dispara el cron de vercel.json; también sirve para depurar a mano.
function autorizado(req: NextRequest): boolean {
  const clave = req.nextUrl.searchParams.get("clave");
  if (process.env.SINCRONIZACION_SECRETO && clave === process.env.SINCRONIZACION_SECRETO)
    return true;
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: "Falta ODDS_API_KEY" }, { status: 503 });
  }

  // El cron de Vercel (plan Hobby) solo sabe correr una vez al día, y una corrida
  // diaria de las 7 ligas se pasaría del plan gratis de The Odds API. Así que el
  // freno está acá: llama todos los días y casi siempre contesta que no hace
  // falta, sin gastar un crédito. Con ?forzar=1 se salta, para depurar.
  const forzar = req.nextUrl.searchParams.get("forzar") === "1";
  if (!forzar && !(await faltaSincronizar())) {
    return NextResponse.json({ ok: true, omitida: true, motivo: "cartelera al día" });
  }

  return NextResponse.json(await sincronizarCartelera());
}
