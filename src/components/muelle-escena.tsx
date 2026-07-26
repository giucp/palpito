"use client";

// La escena de El Muelle, en SVG y CSS.
//
// Reemplaza al lienzo de pixel art. Tres razones:
//   · Nítida en cualquier pantalla. El pixel art se veía escalonado en móviles
//     de mucha densidad, que es donde se juega.
//   · No hay bucle de dibujado. Antes se repintaba el `<canvas>` a 60 cuadros
//     por segundo aunque no pasara nada; ahora las olas son una animación CSS
//     que corre en la GPU y el resto solo se mueve cuando cambia el juego.
//   · Las tablas son botones de verdad, así que se tocan, se navegan con
//     teclado y las lee un lector de pantalla.

export type EstadoTabla = "esperando" | "tocada" | "elegida" | "rota" | "sana";

type Props = {
  paso: number; // en qué paso va (0 = todavía en la orilla)
  total: number;
  premios: number[];
  jugando: boolean;
  // Cómo quedó cada tabla del paso actual, una vez resuelto.
  revelado: { izquierda: EstadoTabla; derecha: EstadoTabla } | null;
  // Qué tabla se acaba de tocar, antes de que el servidor conteste. Sin esto
  // había medio segundo largo sin respuesta al toque y se sentía roto.
  tocada: 0 | 1 | null;
  hundido: boolean;
  onElegir: (lado: 0 | 1) => void;
};

// Olas: tres bandas con el mismo perfil, desfasadas y a distinta velocidad.
// Da sensación de profundidad con tres rutas y ninguna lógica.
function Agua() {
  const perfil = "M0 12 q 30 -9 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 v 40 H0 Z";
  return (
    <div className="mu-agua" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`mu-ola mu-ola-${i}`} viewBox="0 0 360 52" preserveAspectRatio="none">
          <path d={perfil} />
        </svg>
      ))}
    </div>
  );
}

function Tabla({
  lado,
  premio,
  estado,
  activa,
  onElegir,
}: {
  lado: 0 | 1;
  premio: number;
  estado: EstadoTabla;
  activa: boolean;
  onElegir: (lado: 0 | 1) => void;
}) {
  return (
    <button
      type="button"
      className={`mu-tabla ${estado} ${activa ? "activa" : ""}`}
      disabled={!activa}
      onClick={() => onElegir(lado)}
      aria-label={`Saltar a la tabla de la ${lado === 0 ? "izquierda" : "derecha"}, paga ${premio}x`}
    >
      <span className="mu-veta" aria-hidden="true" />
      <span className="mu-premio mono">{premio}x</span>
      {estado === "rota" && <span className="mu-grieta" aria-hidden="true" />}
    </button>
  );
}

export function MuelleEscena({
  paso,
  total,
  premios,
  jugando,
  revelado,
  tocada,
  hundido,
  onElegir,
}: Props) {
  const siguiente = premios[paso] ?? null;
  const puedeElegir =
    jugando && !hundido && revelado === null && tocada === null && siguiente !== null;

  const estadoDe = (lado: 0 | 1): EstadoTabla => {
    if (revelado) return lado === 0 ? revelado.izquierda : revelado.derecha;
    return tocada === lado ? "tocada" : "esperando";
  };

  return (
    <div className={`mu-escena ${hundido ? "hundido" : ""}`}>
      <Agua />

      {/* El camino ya cruzado: una marca por paso, para ver cuánto llevás */}
      <div className="mu-recorrido" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`mu-hito ${i < paso ? "hecho" : ""} ${i === paso ? "aqui" : ""}`} />
        ))}
      </div>

      {siguiente !== null ? (
        <div className="mu-paso">
          <div className="mu-tablas">
            <Tabla
              lado={0}
              premio={siguiente}
              estado={estadoDe(0)}
              activa={puedeElegir}
              onElegir={onElegir}
            />
            <Tabla
              lado={1}
              premio={siguiente}
              estado={estadoDe(1)}
              activa={puedeElegir}
              onElegir={onElegir}
            />
          </div>
          <p className="mu-pista">
            {puedeElegir
              ? "Elegí una tabla. La otra se rompe igual."
              : hundido
                ? "Se partió."
                : tocada !== null && !revelado
                  ? "Pisando…"
                  : " "}
          </p>
        </div>
      ) : (
        <div className="mu-paso">
          <p className="mu-pista">Cruzaste el muelle entero.</p>
        </div>
      )}
    </div>
  );
}
