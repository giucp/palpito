# Hipótesis probadas sobre el motor

Lo que se propuso, se midió y **se cayó**. Está escrito para no volver a
proponerlo, que es la mitad de lo que se aprende.

La regla al agregar una línea acá: decir **con cuántos casos** se midió. Casi
todas estas hipótesis parecían buenas con cuatro o cinco casos y se cayeron con
cuarenta.

---

## Refutadas

### El ambiente de carreras predice la run line
**Propuesta (28/07):** ganar por dos o más necesita dos cosas a la vez —ventaja
clara *y* un partido de carreras— y el motor las suma en vez de exigir las dos.
Se pasaron cuatro run lines por tener el ambiente bajo.

**Con 4 casos parecía cierta: 3 aciertos y 1 fallo.**

**Refutada con 42 casos (30/07).** No hay relación: ganaron run lines con el
ambiente en 19, 29 y 30, y perdieron con 71, 78 y 89. Aplicar el filtro a los
verdes los empeora — quedarían 2, ninguno ganador, y se caería 1 que sí ganó.

Lección: cuatro casos elegidos por uno mismo no son una muestra. Son una
anécdota con forma de dato.

### Subir la distancia a la que un modelo "contradice"
**Propuesta (30/07):** si un modelo solitario 30 puntos por debajo de la mediana
acierta, quizá exigiendo 40 o 50 puntos acierta más y atrapa menos.

**Refutada el mismo día.** Se probaron 30, 35, 40, 45 y 50: la proporción de
acierto es la misma en todos (4-1, 3-1, 2-1, 1-0), solo cambia a cuántos
candidatos atrapa. La distancia no discrimina.

### Rescatar candidatos descartados por falta de cobertura
**Propuesta (28/07):** cuando el motor descarta porque le faltan modelos —un
abridor sin anunciar— pero el resto de la señal es fuerte, el descarte es un
tecnicismo y vale la pena tomarlo.

**Refutada con 2 casos (29/07).** Tampa y Dodgers, los dos rescatados, perdieron
los dos. Son pocos casos, pero la dirección era tan clara que el criterio cambió:
la falta de datos se trata como motivo de descarte.

---

## En pie, sin muestra suficiente

### `abridores` puede estar aportando poco
Cuando se moja (score ≥ 65) acierta **40% con 55 casos**, por debajo del azar de
la muestra (47%). El margen es ±13, así que roza el azar por arriba y **no es
concluyente**. Es el modelo con más peso (30%) y el único importante que va mal.

Qué haría falta: unos 100 casos. Si sigue por debajo de 45%, hay que mirar si el
FIP de temporada es la medida correcta.

### `forma-abridor` puede estar aportando mucho
75% con 12 casos. Prometedor y sin ningún valor estadístico. No tocar su peso
hasta tener 100.

---

## Cómo se mide

```
node scripts/balance.ts              todo, con margen de error y n
node scripts/calibrar-senales.js     reprocesa lo guardado con otros umbrales
```

`calibrar-senales.js` es la herramienta para esto: relee lo ya guardado sin
recalcular modelos, así que una hipótesis se prueba en segundos y contra los
mismos datos.
