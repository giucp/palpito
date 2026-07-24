import { AppApuestas } from "@/components/app-apuestas";
import { cargarEventos } from "@/lib/eventos";
import { crearClienteServidor } from "@/lib/supabase/server";

// Dinámica por sesión: catálogo + usuario + saldo se leen en cada petición.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ eventos, origen }, sesion] = await Promise.all([
    cargarEventos(),
    (async () => {
      const supabase = await crearClienteServidor();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { usuario: null, saldo: null };

      const { data } = await supabase
        .from("saldos")
        .select("saldo")
        .eq("usuario_id", user.id)
        .maybeSingle();
      return {
        usuario: { email: user.email ?? "" },
        saldo: data?.saldo !== undefined && data?.saldo !== null ? Number(data.saldo) : 0,
      };
    })(),
  ]);

  return (
    <AppApuestas
      eventos={eventos}
      origen={origen}
      usuario={sesion.usuario}
      saldo={sesion.saldo}
    />
  );
}
