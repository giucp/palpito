-- Liquidación propia: dejar registrado de dónde salió cada marcador.
--
-- Hasta ahora todos los resultados venían de The Odds API. Desde ahora salen de
-- fuentes gratuitas (statsapi.mlb.com para béisbol, la API pública de ESPN para
-- fútbol) y The Odds API queda solo como plan B. Guardar la fuente y el id del
-- partido en esa fuente sirve para auditar una liquidación dudosa: permite ir al
-- origen y ver con qué partido se emparejó el evento.

alter table eventos
  add column resultado_fuente text,
  add column resultado_externo_id text;

comment on column eventos.resultado_fuente is
  'Qué fuente cerró el evento: mlb | espn | odds_api';
comment on column eventos.resultado_externo_id is
  'Id del partido en esa fuente, para poder rastrear el emparejamiento';
