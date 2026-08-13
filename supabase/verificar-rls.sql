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
-- Cubre las NUEVE tablas y las DOS vistas. Las cinco de negocio son las que tienen la PII y la
-- plata: son exactamente las que no pueden quedar afuera de esta prueba.

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 1 — usuario autenticado SIN fila en admins
-- Esperado: 0 en las once filas.
--
-- `terminos` (3 filas), `productos` (3), `planes` (2), `clientes` (3) y
-- `suscripciones` (3) son las que importan: tienen datos cargados, así que un
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
  union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes
  -- Las vistas tambien: con security_invoker deben respetar la RLS de las
  -- tablas base. Si alguna devuelve filas aca, la vista es un agujero.
  union all select 'VISTA clientes_cobrables',      count(*) from public.clientes_cobrables
  union all select 'VISTA suscripciones_cobrables', count(*) from public.suscripciones_cobrables;
rollback;

-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA 2 — anónimo (sin sesión)
-- Esperado: 0 en las once filas. auth.uid() es null → es_admin() da false.
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
  union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes
  -- Las vistas tambien: con security_invoker deben respetar la RLS de las
  -- tablas base. Si alguna devuelve filas aca, la vista es un agujero.
  union all select 'VISTA clientes_cobrables',      count(*) from public.clientes_cobrables
  union all select 'VISTA suscripciones_cobrables', count(*) from public.suscripciones_cobrables;
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
-- Esperado, con las NUEVE migraciones aplicadas (002…009):
--   admins                          1 o más
--   productos                       3   (g-vento, g-mura, g-quota)
--   terminos                        3   (mensual, semestral, anual — el
--                                        trimestral se eliminó en 002)
--   planes                          2   (Esencial, Profesional)
--   clientes                        3   (G-10, Salchimelo, LAB)
--   suscripciones                   3
--   suscripcion_eventos             3   (una CREADA por suscripción)
--   pagos                           0
--   banderas_pendientes             3+  (la prueba en vivo del 13/08 contra LAB
--                                        dejó tres filas; ya no es 0)
--   VISTA clientes_cobrables        2   ← LAB queda afuera: es la prueba de
--   VISTA suscripciones_cobrables   2      que el filtro de es_prueba funciona
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
--   union all select 'banderas_pendientes',  count(*) from public.banderas_pendientes
--   union all select 'VISTA clientes_cobrables',      count(*) from public.clientes_cobrables
--   union all select 'VISTA suscripciones_cobrables', count(*) from public.suscripciones_cobrables;
-- rollback;
