# G-Centro — contexto del proyecto

Panel de control de suscripciones. Repo propio, proyecto de Supabase propio.
No comparte código ni base con G-Vento.

---

## Reglas permanentes

Estas no se renegocian por prompt. Si algo de una tarea puntual las contradice,
avisá antes de proceder.

### 1. El documento manda

**`docs/g-centro-diseno-v1.md` es la fuente de verdad.** Leerlo antes de tocar
esquema, estados o modelo de datos.

Si el código termina contradiciendo el documento, **se actualiza el documento en
el mismo commit** que introduce el cambio. Un documento que quedó atrás del repo
es peor que no tener documento: se sigue leyendo y ya miente.

### 2. G-Vento es producción — no se toca

G-Vento tiene **clientes reales facturando hoy** (G-10 y Salchimelo). Su rama
`main` es producción.

**No se modifica nada en el repo de G-Vento sin permiso explícito de Alejandro**,
ni siquiera si encontrás algo roto, ni siquiera si el arreglo es de una línea.
Se reporta y se espera. Un cambio "obvio" en un POS un viernes a la noche es
exactamente el que deja a un bar sin poder cobrar.

Esto incluye migraciones, Edge Functions, dependencias y archivos de config.
Leer G-Vento para comparar o diagnosticar: siempre bien.

### 3. Tipos de Supabase: generados, nunca a mano

`supabase gen types typescript` o nada. Escribirlos a mano produce tipos que
compilan y mienten — en G-Vento eso costó 129 errores de una sola vez cuando la
base y los tipos se desincronizaron.

**Deuda actual:** `src/types/database.types.ts` está escrito a mano porque el
proyecto de Supabase todavía no existe. Regenerarlo apenas haya `supabase link`
y borrar esta nota.

### 4. No se reporta un bloque como completo sin correr el camino real

Un smoke test con credenciales placeholder **no es verificación**. Que el bundle
transforme y que `tsc` pase no dice nada sobre si el login funciona, si la
policy deniega, o si el trigger dispara.

- `tsc` no prueba el SQL. RLS, triggers y vistas se verifican ejecutando contra
  la base con datos reales.
- Si no se pudo ejecutar el camino real, **el reporte lo dice explícitamente**
  y nombra qué quedó sin verificar. No se redacta como si estuviera probado.

### 5. Antes de decir "esto viene heredado de otro repo", verificarlo ahí

Afirmar que un bug, un patrón o una decisión viene de G-Vento (o de G-Quota, o
de donde sea) **exige abrir ese repo y confirmarlo**. Si no se puede, se dice
**"no verificado"** y se sigue.

Esto no es teórico: en el Bloque 1 se reportó un bug como "heredado de G-Vento,
idéntico" cuando en realidad se había introducido al copiar el archivo — el
visor mostraba los bytes NUL como espacios. La afirmación sin verificar mandó
al usuario a pedir un arreglo en producción que no hacía falta.

### 6. Convención Giiron (§2 del documento)

- **Español de Colombia** en UI, dominio y base de datos.
- **COP en pesos enteros**, sin decimales. `$79.000` se guarda como `79000`
  en `integer`.
- **`snake_case`** en tablas y columnas. `PascalCase` en componentes.
  `useCamelCase` en hooks. `camelCase` en variables y funciones.
- Tipos de evento en **MAYÚSCULAS**.
- **`timestamptz` para instantes** (`creado_en`, `registrado_en`).
  **`date` para fechas de calendario** (`fecha_pago`, `cubre_desde`,
  `proximo_cobro`). No mezclarlos: un cobro es un día del calendario
  colombiano, no un instante, y tratarlo como timestamp corre los bordes de mes.
- **UUID v4** para todos los identificadores.
- Rama **`develop`**. Nunca commit directo a `main`.
- **Conventional Commits**, commits atómicos.

---

## Stack

React 18 · TypeScript strict · Vite · Tailwind · lucide-react ·
Zustand · React Query · Zod en los bordes · date-fns ·
Supabase (Postgres + Auth + Edge Functions) · Sentry.

Repo único, `src/` normal. Sin monorepo.

## Comandos

```
pnpm dev          # servidor de desarrollo
pnpm build        # build de producción
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test:unit    # vitest run
```

## Migraciones

Cada cambio de esquema va en un **archivo nuevo** dentro de `supabase/`.
**Nunca editar una migración ya aplicada.**

Excepción vigente: mientras nada esté aplicado al dashboard,
`supabase/schema-inicial.sql` se sigue editando en su lugar.

`supabase/verificar-rls.sql` prueba que sin fila en `admins` no se lee nada.
Correrlo después de cualquier cambio de policies.

## Duplicación deliberada

`src/lib/sentry.ts` es una copia casi idéntica de `gvento/src/lib/sentry.ts`.
Está declarado en el encabezado del propio archivo. **Un cambio en el redactor
obliga a revisar la otra copia en la misma sesión** — sujeto a la regla 2 para
cualquier modificación efectiva en G-Vento.

Los tests de `src/lib/sentry.test.ts` marcados como "BLOQUE ESPEJO" están
duplicados caso por caso desde G-Vento y deben pasar igual en los dos repos.

## Estado

**Bloque 1 (cimientos y seguridad): código completo, sin aplicar al dashboard.**

Hecho: scaffold, catálogo (`productos`, `terminos`, `planes`) y `admins`,
RLS deny-by-default vía `es_admin()`, auth email + TOTP obligatorio, Sentry,
vitest.

Pendiente de Alejandro: correr `schema-inicial.sql` y `verificar-rls.sql` en el
dashboard, desactivar el registro público, crear el primer admin.

Sin cargar: los precios de `planes` (falta el número del contador; el modelo ya
no bloquea — §9.1 resuelta: base gravable SIN IVA).

Fuera de alcance hasta nuevo aviso: clientes, suscripciones, pagos,
`banderas_pendientes`, Edge Functions.
