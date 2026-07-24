"use client";

// Reemplaza al layout raíz cuando algo revienta a nivel global, por eso
// define su propio <html>/<body> y no depende de globals.css.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#08090B",
          color: "#EDF1F3",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
          Algo salió mal
        </h1>
        <p style={{ color: "#828C96", margin: 0 }}>
          Ocurrió un error inesperado. Intenta de nuevo.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#B6FF3D",
            color: "#08090B",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
