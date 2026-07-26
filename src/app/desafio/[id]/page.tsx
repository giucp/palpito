import type { Metadata } from "next";
import Link from "next/link";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { VistaDesafio } from "@/components/vista-desafio";
import { VistaDesafioJuego } from "@/components/vista-desafio-juego";

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
      "id, creador_id, rival_id, tipo, lado_creador, monto, comision_bps, estado, expira_at, jugada_creador, jugada_rival, eventos(id, liga, equipo_a, equipo_b, comienza_at, estado, marcador_a, marcador_b)"
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
    // En un desafío de juego no hay partido: `eventos` viene null.
    eventos: data.eventos as unknown as {
      id: string;
      liga: string;
      equipo_a: string;
      equipo_b: string;
      comienza_at: string;
      estado: string;
      marcador_a: number | null;
      marcador_b: number | null;
    } | null,
    aliasCreador: alias.get(data.creador_id) ?? "?",
    aliasRival: alias.get(data.rival_id) ?? "?",
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await traerDesafio(id);
  if (!d) return { title: "Desafío no encontrado · Pálpito" };

  const fichas = Number(d.monto).toFixed(0);

  if (d.tipo !== "deportivo") {
    return {
      title: `@${d.aliasCreador} te desafía · Pálpito`,
      description:
        `Carta más alta por ${fichas} fichas cada uno. Sacás una carta, saca la suya, ` +
        `y la más alta se lleva el pozo. ¿Aceptás?`,
    };
  }

  const ev = d.eventos!;
  const elegido = d.lado_creador === "local" ? ev.equipo_a : ev.equipo_b;
  return {
    title: `@${d.aliasCreador} te desafía · Pálpito`,
    description:
      `${ev.equipo_a} vs ${ev.equipo_b} — @${d.aliasCreador} va con ` +
      `${elegido} y pone ${fichas} fichas. ¿Aceptás?`,
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

  const soyRival = user?.id === d.rival_id;
  const soyCreador = user?.id === d.creador_id;

  // ---- Desafío de juego (carta más alta) ----
  if (d.tipo !== "deportivo") {
    const mio = soyCreador ? d.jugada_creador : d.jugada_rival;
    const suyo = soyCreador ? d.jugada_rival : d.jugada_creador;
    const resuelto = d.estado === "ganado_creador" || d.estado === "ganado_rival" || d.estado === "empate";

    return (
      <VistaDesafioJuego
        desafio={{
          id: d.id,
          tipo: d.tipo,
          monto: Number(d.monto),
          comisionBps: d.comision_bps,
          estado: d.estado,
          expiraAt: d.expira_at as string | null,
          aliasCreador: d.aliasCreador,
          aliasRival: d.aliasRival,
        }}
        soyRival={soyRival}
        soyCreador={soyCreador}
        entrado={Boolean(user)}
        // Solo se mandan las cartas que a esta persona le toca ver: la suya
        // siempre, y la del otro únicamente si la partida ya se resolvió.
        miIndice={(mio as { indice?: number } | null)?.indice ?? null}
        suIndice={resuelto ? ((suyo as { indice?: number } | null)?.indice ?? null) : null}
        gano={
          resuelto
            ? d.estado === "empate"
              ? "empate"
              : (d.estado === "ganado_creador") === soyCreador
                ? "ganaste"
                : "perdiste"
            : null
        }
      />
    );
  }

  // ---- Desafío deportivo ----
  const ev = d.eventos!;
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
          liga: ev.liga,
          equipoA: ev.equipo_a,
          equipoB: ev.equipo_b,
          comienzaAt: ev.comienza_at,
          estado: ev.estado,
          marcadorA: ev.marcador_a,
          marcadorB: ev.marcador_b,
        },
      }}
      soyRival={soyRival}
      soyCreador={soyCreador}
      entrado={Boolean(user)}
    />
  );
}
