-- Pálpito — panel de administración.
--
-- Seguridad: quién es administrador vive en una tabla propia, no en un campo
-- que el usuario pueda tocar. Las funciones son security definer y solo las
-- puede ejecutar la clave de servicio (o sea, solo el servidor), y además
-- cada una comprueba por su cuenta que quien pregunta sea administrador.

create table administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nota text,
  creado_at timestamptz default now()
);

alter table administradores enable row level security;
-- Nadie lee esta tabla desde el navegador; solo el servidor.

create or replace function public.es_admin(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from administradores where usuario_id = p_usuario) $$;

-- ============ RESUMEN DE LA CASA ============
-- Distingue tres cosas que suelen confundirse:
--   · fichas repartidas  = lo que la casa inyectó (regalos y ajustes)
--   · fichas en circulación = lo que hoy tienen los usuarios en el bolsillo
--   · margen de la casa  = apostado menos pagado (la ganancia real del negocio)
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
    'usuarios', (select count(*) from auth.users),
    'usuarios_con_saldo', (select count(*) from saldos where saldo > 0),
    'repartidas', coalesce((select sum(monto) from movimientos where tipo in ('regalo','ajuste') and monto > 0), 0),
    'retiradas_admin', coalesce((select -sum(monto) from movimientos where tipo = 'ajuste' and monto < 0), 0),
    'circulacion', coalesce((select sum(monto) from movimientos), 0),
    'apostado_deportes', coalesce((select -sum(monto) from movimientos where tipo = 'apuesta'), 0),
    'pagado_deportes', coalesce((select sum(monto) from movimientos where tipo in ('ganancia','devolucion')), 0),
    'apostado_juegos', coalesce((select -sum(monto) from movimientos where tipo = 'juego'), 0),
    'pagado_juegos', coalesce((select sum(monto) from movimientos where tipo = 'premio'), 0),
    'apuestas_abiertas', (select count(*) from apuestas where estado = 'abierta'),
    'apuestas_total', (select count(*) from apuestas),
    'apuestas_ganadas', (select count(*) from apuestas where estado = 'ganada'),
    'apuestas_perdidas', (select count(*) from apuestas where estado = 'perdida'),
    'rondas_juegos', (select (select count(*) from rondas_despegue) + (select count(*) from partidas_muelle)),
    'eventos_abiertos', (select count(*) from eventos where estado = 'programado'),
    'eventos_finalizados', (select count(*) from eventos where estado = 'finalizado')
  ) into r;
  return r;
end $$;

-- ============ LISTA DE USUARIOS ============
-- Una fila por usuario con todo lo que hace falta para entender su actividad.
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
      'creado', u.created_at,
      'ultimo_acceso', u.last_sign_in_at,
      'admin', es_admin(u.id),
      'saldo', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id), 0),
      'recibido', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('regalo','ajuste') and m.monto > 0), 0),
      'apostado', coalesce((select -sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('apuesta','juego')), 0),
      'cobrado', coalesce((select sum(m.monto) from movimientos m where m.usuario_id = u.id and m.tipo in ('ganancia','premio','devolucion')), 0),
      'apuestas', (select count(*) from apuestas a where a.usuario_id = u.id),
      'ganadas', (select count(*) from apuestas a where a.usuario_id = u.id and a.estado = 'ganada'),
      'perdidas', (select count(*) from apuestas a where a.usuario_id = u.id and a.estado = 'perdida'),
      'abiertas', (select count(*) from apuestas a where a.usuario_id = u.id and a.estado = 'abierta'),
      'jugadas', (select (select count(*) from rondas_despegue d where d.usuario_id = u.id)
                       + (select count(*) from partidas_muelle p where p.usuario_id = u.id))
    ) as f
    from auth.users u
    where p_busqueda is null
       or p_busqueda = ''
       or u.email ilike '%' || p_busqueda || '%'
    limit greatest(1, least(p_limite, 500))
  ) s;

  return r;
end $$;

-- ============ MOVIMIENTOS DE UN USUARIO ============
create or replace function public.admin_movimientos(
  p_solicitante uuid,
  p_usuario uuid,
  p_limite int default 50
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not es_admin(p_solicitante) then
    return jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  end if;

  select jsonb_build_object('ok', true, 'movimientos', coalesce(jsonb_agg(f order by f->>'id' desc), '[]'::jsonb))
    into r
  from (
    select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'monto', m.monto,
                              'nota', m.nota, 'fecha', m.created_at) as f
    from movimientos m
    where m.usuario_id = p_usuario
    order by m.id desc
    limit greatest(1, least(p_limite, 300))
  ) s;

  return r;
end $$;

-- ============ ACREDITAR / RETIRAR FICHAS ============
-- Queda registrado en el mismo libro que todo lo demás, con quién lo hizo.
create or replace function public.admin_acreditar(
  p_solicitante uuid,
  p_usuario uuid,
  p_monto numeric,
  p_nota text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_correo text; v_saldo numeric;
begin
  if not es_admin(p_solicitante) then
    return jsonb_build_object('ok', false, 'motivo', 'no_autorizado');
  end if;
  if p_monto is null or p_monto = 0 or abs(p_monto) > 1000000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;
  if not exists (select 1 from auth.users where id = p_usuario) then
    return jsonb_build_object('ok', false, 'motivo', 'usuario_inexistente');
  end if;

  -- No dejar el saldo en negativo al retirar fichas
  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if p_monto < 0 and v_saldo + p_monto < 0 then
    return jsonb_build_object('ok', false, 'motivo', 'saldo_insuficiente', 'saldo', v_saldo);
  end if;

  select email into v_correo from auth.users where id = p_solicitante;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'ajuste', p_monto,
          coalesce(nullif(p_nota, ''), 'Ajuste de administración') || ' · por ' || coalesce(v_correo, 'admin'));

  return jsonb_build_object('ok', true, 'saldo_nuevo', v_saldo + p_monto);
end $$;

revoke execute on function public.es_admin(uuid) from public, anon, authenticated;
revoke execute on function public.admin_resumen(uuid) from public, anon, authenticated;
revoke execute on function public.admin_usuarios(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.admin_movimientos(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.admin_acreditar(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.es_admin(uuid) to service_role;
grant execute on function public.admin_resumen(uuid) to service_role;
grant execute on function public.admin_usuarios(uuid, text, int) to service_role;
grant execute on function public.admin_movimientos(uuid, uuid, int) to service_role;
grant execute on function public.admin_acreditar(uuid, uuid, numeric, text) to service_role;

-- Alta del primer administrador (cambia el correo si hace falta)
insert into administradores (usuario_id, nota)
select id, 'Administrador inicial' from auth.users
where email = 'loveandpainsports@gmail.com'
on conflict (usuario_id) do nothing;
