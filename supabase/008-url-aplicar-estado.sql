-- G-Centro · Bloque 3 · La URL del puente
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- `productos.url_aplicar_estado` existe desde `schema-inicial.sql` y quedó en
-- NULL en los tres productos porque las Edge Functions no estaban desplegadas.
-- Ya llegó la de G-Vento.
--
-- ⚠️ POR QUÉ VA EN LA BASE Y NO EN UNA VARIABLE DE ENTORNO
--
-- La tentación es ponerla en el entorno de la Edge Function, al lado del
-- secreto. Pero el secreto es UNO y la URL es UNA POR PRODUCTO: cuando entren
-- G-Mura y G-Quota, la variable de entorno se convierte en tres variables con
-- nombres que hay que mantener sincronizados a mano con los `codigo` de la
-- tabla. La columna ya modela exactamente esa relación.
--
-- Además no es un secreto: la Edge Function del otro lado no se autentica por
-- oscuridad de la URL sino por HMAC (§5). Conocerla no sirve de nada.

begin;

update public.productos
   set url_aplicar_estado = 'https://zudeogjmxfklrrhyvezy.supabase.co/functions/v1/aplicar-estado'
 where codigo = 'g-vento';

-- ── Verificación en transacción ──────────────────────────────────────────
-- Si el update no tocó la fila que tenía que tocar, esto revienta acá y no
-- dentro de la Edge Function con un cliente esperando.
do $$
declare
  url_cargada text;
begin
  select url_aplicar_estado into url_cargada
    from public.productos where codigo = 'g-vento';

  if url_cargada is null then
    raise exception 'g-vento quedó sin url_aplicar_estado';
  end if;

  if url_cargada not like 'https://%' then
    raise exception 'url_aplicar_estado de g-vento no es https: %', url_cargada;
  end if;
end $$;

commit;

-- ── Lo que NO hace esta migración, a propósito ────────────────────────────
--
-- No carga URL para `g-mura` ni `g-quota`. No tienen Edge Function todavía, y
-- una URL inventada "para dejarlo listo" es peor que un NULL: el NULL hace que
-- `sincronizar-bandera` falle temprano y con un mensaje claro ("el producto no
-- tiene puente configurado"), mientras que una URL que no responde se ve igual
-- que una caída y se diagnostica como si el otro lado estuviera roto.
