/**
 * Plantillas del mensaje del banner, por nivel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ESTE ES EL ÚNICO TEXTO DE TODO EL PROYECTO QUE LEE ALGUIEN QUE NO ES
 * UN OPERADOR DE GIIRON.
 *
 * Lo lee el cajero de un bar, en el mostrador, con clientes esperando. No
 * eligió estar ahí, no sabe qué es G-Centro, y probablemente no sea quien
 * decide si se paga. De ahí salen las reglas de redacción de abajo — no son
 * preferencias de estilo, son consecuencias de quién lo lee y dónde.
 *
 * §6: como `restringida` y `suspendida` quedaron casi idénticas en efecto,
 * **el mensaje ES la palanca de cobranza** en los niveles altos.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * POR QUÉ VIVEN EN EL CÓDIGO Y NO EN UNA TABLA
 *
 * Una tabla sin pantalla de edición no mejora nada: mueve el cambio de «un
 * dev despliega» a «alguien abre el SQL Editor», que para un operador no
 * técnico es peor y más riesgoso.
 *
 * Y la plantilla es un PUNTO DE PARTIDA, no el texto final: el campo queda
 * editable, así que el costo del despliegue aplica sólo a cambiar el default,
 * no a mandar un texto distinto. Además `Record<Nivel, Plantilla>` hace que
 * un nivel sin plantilla no compile, igual que la traducción de §6.
 *
 * **Cuándo mudarlas a la base:** cuando alguien pida cambiar la redacción por
 * segunda o tercera vez, o cuando un operador no técnico necesite hacerlo.
 */
import type { Nivel } from './bandera'

export interface Plantilla {
  /** El texto que se propone. Vacío en `activa`: no hay nada que decir. */
  texto: string
  /** Qué busca lograr. Se muestra al operador, no al cliente. */
  intencion: string
}

/**
 * Reglas de redacción, y el porqué de cada una:
 *
 * · **Nunca acusa al que lee.** El cajero no decide los pagos. «Tu cuenta
 *   está vencida» le habla a alguien que no está en el mostrador.
 * · **Dice qué hacer y a quién buscar.** Un banner que informa un problema
 *   sin salida sólo genera una llamada de alguien que no puede resolverlo.
 * · **Nunca dice que algo se va a bloquear que no se bloquea.** §6 garantiza
 *   que vender, cobrar, facturar a la DIAN y exportar no se bloquean nunca.
 *   Amenazar con eso sería mentir, y la mentira se descubre en el peor
 *   momento posible.
 * · **Corto.** Un banner persistente que nadie termina de leer deja de
 *   comunicar y se vuelve ruido que se aprende a ignorar.
 *
 * ⚠️ Y AHORA, ADEMÁS, TIENEN QUE ENTRAR EN `MENSAJE_MAX`. Cuando el límite
 * bajó a 140 (19/08/2026), `restringida` tenía 177 y `suspendida` 209: las dos
 * ofrecían al operador un texto que el puente iba a rechazar con un 400. Lo
 * fija `plantillas.test.ts`, que antes no existía — nada garantizaba que una
 * plantilla entrara en el límite que el mismo repo impone.
 *
 * Al reescribirlas se conservó lo que no es negociable: nombrar qué NO se
 * bloquea —facturar a la DIAN— y decir por dónde escribir. Lo que se perdió
 * es adorno: «hace varios días», «comunicate con nosotros para reactivarla».
 */
export const PLANTILLAS: Record<Nivel, Plantilla> = {
  activa: {
    texto: '',
    intencion: 'Sin banner. Nada que comunicar.',
  },
  por_vencer: {
    texto:
      'Tu suscripción a G-Vento vence pronto. Escribinos por WhatsApp para coordinar el pago y evitar interrupciones.',
    intencion: 'Avisar con tiempo. Todavía no hay nada vencido.',
  },
  gracia: {
    texto:
      'La suscripción a G-Vento está vencida. Todo sigue funcionando normalmente; escribinos por WhatsApp para ponerte al día.',
    intencion:
      'Marcar que ya venció, dejando claro que no cambia nada todavía. La urgencia es del mensaje, no del sistema.',
  },
  restringida: {
    texto:
      'La suscripción a G-Vento está vencida. Reportes y configuración quedan en pausa; vender y facturar sigue igual. Escribinos por WhatsApp.',
    intencion:
      'Nombrar exactamente qué se pausó Y qué no. Que el cajero pueda decirle a su jefe qué pasa sin exagerarlo.',
  },
  suspendida: {
    texto:
      'Suscripción suspendida por falta de pago. Vender y facturar a la DIAN siguen igual; lo administrativo, en pausa. Escribinos por WhatsApp.',
    intencion:
      'Máxima presión posible sin mentir. Lo que se bloquea es lo administrativo — el nivel más alto de la escalera no impide operar (§6).',
  },
}

/** Largo del texto que efectivamente viaja, después de recortar los bordes. */
export function largoEfectivo(texto: string): number {
  return texto.trim().length
}
