# G-Centro

Panel de control de suscripciones de Giiron. Administra los contratos de los clientes
y escribe hacia cada producto la **bandera**: el nivel de restricción que ese cliente ve.

- **Por qué está hecho así:** [`docs/g-centro-diseno-v1.md`](docs/g-centro-diseno-v1.md).
  Es la fuente de verdad; si el código lo contradice, gana el documento hasta que se
  actualice.
- **Qué es el producto y para quién:** [`PRODUCT.md`](PRODUCT.md).
- **Reglas de trabajo sobre este repo:** [`CLAUDE.md`](CLAUDE.md).

Este archivo es sólo **operación**: cómo correrlo, cómo desplegarlo y qué hace falta.

---

## Correr en local

```bash
pnpm install
cp .env.example .env    # y completar
pnpm dev
```

| | |
|---|---|
| `pnpm dev` | servidor de desarrollo |
| `pnpm build` | build de producción |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | eslint |
| `pnpm test:unit` | vitest |

---

## Variables de entorno

Las `VITE_*` **se hornean en el bundle y son públicas**. El anon key está bien ahí —es su
diseño, y lo que protege los datos es RLS (§8)—; las tres últimas **no llevan ese
prefijo** justamente para que no viajen al navegador.

| Variable | Para qué | ¿Al navegador? |
|---|---|---|
| `VITE_GCENTRO_SUPABASE_URL` | proyecto de Supabase | sí |
| `VITE_GCENTRO_SUPABASE_ANON_KEY` | clave anónima | sí |
| `VITE_SENTRY_DSN` | destino de los errores | sí |
| `VITE_SENTRY_ENVIRONMENT` | `production` | sí |
| `VITE_SENTRY_RELEASE` | versión; en Vercel, `$VERCEL_GIT_COMMIT_SHA` | sí |
| `SENTRY_AUTH_TOKEN` | subir source maps | **no** |
| `SENTRY_ORG` | idem | **no** |
| `SENTRY_PROJECT` | idem | **no** |

---

## Despliegue

Vercel, desde el repo. `vercel.json` ya lleva el comando de build, la salida y las
cabeceras.

⚠️ **La Production Branch de Vercel es `develop`, y este repo NO TIENE `main`.**

O sea que **`git push origin develop` despliega a producción**. No hay preview intermedio
ni un paso de promoción: lo que se pushea, sale. Está anotado acá porque lo natural es
suponer lo contrario —que `develop` es integración y que producción vive en otra rama— y
esa suposición hace que alguien pushee "para ver el preview".

Si algún día hace falta un escalón, se crea `main` y se mueve la Production Branch; hasta
entonces, el escalón es el push.

**No lleva `rewrites`, y eso es deliberado:** el panel usa `HashRouter`, así que la ruta
que llega al servidor es siempre `/` — el `#` no viaja en la petición. Es la razón por la
que se eligió: un enlace compartido y un F5 no pueden fallar por configuración de hosting.

Después del primer despliegue:

1. Agregar el dominio a **Supabase → Authentication → URL Configuration → Redirect URLs**.
   Sin eso el login puede fallar en producción aunque funcione en local.
2. Entrar con TOTP.
3. Provocar un error y verificar que en Sentry se lee.

---

## ⚠️ Desplegar sin Sentry es un MODO DEGRADADO

Se puede: el build funciona, la aplicación anda, y nada revienta. **Pero no es el modo
normal, y conviene saber exactamente qué se pierde.**

**Sin `VITE_SENTRY_DSN`** — no hay telemetría:

- Ningún error llega a ningún lado. La única forma de enterarse de que algo se rompió es
  que un operador avise.
- La pantalla de error lo dice en vez de mentir: sin reporte muestra «este error NO se
  reportó solo» y a quién avisar (ver [`src/lib/soporte.ts`](src/lib/soporte.ts)).

**Sin `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` y `SENTRY_PROJECT`** —hay telemetría pero sin
mapas—, que es **el modo peor de los tres**:

- Los errores llegan **minificados**. Un stack de `a.b is not a function` en `index-x7f.js`
  línea 1 no dice nada: no hay archivo, no hay función, no hay línea. Es casi lo mismo que
  no tenerlos, con el costo de creer que sí se tienen.
- Y no se generan los `.map` en el build, a propósito: el que los sube **y los borra** es
  el plugin de Sentry, así que sin token quedarían publicados en el hosting.

**Las tres van juntas o ninguna.** Prender el DSN sin las credenciales de mapas es la
combinación que produce la falsa sensación de estar cubierto.

---

## Base de datos

Migraciones en `supabase/migrations/`, formato del CLI. Después de aplicar cualquiera,
**regenerar los tipos** — nunca escribirlos a mano:

```bash
supabase gen types typescript --linked > src/types/database.types.ts
```

`supabase/verificar-rls.sql` **no es una migración**: es un script que se corre a mano
después de cualquier cambio de policies y prueba que sin fila en `admins` no se lee nada.

### Backup

> **⚠️ NO MONTADO Y NO VERIFICADO.** Ver §8 del documento de diseño. Si se pierde el
> histórico de pagos no se reconstruye desde ningún lado — G-Vento no sabe nada de plata.
