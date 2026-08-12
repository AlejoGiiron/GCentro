-- G-Centro · Bloque 3 · Ids de organización y tenant de pruebas
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- Llegaron los ids de organización del lado del producto. Con eso se cierra
-- §9.4 (el último pendiente del diseño) y se puede armar el puente de §5.
--
-- ⚠️ REGLA: SIEMPRE se guarda el UUID, NUNCA el nombre. Los ids son estables
-- —nada del lado del producto reescribe la tabla de organizaciones y el
-- onboarding reutiliza el id si el nombre ya existe— pero el nombre es texto
-- editable. Guardar el nombre convertiría un renombre cosmético en una
-- suscripción huérfana.

begin;

-- ── 1. Los dos clientes que pagan ────────────────────────────────────────
update public.suscripciones s
   set organizacion_externa_id = '12b53bae-a4f7-4076-80f9-8f9288bd0567'
  from public.clientes c
 where c.id = s.cliente_id and c.nombre_comercial = 'G-10';

update public.suscripciones s
   set organizacion_externa_id = '6b35f20d-fa53-47fe-bef0-5817ba6d5725'
  from public.clientes c
 where c.id = s.cliente_id and c.nombre_comercial = 'Salchimelo';

-- ── 2. es_prueba ─────────────────────────────────────────────────────────
--
-- DEFAULT FALSE a propósito, y no es un detalle: con default true —o con la
-- columna nullable— un cliente nuevo podría nacer invisible para la cobranza
-- por un olvido en el INSERT. El modo de fallo tiene que ser "aparece en la
-- cobranza aunque no debería", nunca "no aparece y nadie lo nota".
alter table public.clientes
  add column es_prueba boolean not null default false;

comment on column public.clientes.es_prueba is
  'Tenant de laboratorio, no factura. DEFAULT FALSE: un cliente nuevo nunca nace invisible para la cobranza por accidente. Las vistas *_cobrables lo excluyen.';

-- ── 3. LAB ───────────────────────────────────────────────────────────────
--
-- No es un cliente: es el laboratorio donde se prueba el circuito completo de
-- la bandera sin tocar a G-10 ni a Salchimelo. Que exista como fila real (con
-- su organizacion_externa_id de verdad) es lo que permite ejercitar el camino
-- entero en vez de simularlo.
insert into public.clientes (nombre_comercial, es_prueba, notas)
values ('LAB', true, 'Tenant de pruebas. NO factura. Sirve para ejercitar el circuito de la bandera contra una organización real del producto.');

-- Plan y término dan igual: la fila solo tiene que ser válida. Se elige el
-- más barato y todos los importes en CERO — así, si alguna consulta de plata
-- se olvida de excluir es_prueba, suma 0 en vez de ensuciar un total.
insert into public.suscripciones (
  cliente_id, producto_id, plan_id, termino, estado, sedes_adicionales,
  precio_base_mensual, precio_sede_adicional, descuento_pct, monto_implementacion,
  fecha_inicio, periodo_actual_inicio, periodo_actual_fin, proximo_cobro,
  estado_implementacion, organizacion_externa_id
)
select
  c.id, p.id, pl.id, 'mensual', 'activa', 0,
  0, 0, 0, 0,
  date '2026-08-01', date '2026-08-01', date '2026-08-31', date '2026-09-01',
  'exonerada',
  'f4fa692d-6cf3-43fb-a17f-18b8b163c918'
from public.clientes c
join public.productos p  on p.codigo  = 'g-vento'
join public.planes    pl on pl.codigo = 'esencial' and pl.producto_id = p.id
where c.nombre_comercial = 'LAB';

insert into public.suscripcion_eventos (suscripcion_id, tipo, estado_nuevo, motivo)
select s.id, 'CREADA', s.estado, 'Tenant de pruebas — alta del laboratorio'
from public.suscripciones s
join public.clientes c on c.id = s.cliente_id
where c.nombre_comercial = 'LAB';

-- ── 4. Vistas de cobranza ────────────────────────────────────────────────
--
-- La exclusión de los tenants de prueba NO puede ser una convención que cada
-- consulta tiene que acordarse de escribir: eso falla la primera vez que
-- alguien copia un SELECT sin el WHERE. Se invierte la carga — el camino por
-- default excluye, y para INCLUIR a LAB hay que ir explícitamente a la tabla
-- base.
--
-- ⚠️ `security_invoker = true` NO es opcional. Una vista normal corre con los
-- permisos de su DUEÑO (postgres), que se saltea RLS: sin esto, estas vistas
-- serían un agujero por donde `anon` leería `clientes` entero, esquivando toda
-- la política del Bloque 1. Con `security_invoker` la RLS de las tablas base
-- se evalúa contra quien consulta. Requiere Postgres 15+.
create view public.clientes_cobrables
  with (security_invoker = true) as
  select * from public.clientes where es_prueba = false;

create view public.suscripciones_cobrables
  with (security_invoker = true) as
  select s.*
    from public.suscripciones s
    join public.clientes c on c.id = s.cliente_id
   where c.es_prueba = false;

comment on view public.clientes_cobrables is
  'Camino por DEFAULT para cobranza. Para incluir tenants de prueba hay que consultar public.clientes explícitamente.';
comment on view public.suscripciones_cobrables is
  'Camino por DEFAULT para cobranza. Para incluir tenants de prueba hay que consultar public.suscripciones explícitamente.';

-- ── Verificación ─────────────────────────────────────────────────────────
do $$
declare
  sin_org  int;
  n_lab    int;
  n_cobra  int;
begin
  select count(*) into sin_org
    from public.suscripciones where organizacion_externa_id is null;
  if sin_org <> 0 then
    raise exception 'quedaron % suscripciones sin organizacion_externa_id', sin_org;
  end if;

  select count(*) into n_lab from public.clientes where es_prueba;
  if n_lab <> 1 then
    raise exception 'esperaba 1 cliente de prueba y hay %', n_lab;
  end if;

  select count(*) into n_cobra from public.clientes_cobrables;
  if n_cobra <> 2 then
    raise exception 'clientes_cobrables deberia tener 2 filas y tiene %', n_cobra;
  end if;
end $$;

commit;
