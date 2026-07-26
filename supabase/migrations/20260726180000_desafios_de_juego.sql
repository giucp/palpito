-- Desafíos de juego: carta más alta y despegue a dos.
--
-- Pálpito deja de tener juegos contra la casa. La misma mesa de `desafios` que
-- ya se usa para los partidos sirve para esto: crear, retener a los dos,
-- aceptar, liquidar y cobrar la comisión ya están resueltos. Lo único que falta
-- es qué se juega y qué jugó cada uno.
--
-- Diferencia de fondo con un juego de casino: acá **no hay ventaja de la casa**.
-- Los dos jugadores tienen exactamente la misma probabilidad y lo que Pálpito
-- cobra es la comisión del pozo, a la vista. Cada uno recupera el 99,5% de lo
-- que pone, contra el 97% de un juego contra la casa.

alter table desafios
  add column tipo text not null default 'deportivo'
    check (tipo in ('deportivo', 'carta', 'despegue')),
  -- Verificable: la semilla se decide al crear y su hash se publica antes de
  -- que nadie juegue. Al terminar se revela y cualquiera puede comprobar que
  -- nada se acomodó sobre la marcha.
  add column semilla text,
  add column hash text,
  -- El enlace vive una hora. Sin partido que marque el final, hace falta un
  -- plazo o la plata quedaría retenida para siempre.
  add column expira_at timestamptz,
  -- Qué jugó cada uno. En carta: {"carta": 37}. En despegue:
  -- {"multiplicador": 2.35} si retiró, o {"estrellado": true} si no llegó.
  add column jugada_creador jsonb,
  add column jugada_rival jsonb;

-- En un desafío de juego no hay partido ni lados.
alter table desafios alter column evento_id drop not null;
alter table desafios alter column lado_creador drop not null;

comment on column desafios.tipo is 'deportivo | carta | despegue';
comment on column desafios.jugada_creador is 'Lo que jugó quien creó el desafío; null si todavía no jugó';

create index idx_desafios_expira on desafios (expira_at) where estado = 'pendiente';

-- ============ CREAR UN DESAFÍO DE JUEGO ============
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
  if p_tipo not in ('carta', 'despegue') then
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

-- ============ ACEPTAR ============
-- El de partidos comprueba que el evento no haya empezado; acá lo que manda es
-- el plazo de una hora.
create or replace function public.aceptar_desafio_juego(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_saldo numeric;
  v_alias text;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if d.tipo = 'deportivo' then
    return jsonb_build_object('ok', false, 'motivo', 'tipo_invalido');
  end if;
  if d.rival_id <> p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;
  if d.expira_at is not null and now() > d.expira_at then
    return jsonb_build_object('ok', false, 'motivo', 'vencido');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if v_saldo < d.monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = d.creador_id;

  update desafios set estado = 'aceptado', aceptado_at = now() where id = d.id;
  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_usuario, 'apuesta', -d.monto, d.id, 'Desafío de @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'saldo_nuevo', v_saldo - d.monto);
end $$;

-- ============ JUGAR ============
-- Guarda la jugada de quien llama. Si ya jugaron los dos, liquida en el acto.
--
-- `p_jugada` lo arma el servidor a partir de la semilla, nunca el navegador: el
-- jugador solo dice "ya", y qué le tocó estaba decidido desde el principio.
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
  else
    -- Despegue: gana quien retiró más alto. Estrellarse es no haber retirado.
    v_gana := case
      when coalesce((v_c->>'multiplicador')::numeric, 0)
         > coalesce((v_r->>'multiplicador')::numeric, 0) then 'creador'
      when coalesce((v_c->>'multiplicador')::numeric, 0)
         < coalesce((v_r->>'multiplicador')::numeric, 0) then 'rival'
      else 'empate' end;
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

-- ============ VENCER LOS QUE NADIE ACEPTÓ ============
-- Una hora y se devuelve entero, sin comisión: no se jugó nada.
create or replace function public.vencer_desafios_de_juego()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_n int := 0;
begin
  for d in
    select * from desafios
     where tipo <> 'deportivo' and estado = 'pendiente'
       and expira_at is not null and now() > expira_at
  loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío vencido: devolución');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'vencidos', v_n);
end $$;

revoke execute on function public.crear_desafio_juego(uuid, uuid, text, numeric, text, text, int) from public, anon, authenticated;
revoke execute on function public.aceptar_desafio_juego(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.jugar_desafio(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.vencer_desafios_de_juego() from public, anon, authenticated;
grant execute on function public.crear_desafio_juego(uuid, uuid, text, numeric, text, text, int) to service_role;
grant execute on function public.aceptar_desafio_juego(uuid, uuid) to service_role;
grant execute on function public.jugar_desafio(uuid, uuid, jsonb) to service_role;
grant execute on function public.vencer_desafios_de_juego() to service_role;
