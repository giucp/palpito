import { NextResponse, type NextRequest } from "next/server";
import { cerrarResultados } from "@/lib/sincronizacion";
import { resolverSenales } from "@/lib/senales/guardar";

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
  const resultados = await cerrarResultados();

  // Marcar qué señales acertaron. Es barato —una consulta y los marcadores del
  // día— así que va en cada vuelta.
  //
  // Calcular la jornada, en cambio, vive en /api/senales: son unas ciento
  // treinta consultas a la MLB y aquí dentro llevaba la petición a 51 segundos
  // contra un límite de 60.
  let senales = null;
  try {
    senales = await resolverSenales();
  } catch (e) {
    console.error("[senales] resolver:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ...resultados, senales });
}
