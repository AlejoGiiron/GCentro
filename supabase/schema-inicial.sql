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
-- del proyecto de G-Centro (Postgres + Auth + Edge Functions, proyecto propio,
-- no comparte nada con G-Vento). Ver el reporte del Bloque 1 para los pasos
-- exactos.

-- ── Extensiones ──────────────────────────────────────────────────────────
-- gen_random_uuid() vive acá. Supabase la trae habilitada por defecto, pero
-- se declara explícita para que este script sea reproducible en cualquier
-- proyecto Postgres nuevo.
create extension if not exists pgcrypto;

-- ── admins ───────────────────────────────────────────────────────────────
-- Allowlist. `id` = auth.users.id. Toda política de RLS del proyecto se
-- apoya en esta tabla (§3, §8).
create table public.admins (
  id         uuid primary key references auth.users (id),
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

-- ── RLS: deny by default en TODO, sin excepciones ──────────────────────────
-- Toda política contra auth.uid() in (select id from admins). Sin fila en
-- admins, ninguna tabla de este proyecto devuelve una sola fila — ni
-- siquiera admins misma. El primer admin se inserta a mano desde el SQL
-- Editor del dashboard (corre como service role / postgres y no pasa por
-- RLS); no hay otra puerta de entrada.

alter table public.admins   enable row level security;
alter table public.productos enable row level security;
alter table public.terminos  enable row level security;
alter table public.planes    enable row level security;

create policy "admins_solo_admins" on public.admins
  for all
  using   (auth.uid() in (select id from public.admins))
  with check (auth.uid() in (select id from public.admins));

create policy "productos_solo_admins" on public.productos
  for all
  using   (auth.uid() in (select id from public.admins))
  with check (auth.uid() in (select id from public.admins));

create policy "terminos_solo_admins" on public.terminos
  for all
  using   (auth.uid() in (select id from public.admins))
  with check (auth.uid() in (select id from public.admins));

create policy "planes_solo_admins" on public.planes
  for all
  using   (auth.uid() in (select id from public.admins))
  with check (auth.uid() in (select id from public.admins));

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
