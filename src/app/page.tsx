import { AppApuestas } from "@/components/app-apuestas";
import { cargarEventos } from "@/lib/eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";
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

      // ¿Es administrador? Solo para mostrarle el acceso al panel; el permiso
      // de verdad lo comprueba /admin por su cuenta.
      const admin = crearClienteAdmin();
      const { data: esAdmin } = await admin
        .from("administradores")
        .select("usuario_id")
        .eq("usuario_id", user.id)
        .maybeSingle();

      return {
        usuario: { email: user.email ?? "", admin: !!esAdmin },
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
