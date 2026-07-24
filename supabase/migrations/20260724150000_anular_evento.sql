-- Anular un evento que no se pudo resolver (la fuente dejó de reportarlo).
-- Devuelve lo apostado: si no podemos determinar el resultado, el usuario no pierde.
-- Sin esto, esas apuestas quedarían "en juego" para siempre y el cierre de
-- resultados seguiría consultando la API por ellas, gastando créditos sin fin.

create or replace function public.anular_evento(p_evento uuid) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_anuladas int := 0;
begin
  update eventos set estado = 'suspendido' where id = p_evento and estado <> 'finalizado';

  update apuesta_lineas al
     set estado = 'anulada'
    from selecciones s
    join mercados m on m.id = s.mercado_id
   where al.seleccion_id = s.id
     and m.evento_id = p_evento
     and al.estado = 'abierta';

  -- Cerrar las apuestas que ya no tienen líneas abiertas
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
    v_anuladas := v_anuladas + 1;
    if r.alguna_perdida then
      update apuestas set estado = 'perdida', liquidada_at = now() where id = r.id;
    elsif r.todas_anuladas then
      update apuestas set estado = 'anulada', liquidada_at = now() where id = r.id;
      insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
      values (r.usuario_id, 'devolucion', r.monto, r.id, 'Evento sin resultado: devolución');
    else
      update apuestas set estado = 'ganada', liquidada_at = now() where id = r.id;
      insert into movimientos (usuario_id, tipo, monto, apuesta_id, nota)
      values (r.usuario_id, 'ganancia', round(r.monto * r.cuota_efectiva, 2), r.id,
              'Apuesta ganada (con líneas anuladas)');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'apuestas_cerradas', v_anuladas);
end $$;

revoke execute on function public.anular_evento(uuid) from public, anon, authenticated;
grant execute on function public.anular_evento(uuid) to service_role;
