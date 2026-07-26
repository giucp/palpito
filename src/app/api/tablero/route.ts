import { NextResponse, type NextRequest } from "next/server";
import { traerTablero } from "@/lib/tablero";

// El tablero se pide por acá y no desde el navegador para poder cachearlo: si
// diez personas miran la misma liga, ESPN recibe una sola consulta.

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

  return NextResponse.json({ ok: true, liga: encontrada, partidos });
}
