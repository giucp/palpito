import { NextResponse, type NextRequest } from "next/server";
import { cerrarResultados } from "@/lib/sincronizacion";

export const maxDuration = 300;

// En local el cierre de resultados corre solo (src/lib/automatizacion.ts).
// En Vercel lo dispara el cron de vercel.json; también sirve para depurar a mano.
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
  // No se exige ODDS_API_KEY: los resultados salen de fuentes propias y
  // gratuitas, y The Odds API solo entra como plan B si está configurada.
  return NextResponse.json(await cerrarResultados());
}
