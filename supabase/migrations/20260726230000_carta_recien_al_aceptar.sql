-- Volver atrás: la carta no se ve hasta que el amigo acepta.
--
-- POR QUÉ SE HABÍA CAMBIADO. Crear el reto, mandarlo y no ver nada se sentía
-- mal, y el dueño pidió ver la carta al crear.
--
-- POR QUÉ SE VUELVE. Es una puerta a hacer trampa, y el propio dueño la vio:
-- si ves tu carta antes de mandar el enlace, no mandás las malas. A la hora
-- vence, te devuelven las fichas, y repetís hasta que salga buena. Eso convierte
-- un 50 y 50 en una ventaja grande para quien crea el reto.
--
-- La razón original del pedido ya no existe: antes no había dónde volver a
-- sacar la carta, y ahora los retos aparecen arriba de Juegos diciendo "Sacá tu
-- carta". El flujo queda: creás y mandás → tu amigo acepta → los dos sacan.

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
  v_gana text;
  v_pozo numeric;
  v_comision numeric;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  -- Hasta que el rival no acepta y pone sus fichas, nadie ve nada. Ni siquiera
  -- quien creó el reto: esa es toda la protección.
  if d.estado <> 'aceptado' then
    return jsonb_build_object('ok', false, 'motivo', 'no_jugable', 'estado', d.estado);
  end if;

  v_soy_creador := d.creador_id = p_usuario;
  if not v_soy_creador and d.rival_id <> p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

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

  if d.tipo = 'carta' then
    v_gana := case
      when (v_c->>'valor')::int > (v_r->>'valor')::int then 'creador'
      when (v_c->>'valor')::int < (v_r->>'valor')::int then 'rival'
      else 'empate' end;
  else
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

revoke execute on function public.jugar_desafio(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.jugar_desafio(uuid, uuid, jsonb) to service_role;
