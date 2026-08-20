# `sincronizar-bandera`

El salto que guarda el secreto. El panel llama acá; acá se firma y se llama a
`aplicar-estado` de G-Vento. **El navegador nunca toca el secreto HMAC** (§5).

---

## Desplegar

```bash
supabase functions deploy sincronizar-bandera
```

**Sin `--no-verify-jwt`.** Esta función tiene que verificar el JWT: el que la
llama es un admin del panel con sesión. (La que NO verifica JWT es
`aplicar-estado`, del otro lado, porque su única autenticación es el HMAC.)

### El secreto

```bash
supabase secrets set GVENTO_HMAC_SECRETO='...'
```

Nunca en el repo, nunca en el bundle, nunca en un log. `SUPABASE_URL` y
`SUPABASE_ANON_KEY` las inyecta la plataforma.

> El único secreto que esta función tiene es el HMAC. **No usa service role**,
> ni de G-Centro ni de G-Vento: el acceso a la base va con el JWT de quien
> llamó, así que no puede hacer nada que ese admin no pudiera hacer solo desde
> el panel. Las policies de §8 siguen siendo la única autorización.

---

## Probar en vivo — **siempre contra LAB**

**LAB** (`f4fa692d-6cf3-43fb-a17f-18b8b163c918`) es el tenant de laboratorio.
G-10 y Salchimelo son clientes que pagan: una prueba contra ellos les pone un
banner de cobranza en la pantalla de venta, en vivo, en el mostrador.

La suscripción de LAB:

```sql
select s.id
  from public.suscripciones s
  join public.clientes c on c.id = s.cliente_id
 where c.es_prueba = true;
```

Con esa fila y un token de sesión del panel:

```bash
SUSCRIPCION_LAB='<el id de la consulta de arriba>'

curl -i -X POST \
  "$GCENTRO_URL/functions/v1/sincronizar-bandera" \
  -H "Authorization: Bearer $TOKEN_DE_SESION" \
  -H 'Content-Type: application/json' \
  -d "{\"suscripcion_id\":\"$SUSCRIPCION_LAB\",
       \"valor_deseado\":\"gracia\",
       \"mensaje\":\"Prueba de laboratorio.\"}"
```

Y después dejarlo como estaba:

```bash
  -d "{\"suscripcion_id\":\"$SUSCRIPCION_LAB\",\"valor_deseado\":\"activa\",\"mensaje\":null}"
```

### Qué mirar

| | Esperado |
|---|---|
| Primera llamada | `200 {"ok":true,"changed":true,"subscription_updated_at":"…"}` |
| Repetirla igual | `200 {"ok":true,"changed":false,…}` con el **mismo** `subscription_updated_at` — eso es la idempotencia |
| `banderas_pendientes` | una fila por llamada, `confirmado_en` con valor |
| Con el secreto mal | `502` y `bandera_error_codigo = 'HMAC_INVALIDO'` |

La primera llamada tarda ~2s por arranque en frío; las siguientes ~0.5s.

```sql
select valor_deseado, intentos, cambio_efectivo, bandera_error_codigo,
       confirmado_en, creado_en
  from public.banderas_pendientes
 order by creado_en desc limit 5;
```

---

## Respuestas

| Código | Qué pasó |
|---|---|
| `200` | Se aplicó. `changed:false` = ya estaba así, y no es un error. |
| `400` | Entrada inválida (nivel desconocido, mensaje > 140, uuid mal). |
| `401` | Sin sesión. |
| `403` | Con sesión, pero sin fila en `admins`. |
| `404` | La suscripción no existe. |
| `422` | Falta `organizacion_externa_id` o el producto no tiene `url_aplicar_estado`. |
| `500` | Problema de configuración o de base de este lado. |
| `502` | Se escribió la intención, pero G-Vento no aceptó. Mirá `bandera_error_codigo`. |

**El 400 se decide de este lado, antes de la red.** No se depende del 400 de
G-Vento para atajar un nivel desconocido: con fail-open (§5), un valor que
ellos no reconozcan se leería como `activa` y una suspensión se convertiría en
silencio en "todo bien".

---

## Qué está probado y qué no

Probado en `vitest`, corriendo el código real (410 tests en total):

- La firma, contra un doble de `aplicar-estado` que **recalcula el HMAC con
  `node:crypto`** sobre el body crudo que recibió. Si se firmara una cosa y se
  mandara otra, el doble devuelve 401 igual que el sistema real.
- Los cinco valores del mapeo, de punta a punta.
- Cada código de respuesta a su `bandera_error_codigo`.
- Que un nivel desconocido no llega nunca a la red.
- Idempotencia, ventana de 300s en los dos sentidos, reintentos.

**NO probado —hace falta el despliegue:**

- `index.ts` completo. Usa globales de Deno y `jsr:@supabase/supabase-js@2`;
  no hay runtime de Deno en este repo. Lo que hace es pegar piezas que sí
  están probadas, pero **el camino real no se corrió**.
- El chequeo de admin contra las policies reales.
- El contrato contra la `aplicar-estado` de verdad. Todo lo verificado es
  contra un doble escrito desde el contrato en papel: si el contrato dice algo
  distinto de lo que el código de ellos hace, los tests no lo ven.
