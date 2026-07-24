-- Pálpito — apostar y liquidar (funciones atómicas en la base)
-- Solo ejecutables con la clave de servicio: el dinero jamás se mueve desde el navegador.

-- Marcadores finales para poder liquidar totales y hándicaps
alter table eventos add column marcador_a int, add column marcador_b int;

-- Metadatos de liquidación de cada selección:
--   lado:  'local' | 'visitante' | 'empate' | 'mas' | 'menos'
--   punto: línea del mercado (8.5 en totales, -1.5 en hándicap; null en 1x2/ganador)
alter table selecciones add column lado text, add column punto numeric;

-- ============ APOSTAR ============
-- Flujo de la guía §6: idempotencia → saldo → verificación de cuotas →
-- inserción con cuotas congeladas → movimiento negativo. Todo en una transacción.

create or replace function public.apostar(
  p_usuario uuid,
  p_tipo text,
  p_monto numeric,
  p_idempotency text,
  p_selecciones jsonb
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_saldo numeric;
  v_total numeric;
  v_n int;
  v_cambios jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id uuid;
  v_cuota numeric;
  v_activa boolean;
  v_estado text;
  v_comienza timestamptz;
  v_cuota_total numeric;
  v_apuesta uuid;
  v_ids jsonb := '[]'::jsonb;
  i int := 0;
begin
  if p_tipo not in ('simple','combinada') then
    return jsonb_build_object('ok', false, 'motivo', 'tipo_invalido');
  end if;
  v_n := coalesce(jsonb_array_length(p_selecciones), 0);
  if v_n < 1 or v_n > 20 then
    return jsonb_build_object('ok', false, 'motivo', 'selecciones_invalidas');
  end if;
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;
  if p_idempotency is null or length(p_idempotency) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'idempotency_invalida');
  end if;

  -- ¿Doble toque? Devolver sin duplicar.
  if exists (
    select 1 from apuestas
    where idempotency_key = p_idempotency
       or idempotency_key like p_idempotency || '-%'
  ) then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;

  -- Saldo suficiente (simples: monto por cada selección)
  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  v_total := case when p_tipo = 'simple' then p_monto * v_n else p_monto end;
  if v_saldo < v_total then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  -- Verificar cada selección: viva, pre-partido y con la cuota que vio el usuario.
  for v_item in select * from jsonb_array_elements(p_selecciones) loop
    select s.id, s.cuota, s.activa, e.estado, e.comienza_at
      into v_id, v_cuota, v_activa, v_estado, v_comienza
      from selecciones s
      join mercados m on m.id = s.mercado_id
      join eventos e on e.id = m.evento_id
     where s.id = (v_item->>'seleccion_id')::uuid
     for update of s;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'seleccion_inexistente');
    end if;
    if v_estado <> 'programado' or v_comienza <= now() or v_activa is not true then
      return jsonb_build_object('ok', false, 'motivo', 'evento_cerrado', 'seleccion_id', v_id);
    end if;
    if abs(v_cuota - (v_item->>'cuota_vista')::numeric) > 0.001 then
      v_cambios := v_cambios || jsonb_build_object('seleccion_id', v_id, 'cuota_actual', v_cuota);
    end if;
  end loop;
  if jsonb_array_length(v_cambios) > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'cuotas', 'cambios', v_cambios);
  end if;

  if p_tipo = 'combinada' then
    v_cuota_total := 1;
    insert into apuestas (usuario_id, tipo, monto, cuota_total, ganancia_posible, idempotency_key)
    values (p_usuario, 'combinada', p_monto, 1, 0, p_idempotency)
    returning id into v_apuesta;
    for v_item in select * from jsonb_array_elements(p_selecciones) loop
      select cuota into v_cuota from selecciones where id = (v_item->>'seleccion_id')::uuid;
      v_cuota_total := v_cuota_total * v_cuota;
      insert into apuesta_lineas (apuesta_id, seleccion_id, cuota)
      values (v_apuesta, (v_item->>'seleccion_id')::uuid, v_cuota);
    end loop;
    update apuestas
       set cuota_total = round(v_cuota_total, 2),
           ganancia_posible = round(p_monto * v_cuota_total, 2)
     where id = v_apuesta;
    insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
    values (p_usuario, 'apuesta', -p_monto, v_apuesta, 'Apuesta combinada');
    v_ids := v_ids || to_jsonb(v_apuesta);
  else
    for v_item in select * from jsonb_array_elements(p_selecciones) loop
      i := i + 1;
      select cuota into v_cuota from selecciones where id = (v_item->>'seleccion_id')::uuid;
      insert into apuestas (usuario_id, tipo, monto, cuota_total, ganancia_posible, idempotency_key)
      values (p_usuario, 'simple', p_monto, v_cuota, round(p_monto * v_cuota, 2),
              p_idempotency || '-' || i)
      returning id into v_apuesta;
      insert into apuesta_lineas (apuesta_id, seleccion_id, cuota)
      values (v_apuesta, (v_item->>'seleccion_id')::uuid, v_cuota);
      insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
      values (p_usuario, 'apuesta', -p_monto, v_apuesta, 'Apuesta simple');
      v_ids := v_ids || to_jsonb(v_apuesta);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'apuestas', v_ids, 'saldo_nuevo', v_saldo - v_total);
