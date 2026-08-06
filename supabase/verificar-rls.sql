-- G-Centro · Bloque 1 · Verificación de RLS
--
-- Prueba la afirmación del diseño (§8.2): sin fila en `admins` no se lee
-- absolutamente nada, en ninguna tabla, ni siquiera en las que parecen
-- inocuas.
--
-- Correr en el SQL Editor DESPUÉS de aplicar schema-inicial.sql. Es de solo
-- lectura: cada bloque va dentro de una transacción que termina en rollback,
-- así que no deja rastro ni siquiera si algo falla a la mitad.
--
-- ⚠️ El SQL Editor corre como `postgres`, que es dueño de las tablas y por lo
-- tanto NO pasa por RLS. Por eso cada prueba hace `set local role` para
-- bajarse a un rol que sí la respeta — sin ese cambio de rol la verificación
-- daría "todo se lee" y no probaría nada.

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 1 — usuario autenticado SIN fila en admins
-- Esperado: 0 en las cuatro filas.
-- `terminos` es la prueba que importa: tiene 4 filas cargadas por el seed,
-- así que un 0 acá es RLS bloqueando de verdad y no una tabla vacía.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  -- Las claims se setean ANTES de bajar de rol: después de `set role` el rol
  -- ya no necesariamente puede tocar el GUC.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  set local role authenticated;

  select 'admins'    as tabla, count(*) as filas_visibles from public.admins
  union all
  select 'productos', count(*) from public.productos
  union all
  select 'terminos',  count(*) from public.terminos
  union all
  select 'planes',    count(*) from public.planes;
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 2 — anónimo (sin sesión)
-- Esperado: 0 en las cuatro filas. auth.uid() es null → es_admin() da false.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  set local role anon;

  select 'admins'    as tabla, count(*) as filas_visibles from public.admins
  union all
  select 'productos', count(*) from public.productos
  union all
  select 'terminos',  count(*) from public.terminos
  union all
  select 'planes',    count(*) from public.planes;
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 3 — escritura denegada
-- Esperado: ERROR `new row violates row-level security policy`.
-- Sin esto, un no-admin podría agregarse a sí mismo a la allowlist, que es
-- la escalada de privilegios que toda esta sección existe para cerrar.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  set local role authenticated;

  insert into public.admins (id, email)
  values ('00000000-0000-0000-0000-000000000000', 'intruso@ejemplo.com');
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 4 — control positivo (un admin SÍ lee)
-- Sin esta prueba, las anteriores no distinguen "RLS funciona" de "el
-- esquema está roto y nadie lee nunca nada".
--
-- Reemplazá el UUID por el de tu usuario admin real (el que insertaste en
-- `admins` desde el dashboard) y descomentá el bloque.
-- Esperado: 4 en terminos, 0 en productos y planes (todavía sin seed),
-- 1 o más en admins.
-- ══════════════════════════════════════════════════════════════════════════
-- begin;
--   set local request.jwt.claims = '{"sub":"PEGA-ACA-TU-UUID","role":"authenticated"}';
--   set local role authenticated;
--
--   select 'admins'    as tabla, count(*) as filas_visibles from public.admins
--   union all
--   select 'productos', count(*) from public.productos
--   union all
--   select 'terminos',  count(*) from public.terminos
--   union all
--   select 'planes',    count(*) from public.planes;
-- rollback;
