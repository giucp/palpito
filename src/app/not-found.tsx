import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="mono text-sm tracking-widest text-mist">404</p>
      <h1 className="text-3xl font-extrabold">Esta página no existe</h1>
      <p className="max-w-sm text-ink2">
        El partido que buscas no está aquí. Vuelve al inicio para ver la
        cartelera.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-lima px-6 py-3 font-bold text-lima-ink"
      >
        Ir al inicio
      </Link>
    </main>
  );
}
