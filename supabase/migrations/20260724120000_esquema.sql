-- PÃ¡lpito â€” Fase 1: esquema base
-- Fuente: palpito_guia.md Â§6 (Modelo de datos)

-- ============ CatÃ¡logo ============

create table eventos (
  id uuid primary key default gen_random_uuid(),
  deporte text not null,
  liga text not null,
  equipo_a text not null,
  equipo_b text not null,
  comienza_at timestamptz not null,
  estado text not null default 'programado'
    check (estado in ('programado','en_juego','finalizado','suspendido')),
  resultado text,                      -- 'a' | 'x' | 'b' al finalizar
  created_at timestamptz default now()
);

create table mercados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  tipo text not null,                  -- '1x2', 'total_goles', 'handicap'...
  nombre text not null,                -- 'Resultado final'
  orden int default 0
);

create table selecciones (
  id uuid primary key default gen_random_uuid(),
  mercado_id uuid not null references mercados(id) on delete cascade,
  nombre text not null,                -- 'Local', 'Empate', 'MÃ¡s de 2.5'
  cuota numeric(6,2) not null,
  orden int default 0,                 -- orden de presentacion (1/X/2, Mas/Menos)
  activa boolean default true
);

create index idx_mercados_evento on mercados(evento_id);
create index idx_selecciones_mercado on selecciones(mercado_id);
create index idx_eventos_estado on eventos(estado, comienza_at);

-- ============ Apuestas ============

create table apuestas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('simple','combinada')),
  monto numeric(12,2) not null check (monto > 0),
  cuota_total numeric(10,2) not null,  -- congelada al apostar
  ganancia_posible numeric(12,2) not null,
  estado text not null default 'abierta'
    check (estado in ('abierta','ganada','perdida','anulada')),
  idempotency_key text unique,         -- evita apuestas duplicadas
  created_at timestamptz default now(),
  liquidada_at timestamptz
);

create table apuesta_lineas (
  id uuid primary key default gen_random_uuid(),
  apuesta_id uuid not null references apuestas(id) on delete cascade,
  seleccion_id uuid not null references selecciones(id),
  cuota numeric(6,2) not null,         -- copia congelada
  estado text default 'abierta'
    check (estado in ('abierta','ganada','perdida','anulada'))
);

create index idx_apuestas_usuario on apuestas(usuario_id, created_at desc);
create index idx_lineas_apuesta on apuesta_lineas(apuesta_id);
create index idx_lineas_seleccion on apuesta_lineas(seleccion_id);

-- ============ Monedero ============
-- Libro de movimientos: el saldo es la suma, no una columna editable.

create table movimientos (
  id bigserial primary key,
  usuario_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('regalo','apuesta','ganancia','devolucion','ajuste')),
  monto numeric(12,2) not null,        -- negativo al apostar, positivo al ganar
  apuesta_id uuid references apuestas(id),
  nota text,
  created_at timestamptz default now()
);

create index idx_mov_usuario on movimientos(usuario_id);

-- Saldo actual. security_invoker: la vista respeta el RLS de movimientos,
-- asÃ­ cada usuario solo puede ver su propio saldo.
create view saldos with (security_invoker = on) as
select usuario_id, coalesce(sum(monto),0) as saldo
from movimientos group by usuario_id;

-- ============ Regalo de bienvenida ============
-- Al crearse un usuario, recibe 1000 fichas de prueba.

create or replace function public.regalo_bienvenida()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.movimientos (usuario_id, tipo, monto, nota)
  values (new.id, 'regalo', 1000.00, 'Fichas de bienvenida');
  return new;
end;
$$;

create trigger trg_regalo_bienvenida
after insert on auth.users
for each row execute function public.regalo_bienvenida();

