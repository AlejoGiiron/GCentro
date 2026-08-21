/**
 * El vínculo con una organización de G-Vento.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL NOMBRE NO ES IDENTIDAD. LO QUE IDENTIFICA ES EL UUID.
 *
 * Corrección de diseño de G-Vento (20/08/2026), aceptada, por dos razones
 * independientes:
 *
 * · Su `unique` sobre `organizations.name` distingue mayúsculas y espacios:
 *   «labcentro» y «LabCentro» son dos nombres distintos allá. Comparar exacto
 *   daría FALSO DESACUERDO sobre un UUID correcto — y una alarma que salta
 *   cuando todo está bien enseña a ignorar la alarma.
 * · El nombre es MUTABLE y el UUID no. El día que renombren una organización,
 *   el par deja de coincidir sin que nada esté mal. Un chequeo que se rompe
 *   solo con el tiempo no es un chequeo.
 *
 * Entonces: el nombre existe **para que un humano lo lea antes de confirmar**.
 * Si se compara, se compara normalizado, y **advierte en vez de bloquear**.
 * El valor del mecanismo nunca estuvo en la comparación automática —no hay a
 * quién preguntarle, el contrato tiene una sola llamada y escribe— sino en
 * que escribir obliga a leer en vez de pegar.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Forma de un UUID v4, que es lo ÚNICO que se puede verificar de este lado. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function esUuid(v: string): boolean {
  return UUID.test(v.trim())
}

/**
 * Para COMPARAR, nunca para guardar.
 *
 * Lo que se guarda es lo que el operador escribió, con los bordes recortados:
 * es el registro de qué leyó, y bajarlo a minúsculas lo falsearía.
 */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * ¿Los dos nombres son distintos como para mencionarlo?
 *
 * Se usa al CORREGIR un vínculo: si el nombre nuevo es el mismo de antes,
 * probablemente lo que se está arreglando es el UUID y no la organización.
 * Nunca bloquea nada.
 */
export function nombresDifieren(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false
  return normalizarNombre(a) !== normalizarNombre(b)
}
