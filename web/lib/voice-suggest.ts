import { VOICE_COMMAND_GROUPS } from '@/lib/voice-command-menu'
import { frases } from '@/lib/voice-frases'

/**
 * Cuando Eco no entiende una orden: lo dice con educacion, pide repetirla y,
 * si lo oido se parece a algo del catalogo de comandos, sugiere "tal vez quiso decir...".
 */

const SIN_PESO = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u', 'que', 'es', 'esta',
  'como', 'cual', 'cuales', 'por', 'para', 'con', 'mi', 'me', 'te', 'se', 'lo', 'le', 'hay', 'dame', 'dime',
  'quiero', 'quisiera', 'favor', 'porfavor', 'puedes', 'puede', 'eco', 'hey', 'las', 'si', 'no',
])

/** Sinonimos habituales -> palabra con la que aparece en el catalogo. */
const CANON: Record<string, string> = {}
function alias(canonica: string, ...otras: string[]) {
  for (const palabra of otras) CANON[palabra] = canonica
}
alias('enciende', 'encender', 'enciendo', 'encienda', 'prende', 'prender', 'prendas', 'arranca', 'arrancar', 'arranque', 'inicia', 'iniciar')
alias('apaga', 'apagar', 'apague', 'apago', 'deten', 'detener', 'detiene', 'detenga')
alias('sube', 'subir', 'suba', 'aumenta', 'aumentar', 'incrementa')
alias('baja', 'bajar', 'reduce', 'reducir', 'disminuye')
alias('consumo', 'gasto', 'gaste', 'gastado', 'energia')
alias('falla', 'fallas', 'fallo', 'fallos', 'error', 'errores', 'averia', 'averias', 'problema', 'problemas')
alias('alarmas', 'alarma', 'alerta', 'alertas')
alias('motor', 'motores')
alias('abre', 'abrir', 'abra', 'muestra', 'mostrar')

function plano(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
}

function palabras(texto: string): string[] {
  return plano(texto)
    .split(/\s+/)
    .filter((palabra) => palabra && !SIN_PESO.has(palabra))
    .map((palabra) => CANON[palabra] ?? palabra)
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let anterior = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const temporal = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1))
      anterior = temporal
    }
  }
  return fila[b.length]
}

/** 0..1: cuanto se parece lo oido a una palabra del catalogo. */
function parecido(oida: string, esperada: string): number {
  if (oida === esperada) return 1
  if (oida.length < 3 || esperada.length < 3) return 0
  const minimo = Math.min(oida.length, esperada.length)
  let prefijo = 0
  while (prefijo < minimo && oida[prefijo] === esperada[prefijo]) prefijo += 1
  if (prefijo >= 5 || (prefijo >= 4 && minimo <= 5)) return 0.85
  const razon = 1 - distancia(oida, esperada) / Math.max(oida.length, esperada.length)
  return razon >= 0.7 ? razon : 0
}

const CATALOGO = VOICE_COMMAND_GROUPS.flatMap((grupo) => grupo.commands.map((comando) => comando.cmd))
  // Frases larguisimas de ejemplo no sirven como sugerencia hablada.
  .filter((cmd) => cmd.length <= 48)
  .map((cmd) => ({ cmd, claves: palabras(cmd) }))

const UMBRAL = 0.33
const MAX_SUGERENCIAS = 3

/** Comandos del catalogo que se parecen a lo que se oyo (puede devolver vacio). */
export function sugerirComandos(oido: string): string[] {
  const oidas = palabras(oido)
  if (oidas.length === 0) return []

  const puntuados = CATALOGO.map(({ cmd, claves }) => {
    let total = 0
    let acierto = 0
    let fuerte = false
    for (const clave of claves) {
      const peso = /^\d+$/.test(clave) ? 1 : clave.length
      total += peso
      let mejor = 0
      for (const oida of oidas) mejor = Math.max(mejor, parecido(oida, clave))
      acierto += mejor * peso
      if (mejor >= 0.8 && clave.length >= 4) fuerte = true
    }
    return { cmd, puntaje: total ? acierto / total : 0, fuerte }
  })
    .filter((item) => item.fuerte && item.puntaje >= UMBRAL)
    .sort((a, b) => b.puntaje - a.puntaje)

  if (puntuados.length === 0) return []
  const mejor = puntuados[0].puntaje
  return puntuados
    .filter((item) => item.puntaje >= mejor - 0.2)
    .slice(0, MAX_SUGERENCIAS)
    .map((item) => item.cmd.charAt(0).toLowerCase() + item.cmd.slice(1))
}

/** Respuesta hablada cuando no se entendio la orden. */
export function mensajeNoEntendi(oido: string): string {
  const sugerencias = sugerirComandos(oido)
  const noEntendi = frases.noEntendi()
  if (sugerencias.length === 0) return noEntendi
  const lista = sugerencias.length === 1
    ? sugerencias[0]
    : `${sugerencias.slice(0, -1).join(', ')} o ${sugerencias[sugerencias.length - 1]}`
  return `${noEntendi} Tal vez quiso decir: ${lista}.`
}
