/**
 * Banco de frases del mayordomo: varias formas de decir lo mismo, sin repetir la ultima.
 * Solo contiene frases propias del asistente (acuses, saludos, avisos); las respuestas con
 * datos siguen saliendo de voice-commands.ts y voice-ext-run.ts.
 */

const ultimas = new Map<string, number>()

/** Elige una variante distinta de la anterior para la misma clave. */
export function variar(clave: string, opciones: string[]): string {
  if (opciones.length === 1) return opciones[0]
  const previa = ultimas.get(clave)
  let indice = Math.floor(Math.random() * opciones.length)
  if (indice === previa) indice = (indice + 1) % opciones.length
  ultimas.set(clave, indice)
  return opciones[indice]
}

export function saludoDelDia(fecha: Date = new Date()): string {
  const hora = fecha.getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export const frases = {
  /** Despierta con "Hey Eco" sin orden. */
  teEscucho: () => variar('escucho', ['Dígame, señor.', 'Lo escucho, señor.', 'A sus órdenes, señor.']),

  /** La sesion termino por falta de respuesta (hay que tocar el microfono para volver). */
  retiro: () => variar('retiro', [
    'Me retiro, señor. Toque el micrófono cuando me necesite.',
    'Quedo a un lado, señor. Toque el micrófono y vuelvo enseguida.',
  ]),

  /** Respuesta a "hola" una vez que ya esta escuchando. */
  saludo: () => `${saludoDelDia()}, señor. ${variar('saludo', [
    '¿En qué puedo ayudarle?',
    'Estoy atento a lo que necesite.',
    'A sus órdenes.',
  ])} Si lo desea, diga ayuda y le cuento qué puedo hacer.`,

  abriendo: (destino: string) => variar('abriendo', [
    `Enseguida, señor. Abriendo ${destino}.`,
    `Como ordene. Abriendo ${destino}.`,
    `Con gusto, señor. Abriendo ${destino}.`,
  ]),

  noEntendi: () => variar('no-entendi', [
    'No le entendí, señor. ¿Podría repetirlo, por favor?',
    'Disculpe, señor, no logré entenderle. ¿Me lo repite, por favor?',
    'Perdone, señor, no le oí con claridad. ¿Podría repetirlo?',
  ]),
}
