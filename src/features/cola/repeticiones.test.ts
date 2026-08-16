/**
 * Que una repetición se marque como repetición.
 *
 * Es §5 hecho pantalla, no cosmética: la cola crece por LLAMADA y dos filas
 * seguidas con el mismo nivel son dos clics, no un duplicado. Si esto se
 * rompe, alguien sale a buscar un bug que no existe — o peor, alguien
 * "arregla" la cola borrando filas que son auditoría.
 */
import { describe, it, expect } from 'vitest'
import { conRepeticiones } from './repeticiones'
import type { FilaCola } from './schemas'

const SUS_A = '11111111-1111-4111-8111-111111111111'
const SUS_B = '22222222-2222-4222-8222-222222222222'

let n = 0
function fila(suscripcion_id: string, valor_deseado: FilaCola['valor_deseado']): FilaCola {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    suscripcion_id,
    valor_deseado,
    intentos: 1,
    ultimo_error: null,
    bandera_error_codigo: null,
    cambio_efectivo: true,
    mensaje: null,
    confirmado_en: '2026-08-16T10:00:00Z',
    creado_en: '2026-08-16T10:00:00Z',
    admin_id: null,
    admins: null,
    suscripciones: { clientes: { nombre_comercial: 'X', es_prueba: false } },
  }
}
const marcas = (f: FilaCola[]) => conRepeticiones(f).map((x) => x.repetida)

describe('conRepeticiones', () => {
  it('la fila que repite el nivel del mismo cliente se marca', () => {
    // Orden de la consulta: más NUEVA primero. La [0] es la segunda en el
    // tiempo, así que es la que repite.
    expect(marcas([fila(SUS_A, 'gracia'), fila(SUS_A, 'gracia')])).toEqual([true, false])
  })

  it('la PRIMERA en el tiempo nunca se marca', () => {
    // Si se invirtiera el sentido, la nota «repite el anterior» quedaría en
    // la fila equivocada — y diría que el primer clic repite a algo que no
    // había pasado todavía.
    const r = conRepeticiones([fila(SUS_A, 'gracia'), fila(SUS_A, 'gracia')])
    expect(r[r.length - 1].repetida).toBe(false)
  })

  it('un nivel distinto NO es repetición, aunque sea el mismo cliente', () => {
    expect(marcas([fila(SUS_A, 'activa'), fila(SUS_A, 'gracia')])).toEqual([false, false])
  })

  it('el mismo nivel en OTRO cliente no es repetición', () => {
    // Dos clientes puestos en gracia el mismo día no tienen nada que ver.
    expect(marcas([fila(SUS_A, 'gracia'), fila(SUS_B, 'gracia')])).toEqual([false, false])
  })

  it('tres seguidas: se marcan las dos últimas en llegar', () => {
    expect(marcas([fila(SUS_A, 'gracia'), fila(SUS_A, 'gracia'), fila(SUS_A, 'gracia')])).toEqual([
      true,
      true,
      false,
    ])
  })

  it('una repetición interrumpida por otro nivel se corta', () => {
    // gracia · activa · gracia, de más nueva a más vieja: ninguna repite a la
    // inmediatamente anterior.
    expect(marcas([fila(SUS_A, 'gracia'), fila(SUS_A, 'activa'), fila(SUS_A, 'gracia')])).toEqual([
      false,
      false,
      false,
    ])
  })

  it('intercalar otro cliente no rompe la detección del propio', () => {
    // A · B · A: la primera A no repite a la última A, porque entre medio
    // hubo otra fila. Se compara con la inmediatamente anterior, no con la
    // última del mismo cliente — que es lo que la pantalla muestra.
    expect(marcas([fila(SUS_A, 'gracia'), fila(SUS_B, 'gracia'), fila(SUS_A, 'gracia')])).toEqual([
      false,
      false,
      false,
    ])
  })

  it('no pierde ni reordena filas', () => {
    const filas = [fila(SUS_A, 'gracia'), fila(SUS_B, 'activa'), fila(SUS_A, 'gracia')]
    expect(conRepeticiones(filas).map((x) => x.f.id)).toEqual(filas.map((f) => f.id))
  })

  it('lista vacía y de un solo elemento', () => {
    expect(conRepeticiones([])).toEqual([])
    expect(marcas([fila(SUS_A, 'gracia')])).toEqual([false])
  })
})
