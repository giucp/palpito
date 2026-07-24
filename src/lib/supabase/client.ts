import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes del navegador. Solo lectura de catálogo y
// datos propios (el RLS manda); el dinero nunca se mueve desde aquí.
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
