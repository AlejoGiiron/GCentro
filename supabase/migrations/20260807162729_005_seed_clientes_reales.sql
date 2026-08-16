-- G-Centro · Bloque 2 · Los dos clientes reales
--
-- ⚠️ ESTO NO ES UN FIXTURE. G-10 y Salchimelo son los dos clientes que están
-- pagando hoy. Va en archivo aparte del seed de catálogo justamente por eso:
-- el catálogo se puede recargar en cualquier ambiente, esto no. No correr en
-- un proyecto de pruebas esperando datos de mentira.
--
-- MIGRACIÓN INCREMENTAL. Se corre DESPUÉS de `20260807162728_004_seed_planes.sql`: las
-- suscripciones apuntan al plan Esencial de g-vento.

begin;

insert into public.clientes (nombre_comercial) values
  ('G-10'),
  ('Salchimelo');

-- Las dos suscripciones son idénticas salvo el cliente.
--
-- `precio_base_mensual` = 75.000 y NO 80.000: es un precio especial acordado,
-- congelado al firmar. Cuando suba el precio de lista, estos dos no se mueven
-- — que es exactamente para lo que existe la columna congelada (§3).
--
-- `descuento_pct` = 0 y no es un olvido: el acuerdo YA está reflejado en el
-- precio base. El descuento por término es otra cosa (mensual = 0% de todos
-- modos). Mezclarlos daría 75.000 con un descuento encima que nadie pactó.
--
-- `organizacion_externa_id` = NULL: todavía no hay ids de organización del
-- lado del producto (§9.2.3 sigue pendiente). El UNIQUE sobre
-- (producto_id, organizacion_externa_id) no molesta, porque en Postgres los
-- NULL son distintos entre sí y admite las dos filas.
insert into public.suscripciones (
  cliente_id, producto_id, plan_id, termino, estado, sedes_adicionales,
  precio_base_mensual, precio_sede_adicional, descuento_pct,
  fecha_inicio, periodo_actual_inicio, periodo_actual_fin, proximo_cobro,
  estado_implementacion, organizacion_externa_id
)
select
  c.id,
  p.id,
  pl.id,
  'mensual',
  'activa',
  0,
  75000,
  pl.precio_sede_adicional,  -- el de lista: no hay sedes adicionales que congelar todavía
  0,
  date '2026-08-01',
  date '2026-08-01',
  date '2026-08-31',   -- INCLUSIVO: último día cubierto
  date '2026-09-01',
  'cobrada',
  null
from public.clientes c
join public.productos p  on p.codigo  = 'g-vento'
join public.planes    pl on pl.codigo = 'esencial' and pl.producto_id = p.id
where c.nombre_comercial in ('G-10', 'Salchimelo');

-- Bitácora: toda suscripción arranca con su CREADA (§3).
insert into public.suscripcion_eventos (suscripcion_id, tipo, estado_nuevo, motivo)
select s.id, 'CREADA', s.estado, 'Carga inicial del panel — cliente ya activo antes de G-Centro'
from public.suscripciones s;

do $$
declare
  n_cli int;
  n_sus int;
begin
  select count(*) into n_cli from public.clientes;
  select count(*) into n_sus from public.suscripciones;
  if n_cli <> 2 or n_sus <> 2 then
    raise exception 'esperaba 2 clientes y 2 suscripciones; hay % y %', n_cli, n_sus;
  end if;
end $$;

commit;

-- PENDIENTE (lo carga Alejandro): `organizacion_externa_id` de cada una,
-- cuando tenga los ids del lado de G-Vento. Hasta entonces la bandera no
-- tiene a dónde escribir — que es Bloque 3 de todas formas.
