-- Que quien crea el reto vea su carta al crearlo, sin abrir un agujero.
--
-- EL PEDIDO. Antes había que esperar a que el amigo aceptara para poder sacar
-- la carta. Se siente mal: creás el reto, mandás el enlace y no viste nada.
--
-- EL RIESGO. Si ves tu carta antes de mandar el enlace, podés no mandarlo
-- cuando te sale mala: a la hora vence, te devuelven las fichas y repetís hasta
-- que salga buena. Eso convierte un 50 y 50 en una ventaja grande.
--
-- CÓMO SE CIERRA:
--
--   1. **No se puede cancelar después de haber sacado la carta.** Sin esto,
--      mirar y cancelar sería inmediato y gratis. Ahora, si sacaste, la única
--      salida es esperar la hora entera.
--   2. **El reto le aparece al amigo en su Pálpito**, en "Tus desafíos", haya
--      recibido el enlace o no. Así que abandonar no lo esconde: el otro puede
--      aceptar igual y quien miró su carta mala queda expuesto.
--
-- Queda un resto: alguien podría retar a un amigo que no abre la app, mirar y
-- dejar vencer. Es lento, poco fiable y son fichas de prueba. Se acepta a
-- cambio de que el juego se sienta bien; si algún día molesta, la respuesta es
-- cobrar la comisión al crear y no al resolver.

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

  v_soy_creador := d.creador_id = p_usuario;
  if not v_soy_creador and d.rival_id <> p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  -- Quien crea puede sacar su carta apenas creó, sin esperar. El rival no:
  -- primero tiene que aceptar y poner sus fichas.
  if d.estado = 'pendiente' then
    if not v_soy_creador then
      return jsonb_build_object('ok', false, 'motivo', 'no_jugable', 'estado', d.estado);
    end if;
    if d.expira_at is not null and now() > d.expira_at then
      return jsonb_build_object('ok', false, 'motivo', 'vencido');
    end if;
  elsif d.estado <> 'aceptado' then
    return jsonb_build_object('ok', false, 'motivo', 'no_jugable', 'estado', d.estado);
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

-- Cancelar deja de estar disponible una vez que se sacó la carta.
create or replace function public.cancelar_desafio(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare d record;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p_usuario <> d.rival_id and p_usuario <> d.creador_id then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;

  -- Si ya viste tu carta no podés echarte atrás: si no, mirarías la carta y
  -- cancelarías las malas.
  if d.jugada_creador is not null then
    return jsonb_build_object('ok', false, 'motivo', 'ya_jugaste');
  end if;

  update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío cancelado: devolución');

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.jugar_desafio(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.cancelar_desafio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.jugar_desafio(uuid, uuid, jsonb) to service_role;
grant execute on function public.cancelar_desafio(uuid, uuid) to service_role;