end $$;

-- ============ LIQUIDAR EVENTO ============
-- Flujo de la guía §6: líneas → ganada/perdida/anulada; apuesta ganada solo si
-- todas sus líneas ganaron (anuladas cuentan como cuota 1). Paga vía movimientos.

create or replace function public.liquidar_evento(p_evento uuid) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  e record;
  r record;
  v_cerradas int := 0;
  v_pagadas int := 0;
  v_pago numeric;
begin
  select * into e from eventos where id = p_evento;
  if not found or e.estado <> 'finalizado' or e.marcador_a is null or e.marcador_b is null then
    return jsonb_build_object('ok', false, 'motivo', 'evento_no_liquidable');
  end if;

  -- 1) Resolver las líneas de este evento
  update apuesta_lineas al
     set estado = case
       when s.lado = 'empate' then
         case when e.marcador_a = e.marcador_b then 'ganada' else 'perdida' end
       when s.lado = 'local' and s.punto is null then
         case when e.marcador_a > e.marcador_b then 'ganada' else 'perdida' end
       when s.lado = 'visitante' and s.punto is null then
         case when e.marcador_b > e.marcador_a then 'ganada' else 'perdida' end
       when s.lado = 'local' then
         case when e.marcador_a + s.punto > e.marcador_b then 'ganada'
              when e.marcador_a + s.punto = e.marcador_b then 'anulada'
              else 'perdida' end
       when s.lado = 'visitante' then
         case when e.marcador_b + s.punto > e.marcador_a then 'ganada'
              when e.marcador_b + s.punto = e.marcador_a then 'anulada'
              else 'perdida' end
       when s.lado = 'mas' then
         case when e.marcador_a + e.marcador_b > s.punto then 'ganada'
              when e.marcador_a + e.marcador_b = s.punto then 'anulada'
              else 'perdida' end
       when s.lado = 'menos' then
         case when e.marcador_a + e.marcador_b < s.punto then 'ganada'
              when e.marcador_a + e.marcador_b = s.punto then 'anulada'
              else 'perdida' end
       else 'anulada' -- sin metadatos de liquidación: anular (se devuelve)
     end
    from selecciones s
    join mercados m on m.id = s.mercado_id
   where al.seleccion_id = s.id
     and m.evento_id = p_evento
     and al.estado = 'abierta';

  -- 2) Cerrar las apuestas que quedaron sin líneas abiertas
  for r in
    select a.id, a.usuario_id, a.monto,
           bool_or(al.estado = 'perdida') as alguna_perdida,
           bool_and(al.estado = 'anulada') as todas_anuladas,
           exp(sum(ln(case when al.estado = 'ganada' then al.cuota else 1 end)))::numeric as cuota_efectiva
      from apuestas a
      join apuesta_lineas al on al.apuesta_id = a.id
     where a.estado = 'abierta'
       and not exists (select 1 from apuesta_lineas x
                        where x.apuesta_id = a.id and x.estado = 'abierta')
       and exists (select 1 from apuesta_lineas x
                     join selecciones s2 on s2.id = x.seleccion_id
                     join mercados m2 on m2.id = s2.mercado_id
                    where x.apuesta_id = a.id and m2.evento_id = p_evento)
     group by a.id, a.usuario_id, a.monto
  loop
    v_cerradas := v_cerradas + 1;
    if r.alguna_perdida then
      update apuestas set estado = 'perdida', liquidada_at = now() where id = r.id;
    elsif r.todas_anuladas then
      update apuestas set estado = 'anulada', liquidada_at = now() where id = r.id;
      insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
      values (r.usuario_id, 'devolucion', r.monto, r.id, 'Apuesta anulada: devolución');
    else
      v_pago := round(r.monto * r.cuota_efectiva, 2);
      update apuestas set estado = 'ganada', liquidada_at = now() where id = r.id;
      insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
      values (r.usuario_id, 'ganancia', v_pago, r.id, 'Apuesta ganada');
      v_pagadas := v_pagadas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'apuestas_cerradas', v_cerradas, 'pagadas', v_pagadas);
end $$;

-- Solo el servidor (clave de servicio) puede ejecutarlas
revoke execute on function public.apostar(uuid, text, numeric, text, jsonb) from public, anon, authenticated;
revoke execute on function public.liquidar_evento(uuid) from public, anon, authenticated;
grant execute on function public.apostar(uuid, text, numeric, text, jsonb) to service_role;
grant execute on function public.liquidar_evento(uuid) to service_role;
