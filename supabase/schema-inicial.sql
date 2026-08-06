-- G-Centro · Bloque 1 · Esquema inicial
--
-- Alcance: SOLO catálogo (productos, terminos, planes) y admins.
-- Nada de clientes, suscripciones, pagos ni banderas_pendientes — eso llega
-- en bloques posteriores. Ver docs/g-centro-diseno-v1.md §3.
--
-- CONVENCIÓN: cada cambio de esquema va en un archivo NUEVO dentro de
-- supabase/. Nunca editar un archivo ya aplicado — igual que en G-Vento.
--
-- Cómo aplicar: pegar completo en el SQL Editor del dashboard de Supabase
-- del proyecto de G-Centro (proyecto propio, no comparte nada con G-Vento).
-- Ver el reporte del Bloque 1 para los pasos exactos.

-- ── Extensiones ──────────────────────────────────────────────────────────
-- gen_random_uuid() vive acá. Supabase la trae habilitada por defecto, pero
-- se declara explícita para que este script sea reproducible en cualquier
-- proyecto Postgres nuevo.
create extension if not exists pgcrypto;

-- ── admins ───────────────────────────────────────────────────────────────
-- Allowlist. `id` = auth.users.id. Toda política de RLS del proyecto se
-- apoya en esta tabla (§3, §8).
--
-- `on delete cascade`: si borrás el usuario desde Authentication → Users, la
-- fila de admins se va con él. Sin esto la FK bloquea el borrado y te obliga
-- a limpiar a mano en el orden correcto.
create table public.admins (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  creado_en  timestamptz not null default now()
);

comment on table public.admins is
  'Allowlist de administradores. Sin fila acá, RLS no deja leer nada en ninguna tabla del proyecto.';

-- ── productos ────────────────────────────────────────────────────────────
create table public.productos (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null unique,
  nombre               text not null,
  url_aplicar_estado   text,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now()
);

comment on column public.productos.url_aplicar_estado is
  'Endpoint de la Edge Function del producto. El secreto de escritura NO vive acá (§3) — va en variables de entorno de la Edge Function, que todavía no existe (fuera de alcance del Bloque 1).';

-- ── terminos ─────────────────────────────────────────────────────────────
-- Tabla y no enum: el descuento es dato y va a cambiar (§3).
create table public.terminos (
  codigo          text primary key,
  meses           smallint not null,
  descuento_pct   smallint not null
);

-- ── planes ───────────────────────────────────────────────────────────────
-- Precio de LISTA, no de contrato (§3). Estructura creada; SIN precios
-- cargados todavía — la decisión de IVA (§9.1) define si `precio_mensual`
-- es neto o incluye impuesto, y eso bloquea poblar esta tabla.
create table public.planes (
  id                       uuid primary key default gen_random_uuid(),
  producto_id              uuid not null references public.productos (id),
  codigo                   text not null,
  nombre                   text not null,
  precio_mensual           integer not null,
  precio_sede_adicional    integer not null,
  incluye_dian             boolean not null default false,
  vigente_desde            date not null,
  activo                   boolean not null default true,
  unique (producto_id, codigo)
);

comment on table public.planes is
  'Estructura del Bloque 1. Sin filas: ver TODO en el seed de este archivo — la decisión de IVA (§9.1 del diseño) bloquea cargar precio_mensual / precio_sede_adicional.';

-- ── Chequeo de pertenencia a la allowlist ────────────────────────────────
--
-- ⚠️ POR QUÉ UNA FUNCIÓN Y NO EL SUBQUERY DIRECTO.
--
-- La forma obvia de escribir esto es meter el subquery en cada policy:
--
--     using (auth.uid() in (select id from public.admins))
--
-- En las otras tablas funciona. En `admins` NO: una policy sobre `admins`
-- cuyo USING consulta `admins` dispara su propia policy para resolver el
-- subquery, que vuelve a consultar `admins`… Postgres lo corta con
-- `42P17: infinite recursion detected in policy for relation "admins"`.
-- El error aparece recién en la primera lectura real, no al crear la policy.
--
-- `security definer` corre como el dueño de la tabla (postgres), y el dueño
-- de una tabla no pasa por RLS: el subquery de adentro no vuelve a evaluar
-- ninguna policy y la recursión no existe.
--
-- `set search_path = ''` es obligatorio en toda función `security definer`:
-- sin eso, alguien que controle el search_path de su sesión puede hacer que
-- `admins` resuelva a otra tabla suya y la función devuelva true. Por eso
-- adentro todo va calificado con esquema (`public.admins`, `auth.uid()`).
--
-- `exists` devuelve siempre true/false, nunca null — importante porque una
-- policy que evalúa a NULL deniega, pero un NULL propagándose es más difícil
-- de razonar que un false explícito. Con `anon` (auth.uid() = null) da false.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where id = (select auth.uid())
  );
$$;

-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva. En
-- `security definer` hay que revocarlo explícitamente y conceder solo a los
-- roles que lo necesitan — misma regla que ya se aplicó en G-Vento.
revoke execute on function public.es_admin() from public;
grant  execute on function public.es_admin() to authenticated;

-- ── RLS: deny by default en TODO, sin excepciones ──────────────────────────
-- Sin fila en admins, ninguna tabla de este proyecto devuelve una sola fila
-- — ni siquiera admins misma. El primer admin se inserta a mano desde el SQL
-- Editor del dashboard (corre como postgres y no pasa por RLS); no hay otra
-- puerta de entrada.

alter table public.admins    enable row level security;
alter table public.productos enable row level security;
alter table public.terminos  enable row level security;
alter table public.planes    enable row level security;

create policy "admins_solo_admins" on public.admins
  for all
  using      (public.es_admin())
  with check (public.es_admin());

create policy "productos_solo_admins" on public.productos
  for all
  using      (public.es_admin())
  with check (public.es_admin());

create policy "terminos_solo_admins" on public.terminos
  for all
  using      (public.es_admin())
  with check (public.es_admin());

create policy "planes_solo_admins" on public.planes
  for all
  using      (public.es_admin())
  with check (public.es_admin());

-- ── Seed: terminos ───────────────────────────────────────────────────────
insert into public.terminos (codigo, meses, descuento_pct) values
  ('mensual',    1,  0),
  ('trimestral', 3,  5),
  ('semestral',  6,  10),
  ('anual',      12, 15);

-- ── Seed: planes ─────────────────────────────────────────────────────────
-- TODO(bloque futuro, bloqueado por §9.1 del diseño — decisión de IVA):
-- cargar acá las filas de planes (producto_id, codigo, nombre, precio_mensual,
-- precio_sede_adicional, incluye_dian, vigente_desde) una vez que se sepa si
-- precio_mensual es neto o incluye IVA. Hasta entonces la tabla queda vacía
-- a propósito — insertar precios ahora obligaría a corregirlos con clientes
-- ya viendo el panel.
