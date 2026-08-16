-- G-Centro · Bloque 4 · Qué le dijimos, y cuándo
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- `banderas_pendientes` guardaba el NIVEL y no el TEXTO. Con un operador el
-- mensaje se recordaba; con varios, «¿qué le dijimos a G-10 la semana pasada?»
-- no tiene respuesta en ningún lado — y según §6 ese texto es **la palanca
-- real de cobranza** en los niveles altos, o sea justo lo que más importa
-- poder revisar.
--
-- ⚠️ ADEMÁS ARREGLA UN DEFECTO QUE ESTABA DOCUMENTADO COMO DECISIÓN.
--
-- El código decía que reintentar no reenvía el mensaje, y lo justificaba. No
-- era una decisión: era una consecuencia de no tener el dato. Y reenviar
-- `null` **borra el banner del producto**, así que un reintento exitoso
-- dejaba al cliente con el nivel correcto y sin el texto que lo explica.
--
-- Con la columna, el reintento repite la intención COMPLETA —nivel y texto—,
-- que es lo que un reintento tiene que hacer.

begin;

alter table public.banderas_pendientes
  add column mensaje text;

comment on column public.banderas_pendientes.mensaje is
  'El texto del banner que se envió con esta bandera. NULL = se envió sin mensaje (que en el producto significa banner sin texto). Es prosa que un admin escribe sobre un cliente concreto: va FILTRADO en el reporte de errores, igual que ultimo_error y motivo.';

-- No hay backfill posible: las 8 filas anteriores se escribieron sin la
-- columna y el texto no está en ningún otro lado. Quedan en NULL, que acá
-- significa «no se sabe», no «se envió vacío». Misma familia que `admin_id`
-- en `010` y `cambio_efectivo` en `009`: el histórico no se inventa.
--
-- ⚠️ Consecuencia para la UI: `mensaje IS NULL` es ambiguo en las filas
-- viejas y unívoco en las nuevas. La pantalla lo muestra como «sin mensaje»
-- sólo cuando la fila es posterior a esta migración; antes dice «sin dato».
-- Si eso resultara confuso, la alternativa honesta es un DEFAULT distinto,
-- no rellenar.

do $$
declare
  viejas int;
begin
  select count(*) into viejas from public.banderas_pendientes where mensaje is null;
  raise notice 'Columna creada. % filas anteriores quedan sin mensaje recuperable.', viejas;
end $$;

commit;

-- ── Después de aplicar ───────────────────────────────────────────────────
--   supabase gen types typescript --linked > src/types/database.types.ts
--   supabase functions deploy sincronizar-bandera
--
-- El despliegue de la función es parte de esta migración, no un extra: la
-- columna la escribe el handler. Sin desplegar, la columna queda siempre en
-- NULL y la pantalla mostraría «sin dato» para todo.
