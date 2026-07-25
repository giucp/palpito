import type { Metadata } from "next";
import Link from "next/link";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { VistaDesafio } from "@/components/vista-desafio";

// La pantalla que abre quien recibe el desafío por WhatsApp.
//
// Se renderiza en el servidor con la clave de servicio para poder mostrar el
// partido y el monto a cualquiera que tenga el enlace (es lo mismo que ya se ve
// en la tarjeta de WhatsApp). Pero **aceptar** exige haber entrado y ser el
// rival: eso lo comprueba la función de la base, no esta página.

type Props = { params: Promise<{ id: string }> };

async function traerDesafio(id: string) {
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("desafios")
    .select(
      "id, creador_id, rival_id, lado_creador, monto, comision_bps, estado, eventos(id, liga, equipo_a, equipo_b, comienza_at, estado, marcador_a, marcador_b)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const { data: perfiles } = await admin
    .from("perfiles")
    .select("usuario_id, alias")
    .in("usuario_id", [data.creador_id, data.rival_id]);
  const alias = new Map((perfiles ?? []).map((p) => [p.usuario_id, p.alias]));

  return {
    ...data,
    eventos: data.eventos as unknown as {
      id: string;
      liga: string;
      equipo_a: string;
      equipo_b: string;
      comienza_at: string;
      estado: string;
      marcador_a: number | null;
      marcador_b: number | null;
    },
    aliasCreador: alias.get(data.creador_id) ?? "?",
    aliasRival: alias.get(data.rival_id) ?? "?",
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await traerDesafio(id);
  if (!d) return { title: "Desafío no encontrado · Pálpito" };

  const elegido = d.lado_creador === "local" ? d.eventos.equipo_a : d.eventos.equipo_b;
  return {
    title: `@${d.aliasCreador} te desafía · Pálpito`,
    description:
      `${d.eventos.equipo_a} vs ${d.eventos.equipo_b} — @${d.aliasCreador} va con ` +
      `${elegido} y pone ${Number(d.monto).toFixed(0)} fichas. ¿Aceptás?`,
  };
}

export default async function PaginaDesafio({ params }: Props) {
  const { id } = await params;
  const d = await traerDesafio(id);

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!d) {
    return (
      <main className="desafio-pagina">
        <div className="dsf-card">
          <h1>Ese desafío no existe</h1>
          <p>Puede que el enlace esté mal copiado.</p>
          <Link className="bapostar" href="/">
            Ir a Pálpito
          </Link>
        </div>
      </main>
    );
  }

  return (
    <VistaDesafio
      desafio={{
        id: d.id,
        monto: Number(d.monto),
        comisionBps: d.comision_bps,
        ladoCreador: d.lado_creador as "local" | "visitante",
        estado: d.estado,
        aliasCreador: d.aliasCreador,
        aliasRival: d.aliasRival,
        evento: {
          liga: d.eventos.liga,
          equipoA: d.eventos.equipo_a,
          equipoB: d.eventos.equipo_b,
          comienzaAt: d.eventos.comienza_at,
          estado: d.eventos.estado,
          marcadorA: d.eventos.marcador_a,
          marcadorB: d.eventos.marcador_b,
        },
      }}
      soyRival={user?.id === d.rival_id}
      soyCreador={user?.id === d.creador_id}
      entrado={Boolean(user)}
    />
  );
}
