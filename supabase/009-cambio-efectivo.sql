-- G-Centro · Bloque 3 · Distinguir una llamada de otra
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- Sale de la prueba en vivo del 13/08/2026. Tres llamadas dejaron tres filas
-- idénticas salvo por los timestamps: `valor_deseado` 'gracia' dos veces, las
-- dos confirmadas, sin nada que dijera que la SEGUNDA no cambió nada del otro
-- lado. `banderas_pendientes` crece por LLAMADA, no por cambio de estado (§5),
-- y sin esta columna la única forma de saber cuál movió algo era mirar la hora.
--
-- ⚠️ NULLABLE A PROPÓSITO, y el null tiene significado. Tres combinaciones:
--
--   confirmado_en lleno + cambio_efectivo true   → se aplicó y cambió algo
--   confirmado_en lleno + cambio_efectivo false  → ya estaba así (idempotencia)
--   confirmado_en lleno + cambio_efectivo NULL   → G-Vento respondió 200 con un
--                                                  cuerpo ilegible. El estado se
--                                                  aplicó; el detalle se perdió.
--   confirmado_en NULL                           → no se aplicó. Mirá el código.
--
-- Un DEFAULT FALSE borraría la tercera: diría "no cambió nada" donde lo cierto
-- es "no sabemos". Es la misma razón por la que el filtro de Sentry deja pasar
-- `null` verbatim en vez de redactarlo (§7): un null es un hallazgo, no un hueco.

begin;

alter table public.banderas_pendientes
  add column cambio_efectivo boolean;

comment on column public.banderas_pendientes.cambio_efectivo is
  'El `changed` de la respuesta de aplicar-estado: false = el producto YA estaba en ese estado y subscription_updated_at no se movió. NULL = 200 con cuerpo ilegible, o nunca se confirmó. No es un error: la idempotencia es parte del contrato (§6).';

-- Las filas de la prueba en vivo quedan en NULL, que es correcto: se
-- escribieron antes de que la columna existiera y el dato ya no se puede
-- recuperar. Rellenarlas a mano sería inventar historia.

commit;
