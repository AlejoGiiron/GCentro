-- G-Centro · Bloque 2 · Seed de planes
--
-- MIGRACIÓN INCREMENTAL. Cierra el TODO que dejó `20260805180823_schema_inicial.sql`: la
-- estructura de `planes` existía desde el Bloque 1, sin filas, esperando que
-- se confirmaran los números.
--
-- Precios de LISTA, base gravable, SIN IVA (§9.1). Son el punto de partida de
-- una negociación, no lo que paga cada cliente: al firmar se congelan en
-- `suscripciones` y desde ahí no se leen más de acá.

begin;

insert into public.planes
  (producto_id, codigo, nombre, precio_mensual, precio_sede_adicional, incluye_dian, vigente_desde, activo)
select
  p.id, v.codigo, v.nombre, v.precio_mensual, v.precio_sede_adicional, v.incluye_dian, date '2026-01-01', true
from public.productos p
cross join (values
  ('esencial',    'Esencial',     80000,  60000, false),
  ('profesional', 'Profesional', 130000,  90000, true)
) as v(codigo, nombre, precio_mensual, precio_sede_adicional, incluye_dian)
where p.codigo = 'g-vento';

-- ── Por qué NO hay columnas de precio con descuento ──────────────────────
--
-- El precio por término se DERIVA: base × (100 − descuento_pct) / 100, con el
-- descuento leído de `terminos`. Guardarlo sería duplicar un dato que ya
-- existe, y duplicar precios es cómo se termina con dos números distintos
-- para lo mismo.
--
-- Con estas bases y los descuentos vigentes (10% y 30%) todas las
-- combinaciones dan ENTEROS EXACTOS, así que no hace falta ninguna regla de
-- redondeo. Eso no se deja a la suerte: está verificado en
-- `src/lib/cobro.test.ts` ("el catálogo no necesita regla de redondeo"), que
-- recorre las cuatro bases por los tres términos.
--
--   Esencial          mensual  80.000  semestral  72.000  anual  56.000
--   Profesional       mensual 130.000  semestral 117.000  anual  91.000
--   Sede Esencial     mensual  60.000  semestral  54.000  anual  42.000
--   Sede Profesional  mensual  90.000  semestral  81.000  anual  63.000
--
-- Si algún día un precio de lista rompe esa propiedad, el test falla ANTES de
-- que aparezca un peso de diferencia en una factura.

do $$
declare
  n int;
begin
  select count(*) into n from public.planes;
  if n <> 2 then
    raise exception 'planes deberia tener 2 filas y tiene %', n;
  end if;
end $$;

commit;
