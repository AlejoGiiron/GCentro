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

**Es el ÚNICO `.md` de `docs/` que es fuente de verdad.** Si aparece otro
—planilla de trabajo, borrador, tabla que alguien llenó a mano en una
conversación—, **no** es fuente de verdad: puede tener números viejos, preguntas
sin responder o decisiones que se revirtieron. No derives nada de ahí y no lo
uses para "corregir" el documento de diseño. **Preguntá.**

Pasó una vez: `docs/g-centro-planes-de-cobro.md` tenía precios de lista distintos
a los del esquema y una regla de redondeo que ya se había descartado. Si se
hubiera tomado como fuente, el catálogo salía con los precios equivocados.

Cuando el contenido de una planilla así ya esté fusionado acá, se borra. No se
deja "por las dudas": una segunda copia con números viejos es exactamente el
problema que la regla evita.

### 2. Este hilo NUNCA toca otro repo

**Solo se trabaja sobre G-Centro.** No se abre, no se lee y no se modifica
ningún otro repo — G-Vento incluido, y tampoco para comparar, diagnosticar o
copiar una implementación.

**No hay versión con permiso.** No es una regla sobre riesgo de producción que
un "dale, tocalo" pueda levantar: es una regla sobre el alcance de este hilo.
Si algo de otro repo hace falta, **se pide y el humano lo consigue**.

Si encontrás algo roto allá: **reportás y parás.** El reporte se lo pasa el
humano al hilo de ese repo, que decide y aplica en su propio contexto.

El motivo no es solo la separación: cuando un repo copia de otro a ciegas, se
lleva las decisiones que no le corresponden. Derivar cada lista del esquema
propio es lo que destapa los agujeros — pasó con el filtro de Sentry, donde
copiar la lista de claves habría dejado `razon_social` y `nit` fugando.

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

### 6. El filtro de privacidad es allowlist, y el esquema lo alimenta

**Un filtro de privacidad por deny-list no puede funcionar:** un nombre propio
es irreconocible por regex, y las columnas nuevas fugan calladas. El filtro es
**allowlist por clave**; el modo de fallo es **opacidad** (`[Filtrado:tipo]`),
nunca fuga.

No es una preferencia de implementación, es una propiedad de la categoría de
filtro. No se vuelve a deny-list "para no perder diagnóstico": la redacción
tipada conserva la forma, que es lo que hace vivible al allowlist.

**Agregar una tabla o columna al esquema obliga a agregarla a la tabla del test
de privacidad (`src/lib/sentry.test.ts`), en el mismo commit.** Si no la
agregás, el allowlist igual la redacta —ese es el punto de haberlo invertido—
pero perdés la verificación, que es el único lugar donde queda escrito qué se
consideró al diseñar el filtro.

### 7. Convención Giiron (§2 del documento)

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

`src/lib/sentry.ts` comparte diseño con el módulo equivalente de G-Vento, pero
**los dos repos no se tocan entre sí** (regla 2). La sincronización es por
**traspaso entre hilos**: un cambio de diseño acá produce un reporte que el
humano le pasa al otro hilo, que decide y aplica en su propio repo.

Se transfiere el **diseño** del filtro y el **método** de test.
No se transfiere la lista de columnas ni el allowlist de claves: cada repo los
deriva de SU esquema. Está declarado en el encabezado del propio archivo.

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
