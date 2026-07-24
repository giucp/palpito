import { createClient } from "@supabase/supabase-js";

// Cliente con la clave de servicio: salta el RLS. Es la ÚNICA vía para
// insertar apuestas y movimientos (palpito_guia.md §6, Seguridad básica).
// Jamás importar desde código que llegue al navegador.
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
