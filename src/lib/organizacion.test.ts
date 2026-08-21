/**
 * Modo de fallo que atrapa: **que una diferencia de mayúscula bloquee una
 * vinculación correcta.**
 *
 * Es el error que G-Vento anticipó antes de que lo cometiéramos. Si la
 * comparación de nombres fuera exacta, transcribir «labcentro» donde ellos
 * escribieron «LabCentro» daría desacuerdo sobre un UUID perfecto — y el
 * operador aprendería a ignorar el aviso, que es peor que no tenerlo.
 */
import { describe, it, expect } from 'vitest'
import { esUuid, nombresDifieren, normalizarNombre } from './organizacion'

describe('el UUID es lo único verificable de este lado', () => {
  it('acepta el de LabCentro', () => {
    expect(esUuid('266d4b37-a630-4782-9cc9-8cb054494211')).toBe(true)
  })

  it('acepta con espacios alrededor: pegar arrastra espacios', () => {
    expect(esUuid('  266d4b37-a630-4782-9cc9-8cb054494211  ')).toBe(true)
  })

  it('rechaza lo que no tiene forma de UUID', () => {
    for (const malo of ['', 'LabCentro', '266d4b37', '266d4b37-a630-4782-9cc9']) {
      expect(esUuid(malo), malo).toBe(false)
    }
  })

  it('la forma es lo ÚNICO que prueba: un UUID inventado pasa igual', () => {
    // Queda escrito acá para que nadie lea `esUuid` como una verificación de
    // que la organización existe. No hay a quién preguntarle.
    expect(esUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
  })
})

describe('los nombres se comparan normalizados, nunca exactos', () => {
  it('una diferencia de mayúscula NO es una diferencia', () => {
    expect(nombresDifieren('LabCentro', 'labcentro')).toBe(false)
  })

  it('espacios en los bordes o repetidos tampoco', () => {
    expect(nombresDifieren('  LabCentro  ', 'LabCentro')).toBe(false)
    expect(nombresDifieren('Lab  Centro', 'Lab Centro')).toBe(false)
  })

  it('dos organizaciones distintas sí difieren', () => {
    expect(nombresDifieren('LabCentro', 'Salchimelo')).toBe(true)
  })

  it('sin nombre viejo no hay nada que comparar, y eso no es un desacuerdo', () => {
    // Es el caso de la primera vinculación: antes no había nombre. Devolver
    // `true` acá haría aparecer un aviso de discrepancia en el caso normal.
    expect(nombresDifieren(null, 'LabCentro')).toBe(false)
  })

  it('normalizar es para comparar, no para guardar', () => {
    // Lo que se guarda es lo que el operador escribió: es el registro de qué
    // leyó. Este test fija que la normalización no destruye ese dato.
    expect(normalizarNombre('  LabCentro  ')).toBe('labcentro')
  })
})
