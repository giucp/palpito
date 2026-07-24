-- Identificador del evento en la fuente externa (The Odds API), para poder
-- actualizar cuotas y cerrar resultados sin duplicar eventos.
alter table eventos add column externo_id text unique;
