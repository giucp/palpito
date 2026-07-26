import { AppApuestas } from "@/components/app-apuestas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Dinámica por sesión: usuario y saldo se leen en cada petición.
//
// Ya no se carga el catálogo de eventos acá. Lo pedía para el lobby viejo, el
// de apostar contra la casa; hoy la cartelera sale de ESPN dentro del propio
// componente y el tablero de apuestas se pide por su ruta. Era una consulta a
// Supabase en cada carga de la portada que no miraba nadie.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <AppApuestas usuario={null} saldo={null} />;

  const { data } = await supabase
    .from("saldos")
    .select("saldo")
    .eq("usuario_id", user.id)
    .maybeSingle();

  // ¿Es administrador? Solo para mostrarle el acceso al panel; el permiso de
  // verdad lo comprueba /admin por su cuenta.
  const admin = crearClienteAdmin();
  const { data: esAdmin } = await admin
    .from("administradores")
    .select("usuario_id")
    .eq("usuario_id", user.id)
    .maybeSingle();

  return (
    <AppApuestas
      usuario={{ email: user.email ?? "", admin: !!esAdmin }}
      saldo={data?.saldo !== undefined && data?.saldo !== null ? Number(data.saldo) : 0}
    />
  );
}
