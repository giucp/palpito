-- Pálpito — Dados: dos cada uno, gana el que suma más
--
-- Se apoya entero en lo que ya existe para Carta más alta: la misma tabla
-- `desafios`, la misma semilla con su hash publicado antes de jugar, el mismo
-- vencimiento a la hora y el mismo pago. Lo único propio del juego son tres
-- cosas: que `dados` sea un tipo válido, cómo se decide quién ganó, y la mesa
-- (que es código, no base).
--
-- ## El desempate
--
-- Con dos dados contra dos dados se empata 1 de cada 9 partidas (11,3%), que es
-- demasiado seguido para terminar en "no ganó nadie". Así que se vuelve a tirar.
--
-- **Eso no se resuelve acá.** La semilla define de antemano una serie de rondas
-- y el servidor lee la primera en la que las sumas se separan; lo que llega a
-- esta función es ya la tirada que decidió. Por eso la comparación de abajo es
-- tan simple como la de la carta: suma contra suma.
--
-- La ventaja de decidirlo así es que la partida sigue siendo comprobable de
-- punta a punta: con la semilla se rehacen todas las rondas, incluidas las que
-- empataron, y se ve que nadie acomodó nada sobre la marcha.

-- ============ 1) `dados` es un tipo válido ============
-- La restricción se busca por su definición y no por su nombre, que lo puso
-- Postgres solo al crear la columna y no tiene por qué llamarse igual en todas
-- las bases.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.desafios'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%tipo%'
     and pg_get_constraintdef(oid) ilike '%deportivo%';
  if c is not null then
    execute format('alter table desafios drop constraint %I', c);
  end if;
end $$;

-- `despegue` sale de la lista: sus funciones se borraron el 2026-07-27 y dejarlo
-- permitiría crear un reto de un juego que no existe. Cuando llegue "Despegue a
-- dos" se vuelve a agregar, con su implementación al lado.
alter table desafios
  add constraint desafios_tipo_check check (tipo in ('deportivo', 'carta', 'dados'));

-- ============ 2) Crear un reto de dados ============
create or replace function public.crear_desafio_juego(
  p_creador uuid,
  p_rival uuid,
  p_tipo text,
  p_monto numeric,
  p_semilla text,
  p_hash text,
  p_minutos int default 60
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_saldo numeric;
  v_id uuid;
  v_alias text;
begin
  if p_tipo not in ('carta', 'dados') then
    return jsonb_build_object('ok', false, 'motivo', 'tipo_invalido');
  end if;
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;
  if p_creador = p_rival then
    return jsonb_build_object('ok', false, 'motivo', 'sos_vos');
  end if;
  if not son_amigos(p_creador, p_rival) then
    return jsonb_build_object('ok', false, 'motivo', 'no_son_amigos');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_creador;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = p_rival;

  insert into desafios (creador_id, rival_id, tipo, monto, semilla, hash, expira_at)
  values (p_creador, p_rival, p_tipo, p_monto, p_semilla, p_hash,
          now() + make_interval(mins => greatest(1, p_minutos)))
  returning id into v_id;

  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_creador, 'apuesta', -p_monto, v_id, 'Desafío a @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'desafio', v_id, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ 3) Quién ganó ============
create or replace function public.jugar_desafio(
  p_desafio uuid,
  p_usuario uuid,
  p_jugada jsonb
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_soy_creador boolean;
  v_c jsonb;
  v_r jsonb;
  v_gana text;      -- 'creador' | 'rival' | 'empate'
  v_pozo numeric;
  v_comision numeric;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if d.estado <> 'aceptado' then
    return jsonb_build_object('ok', false, 'motivo', 'no_jugable', 'estado', d.estado);
  end if;

  v_soy_creador := d.creador_id = p_usuario;
  if not v_soy_creador and d.rival_id <> p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  -- Jugar dos veces no cambia nada: gana la primera.
  if (v_soy_creador and d.jugada_creador is not null)
     or (not v_soy_creador and d.jugada_rival is not null) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_jugaste');
  end if;

  if v_soy_creador then
    update desafios set jugada_creador = p_jugada where id = d.id;
  else
    update desafios set jugada_rival = p_jugada where id = d.id;
  end if;

  select jugada_creador, jugada_rival into v_c, v_r from desafios where id = d.id;

  -- Falta el otro: se guarda y se espera. No se revela nada todavía.
  if v_c is null or v_r is null then
    return jsonb_build_object('ok', true, 'estado', 'esperando');
  end if;

  -- ---- Los dos jugaron: se decide ----
  if d.tipo = 'carta' then
    -- Gana la carta más alta. Empate si es la misma figura.
    v_gana := case
      when (v_c->>'valor')::int > (v_r->>'valor')::int then 'creador'
      when (v_c->>'valor')::int < (v_r->>'valor')::int then 'rival'
      else 'empate' end;
  elsif d.tipo = 'dados' then
    -- Gana quien suma más. Lo que llega ya es la tirada que decidió: los
    -- empates los resolvió el desempate antes de llegar acá, así que este
    -- 'empate' solo se daría en el caso imposible de que empataran las doce
    -- rondas. Se contempla igual, porque "casi nunca" no es "nunca".
    v_gana := case
      when (v_c->>'suma')::int > (v_r->>'suma')::int then 'creador'
      when (v_c->>'suma')::int < (v_r->>'suma')::int then 'rival'
      else 'empate' end;
  else
    -- Un tipo que esta función no sabe juzgar. Antes acá estaba Despegue; si
    -- mañana aparece otro juego y alguien olvida agregarle su rama, es mejor
    -- devolver la plata que repartirla mal.
    v_gana := 'empate';
  end if;

  v_pozo := d.monto * 2;
  v_comision := round(v_pozo * d.comision_bps / 10000.0, 2);

  if v_gana = 'empate' then
    update desafios set estado = 'empate', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', round(d.monto - v_comision / 2, 2), d.id, 'Desafío empatado');
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.rival_id, 'devolucion', round(d.monto - v_comision / 2, 2), d.id, 'Desafío empatado');
  elsif v_gana = 'creador' then
    update desafios set estado = 'ganado_creador', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'ganancia', v_pozo - v_comision, d.id, 'Desafío ganado');
  else
    update desafios set estado = 'ganado_rival', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.rival_id, 'ganancia', v_pozo - v_comision, d.id, 'Desafío ganado');
  end if;

  return jsonb_build_object('ok', true, 'estado', 'resuelto', 'gana', v_gana,
    'jugada_creador', v_c, 'jugada_rival', v_r, 'semilla', d.semilla);
end $$;

revoke execute on function public.crear_desafio_juego(uuid, uuid, text, numeric, text, text, int) from public, anon, authenticated;
revoke execute on function public.jugar_desafio(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crear_desafio_juego(uuid, uuid, text, numeric, text, text, int) to service_role;
grant execute on function public.jugar_desafio(uuid, uuid, jsonb) to service_role;
