-- Pálpito — La clave única tiene que incluir el mercado
--
-- Era `(fecha, juego, lado)`, y con una sola familia alcanzaba. Con tres, no:
--
--   · ganador → lado 'local' | 'visita'
--   · total   → lado 'mas'   | 'menos'
--   · linea   → lado 'local' | 'visita'   ← choca con ganador
--
-- "Los Yankees ganan" y "los Yankees ganan por dos o más" son **dos logros
-- distintos sobre el mismo equipo y el mismo partido**, y la tabla los trataba
-- como el mismo: la fila de run line chocaba con la de ganador y se perdía.
--
-- Peor todavía: ese choque caía dentro del `catch` que ignora los duplicados
-- —puesto para cuando dos corridas del cron coinciden— así que la ruta contestó
-- "guardados: 12" sin haber guardado ninguna. Un fallo que se declara a sí mismo
-- como éxito es de los peores que hay, y por eso el código ahora también informa
-- cuántas filas quedaron de verdad en vez de fiarse de cuántas mandó.

alter table senales_dia drop constraint if exists un_senal_por_dia;

alter table senales_dia
  add constraint un_senal_por_dia unique (fecha, juego, mercado, lado);
