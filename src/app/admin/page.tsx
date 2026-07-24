import { notFound } from "next/navigation";
import { PanelAdmin } from "@/components/panel-admin";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Administración · Pálpito",
  // Que no aparezca en buscadores aunque alguien enlace la dirección.
  robots: { index: false, follow: false },
};

export default async function Admin() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Para quien no sea administrador, la página simplemente no existe: así no
  // se confirma que haya un panel detrás de esta dirección.
  if (!user) notFound();

  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("administradores")
    .select("usuario_id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (!data) notFound();

  return <PanelAdmin correo={user.email ?? ""} />;
}
