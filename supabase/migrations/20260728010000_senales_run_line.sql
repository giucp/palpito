-- Pálpito — La tercera familia: ganar por dos o más (run line)
--
-- `mercado` aceptaba 'ganador' y 'total'. Se suma 'linea'.
--
-- Para esta familia, `lado` vuelve a ser 'local' o 'visita' —es un equipo el que
-- cubre— y `linea` guarda 1.5, que es la única que publica el mercado en béisbol.

alter table senales_dia drop constraint if exists senales_mercado_check;

alter table senales_dia
  add constraint senales_mercado_check check (mercado in ('ganador', 'total', 'linea'));

comment on column senales_dia.mercado is
  'ganador (quién gana) · total (más/menos carreras) · linea (gana por 2 o más)';
