-- Pálpito — El panel mide lo que Pálpito es hoy
--
-- El resumen venía del producto viejo: la cifra grande era "margen de la casa"
-- —apostado menos pagado— y los indicadores contaban parleys de la tabla
-- `apuestas`, que lleva meses sin recibir una fila.
--
-- **Hoy la casa no juega.** Dos amigos ponen lo mismo, el ganador se lleva el
-- pozo y Pálpito cobra el 0,5%. Así que "margen" es un concepto que ya no aplica:
-- el número que manda es **la comisión cobrada**, y su porcentaje sobre lo que
-- se movió. Si el margen fuera distinto del 0,5% habría un error en alguna
-- función de liquidación, así que ese porcentaje también sirve de control.
--
-- Lo que se mide ahora, y por qué:
--
--   · comision / volumen   → el negocio, y su comprobación
--   · retos por tipo       → qué se juega de verdad: deportivo, carta, dados
--   · retos sin resolver   → fichas retenidas ahora mismo, que es lo que hay que
--                            vigilar: los dos vencimientos existen justamente
--                            porque esto se quedaba trabado
--   · amistades            → el juego es entre amigos; sin amigos no hay producto
--   · combos               → cuántos se resolvieron y cuántos pegaron

create or replace function public.admin_resumen(p_solicitante uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not es_admin(p_solicitante) then
    return jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  end if;

  select jsonb_build_object(
    'ok', true,

    -- ---- La gente ----
    'usuarios', (select count(*) from auth.users),
    'usuarios_con_saldo', (select count(*) from saldos where saldo > 0),
    'usuarios_jugando', (select count(distinct u) from (
        select creador_id as u from desafios union select rival_id from desafios) s where u is not null),
    'amistades', (select count(*) from amistades where estado = 'aceptada'),

    -- ---- Las fichas ----
    'repartidas', coalesce((select sum(monto) from movimientos where tipo in ('regalo','ajuste') and monto > 0), 0),
    'circulacion', coalesce((select sum(monto) from movimientos), 0),

    -- ---- El negocio: la comisión ----
    -- Solo de lo que se resolvió. Un reto pendiente todavía no cobró nada.
    'comision', coalesce((select sum(monto * 2 * comision_bps / 10000.0)
                            from desafios
                           where estado in ('ganado_creador','ganado_rival','empate')), 0),
    'volumen', coalesce((select sum(monto * 2)
                           from desafios
                          where estado in ('ganado_creador','ganado_rival','empate')), 0),

    -- ---- Qué se juega ----
    'retos_total', (select count(*) from desafios),
    'retos_deportivos', (select count(*) from desafios where tipo = 'deportivo'),
    'retos_carta', (select count(*) from desafios where tipo = 'carta'),
    'retos_dados', (select count(*) from desafios where tipo = 'dados'),
    'retos_jugados', (select count(*) from desafios where estado in ('ganado_creador','ganado_rival','empate')),
    'retos_cancelados', (select count(*) from desafios where estado = 'cancelado'),

    -- ---- Lo que hay que vigilar ----
    -- Fichas retenidas ahora mismo. En un reto aceptado están las de los dos.
    'retenido', coalesce((select sum(case when estado = 'aceptado' then monto * 2 else monto end)
                            from desafios where estado in ('pendiente','aceptado')), 0),
    'esperando_respuesta', (select count(*) from desafios where estado = 'pendiente'),
    'esperando_jugada', (select count(*) from desafios where estado = 'aceptado' and tipo <> 'deportivo'),

    -- ---- La cartelera y los combos ----
    'eventos_abiertos', (select count(*) from eventos where estado = 'programado'),
    'eventos_finalizados', (select count(*) from eventos where estado = 'finalizado'),
    'combos_resueltos', (select count(*) from combos_dia where acerto is not null),
    'combos_acertados', (select count(*) from combos_dia where acerto = true)
  ) into r;
  return r;
end $$;

-- ============ LISTA DE USUARIOS ============
-- Contaba parleys de `apuestas`. Ahora cuenta retos, que es lo que se juega.
create or replace function public.admin_usuarios(
  p_solicitante uuid,
  p_busqueda text default null,
  p_limite int default 100
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not es_admin(p_solicitante) then
    return jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  end if;

  select jsonb_build_object('ok', true, 'usuarios', coalesce(jsonb_agg(f order by f->>'creado' desc), '[]'::jsonb))
    into r
  from (
    select jsonb_build_object(
      'id', u.id,
      'correo', u.email,
      'alias', (select alias from perfiles p where p.usuario_id = u.id),
      'creado', u.created_at,
      'ultimo_acceso', u.last_sign_in_at,
      'admin', es_admin(u.id),
      'saldo', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id), 0),
      'recibido', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('regalo','ajuste') and m.monto > 0), 0),
      'apostado', coalesce((select -sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('apuesta','juego')), 0),
      'cobrado', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('ganancia','premio','devolucion')), 0),
      'amigos', (select count(*) from amistades a where a.estado = 'aceptada'
                   and (a.solicitante_id = u.id or a.destinatario_id = u.id)),
      -- Retos: los deportivos y los de juego se cuentan aparte porque son dos
      -- productos distintos, y saber cuál usa cada quien es la mitad de la
      -- información.
      'retos', (select count(*) from desafios d where d.creador_id = u.id or d.rival_id = u.id),
      'retos_juego', (select count(*) from desafios d where d.tipo <> 'deportivo'
                        and (d.creador_id = u.id or d.rival_id = u.id)),
      'ganados', (select count(*) from desafios d
                   where (d.creador_id = u.id and d.estado = 'ganado_creador')
                      or (d.rival_id = u.id and d.estado = 'ganado_rival')),
      'perdidos', (select count(*) from desafios d
                    where (d.creador_id = u.id and d.estado = 'ganado_rival')
                       or (d.rival_id = u.id and d.estado = 'ganado_creador'))
    ) as f
    from auth.users u
    where p_busqueda is null
       or p_busqueda = ''
       or u.email ilike '%' || p_busqueda || '%'
    limit greatest(1, least(p_limite, 500))
  ) s;

  return r;
end $$;
