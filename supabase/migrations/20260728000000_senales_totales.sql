-- Pálpito — El motor de señales también mira los totales
--
-- Hasta ahora `senales_dia` solo guardaba candidatos de ganador: `lado` era
-- 'local' o 'visita'. Los totales son otra pregunta —más o menos carreras que la
-- línea de la casa— y necesitan dos cosas más: saber de qué mercado es cada
-- fila, y cuál era la línea.
--
-- **La línea se guarda con la fila y no se busca después**, y eso importa: las
-- casas la mueven durante el día. Un "más de 8.5" juzgado mañana contra una
-- línea de 9 no es la apuesta que se hizo.

alter table senales_dia
  add column if not exists mercado text not null default 'ganador',
  add column if not exists linea numeric(4,1);

-- 'ganador' → lado es 'local' o 'visita'
-- 'total'   → lado es 'mas' o 'menos', y `linea` dice de cuánto
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.senales_dia'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%lado%'
     and pg_get_constraintdef(oid) ilike '%visita%';
  if c is not null then
    execute format('alter table senales_dia drop constraint %I', c);
  end if;
end $$;

alter table senales_dia
  add constraint senales_lado_check
    check (lado in ('local', 'visita', 'mas', 'menos'));

alter table senales_dia
  add constraint senales_mercado_check check (mercado in ('ganador', 'total'));

-- Un total y un ganador del mismo partido no chocan porque el `lado` los separa,
-- así que la clave única de antes sigue sirviendo tal cual.

comment on column senales_dia.mercado is 'ganador (quién gana) o total (más/menos carreras)';
comment on column senales_dia.linea is 'La línea del mercado en el momento de guardar. Se mueve durante el día.';

create index if not exists idx_senales_mercado on senales_dia (mercado, fecha desc);
