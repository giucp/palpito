import { NextResponse, type NextRequest } from "next/server";
import { guardarSenales, mercadoDelDia } from "@/lib/senales/guardar";

// Calcular y guardar la jornada del motor de señales.
//
// **Va en su propia ruta y no pegada a /api/resultados, y hay una razón medida.**
// Calcular la jornada son unas ciento treinta consultas a la MLB y tarda unos 20
// segundos; sumado al cierre de resultados y a los combos, la petición llegó a
// 51 segundos contra un límite de 60. Un día con muchos partidos por cerrar la
// hubiera cortado.
//
// Separadas, cada una tiene su tiempo entero. Y el orden importa: si esta falla,
// la liquidación de las apuestas —que sí mueve dinero— ya terminó y quedó
// guardada.
//
// Es idempotente: si la jornada de hoy ya está guardada, contesta y no hace
// nada. Por eso el cron puede llamarla cada diez minutos sin gastar de más.

export const maxDuration = 300;

const ZONA = "America/Caracas";
const hoyEnCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

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
  const fecha = req.nextUrl.searchParams.get("fecha") || hoyEnCaracas();
  return NextResponse.json(await guardarSenales(fecha, await mercadoDelDia(fecha)));
}
