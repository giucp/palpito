import { NextResponse, type NextRequest } from "next/server";
import { cerrarResultados } from "@/lib/sincronizacion";
import { resolverCombosPendientes } from "@/lib/combos-resultado";

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
  //
  // Los combos del día viajan pegados acá en vez de tener su propio cron: usan
  // la misma fuente (statsapi.mlb.com) y el mismo ritmo de 10 minutos. Van
  // aparte en un try porque no mueven dinero: si la MLB falla, que no arrastre
  // a la liquidación de las apuestas, que sí lo mueve.
  const resultados = await cerrarResultados();
  let combos = null;
  try {
    combos = await resolverCombosPendientes();
  } catch (e) {
    console.error("[combos] resolver:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ...resultados, combos });
}
