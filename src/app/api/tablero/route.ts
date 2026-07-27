import { NextResponse, type NextRequest } from "next/server";
import { traerTablero } from "@/lib/tablero";

// El tablero se pide por acá y no desde el navegador para poder cachearlo: si
// diez personas miran la misma liga, ESPN recibe una sola consulta.
//
// **Y hasta hoy no se cacheaba.** Ese comentario estaba desde el principio pero
// faltaba la cabecera, así que cada persona que abría la app esperaba el segundo
// entero de ESPN. Medido en producción: 1,04 s por visita, siempre.
//
// 20 segundos no es un número al azar: la pantalla se refresca sola cada 30 s,
// así que nadie llega a ver un marcador más viejo del que ya vería igual.
// `stale-while-revalidate` hace que, pasados esos 20 s, el primero que llega
// reciba la copia vieja al instante mientras se busca la nueva por detrás.
// Nadie espera nunca.
const CACHE = "public, s-maxage=20, stale-while-revalidate=60";

export async function GET(req: NextRequest) {
  const liga = req.nextUrl.searchParams.get("liga") ?? "mlb";
  const fechaTexto = req.nextUrl.searchParams.get("fecha");

  const fecha = fechaTexto ? new Date(`${fechaTexto}T12:00:00Z`) : new Date();
  if (Number.isNaN(fecha.getTime())) {
    return NextResponse.json({ ok: false, motivo: "fecha_invalida" }, { status: 400 });
  }

  const { liga: encontrada, partidos } = await traerTablero(liga, fecha);
  if (!encontrada) {
    return NextResponse.json({ ok: false, motivo: "liga_desconocida" }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, liga: encontrada, partidos },
    { headers: { "Cache-Control": CACHE } }
  );
}
