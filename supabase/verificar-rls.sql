-- G-Centro · Verificación de RLS
--
-- Prueba la afirmación del diseño (§8.2): sin fila en `admins` no se lee
-- absolutamente nada, en ninguna tabla, ni siquiera en las que parecen
-- inocuas.
--
-- Correr en el SQL Editor DESPUÉS de aplicar todas las migraciones. Es de solo
-- lectura: cada bloque va dentro de una transacción que termina en rollback,
-- así que no deja rastro ni siquiera si algo falla a la mitad.
--
-- ⚠️ El SQL Editor corre como `postgres`, que es dueño de las tablas y por lo
-- tanto NO pasa por RLS. Por eso cada prueba hace `set local role` para
-- bajarse a un rol que sí la respeta — sin ese cambio de rol la verificación
-- daría "todo se lee" y no probaría nada.
--
-- Cubre las NUEVE tablas. Las cinco de negocio son las que tienen la PII y la
-- plata: son exactamente las que no pueden quedar afuera de esta prueba.

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 1 — usuario autenticado SIN fila en admins
-- Esperado: 0 en las nueve filas.
--
-- `terminos` (3 filas), `productos` (3), `planes` (2), `clientes` (2) y
-- `suscripciones` (2) son las que importan: tienen datos cargados, así que un
-- 0 ahí es RLS bloqueando de verdad y no una tabla vacía.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  -- Las claims se setean ANTES de bajar de rol: después de `set role` el rol
  -- ya no necesariamente puede tocar el GUC.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  set local role authenticated;

  select 'admins'              as tabla, count(*) as filas_visibles from public.admins
  union all select 'productos',            count(*) from public.productos
  union all select 'terminos',             count(*) from public.terminos
  union all select 'planes',               count(*) from public.planes
  union all select 'clientes',             count(*) from public.clientes
  union all select 'suscripciones',        count(*) from public.suscripciones
  union all select 'suscripcion_eventos',  count(*) from public.suscripcion_eventos
  union all select 'pagos',                count(*) from public.pagos
  union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes;
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 2 — anónimo (sin sesión)
-- Esperado: 0 en las nueve filas. auth.uid() es null → es_admin() da false.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  set local role anon;

  select 'admins'              as tabla, count(*) as filas_visibles from public.admins
  union all select 'productos',            count(*) from public.productos
  union all select 'terminos',             count(*) from public.terminos
  union all select 'planes',               count(*) from public.planes
  union all select 'clientes',             count(*) from public.clientes
  union all select 'suscripciones',        count(*) from public.suscripciones
  union all select 'suscripcion_eventos',  count(*) from public.suscripcion_eventos
  union all select 'pagos',                count(*) from public.pagos
  union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes;
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
-- PRUEBA 3b — tampoco se puede LEER un cliente ni un pago
-- Esperado: 0 filas en las dos. Son las tablas con PII y con plata; que la
-- prueba 1 ya las cubra no quita que valga la pena verlas solas.
-- ══════════════════════════════════════════════════════════════════════════
begin;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  set local role authenticated;

  select 'clientes visibles' as prueba, count(*) from public.clientes
  union all
  select 'pagos visibles', count(*) from public.pagos;
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 4 — control positivo (un admin SÍ lee)
-- Sin esta prueba, las anteriores no distinguen "RLS funciona" de "el
-- esquema está roto y nadie lee nunca nada".
--
-- Reemplazá el UUID por el de tu usuario admin real (el que insertaste en
-- `admins` desde el dashboard) y descomentá el bloque.
--
-- Esperado, con todas las migraciones aplicadas:
--   admins               1 o más
--   productos            3   (g-vento, g-mura, g-quota)
--   terminos             3   (mensual, semestral, anual — el trimestral se
--                             eliminó en 002-terminos-corregidos.sql)
--   planes               2   (Esencial, Profesional)
--   clientes             2   (G-10, Salchimelo)
--   suscripciones        2
--   suscripcion_eventos  2   (una CREADA por suscripción)
--   pagos                0
--   banderas_pendientes  0
-- ══════════════════════════════════════════════════════════════════════════
-- begin;
--   set local request.jwt.claims = '{"sub":"PEGA-ACA-TU-UUID","role":"authenticated"}';
--   set local role authenticated;
--
--   select 'admins'              as tabla, count(*) as filas_visibles from public.admins
--   union all select 'productos',            count(*) from public.productos
--   union all select 'terminos',             count(*) from public.terminos
--   union all select 'planes',               count(*) from public.planes
--   union all select 'clientes',             count(*) from public.clientes
--   union all select 'suscripciones',        count(*) from public.suscripciones
--   union all select 'suscripcion_eventos',  count(*) from public.suscripcion_eventos
--   union all select 'pagos',                count(*) from public.pagos
--   union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes;
-- rollback;
