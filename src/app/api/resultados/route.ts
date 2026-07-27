import { NextResponse, type NextRequest } from "next/server";
import { cerrarResultados } from "@/lib/sincronizacion";
import { resolverCombosPendientes } from "@/lib/combos-resultado";
import { guardarSenales, resolverSenales, mercadoDelDia } from "@/lib/senales/guardar";

export const maxDuration = 300;

const ZONA = "America/Caracas";
const hoyEnCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

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

  // Las señales, también pegadas acá. Guardar la jornada es caro —unas ciento
  // treinta consultas a la MLB— pero pasa **una vez al día**: `guardarSenales`
  // se corta sola si ya hay filas de hoy, y también si todavía no se anunciaron
  // los abridores, porque una foto sin ellos quedaría guardada para siempre.
  //
  // Resolver, en cambio, es barato y corre en cada vuelta.
  let senales = null;
  try {
    const guardado = await guardarSenales(hoyEnCaracas(), await mercadoDelDia(hoyEnCaracas()));
    const resuelto = await resolverSenales();
    senales = { ...guardado, ...resuelto };
  } catch (e) {
    console.error("[senales]", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ...resultados, combos, senales });
}
