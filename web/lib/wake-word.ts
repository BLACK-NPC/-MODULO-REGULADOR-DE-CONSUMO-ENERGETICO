/** Frase para empezar a escuchar: "Hey Eco". El reconocedor a veces escribe echo o eko. */
const HEY = new Set(['hey', 'ei', 'ey'])
const ECO = new Set(['eco', 'echo', 'eko', 'ego', 'ecco'])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function wakeAt(tokens: string[]): number {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (HEY.has(tokens[i]) && ECO.has(tokens[i + 1])) return i
  }
  return -1
}

/** true si la frase contiene "Hey Eco" (o una transcripcion cercana). */
export function detectWakeWord(text: string): 'hey eco' | null {
  if (!text) return null
  return wakeAt(tokenize(text)) >= 0 ? 'hey eco' : null
}

/**
 * Quita "Hey Eco" del inicio y devuelve el comando que venia despues.
 * "hey eco enciende el motor" → "enciende el motor". Si no hay frase, devuelve el texto normalizado.
 */
export function stripWakeWords(text: string): string {
  const tokens = tokenize(text)
  const at = wakeAt(tokens)
  if (at === 0) return tokens.slice(2).join(' ').trim()
  return tokens.join(' ').trim()
}

/** Separa la frase de activacion del comando dicho en la misma frase. */
export function splitWake(text: string): { woke: boolean; command: string } {
  const tokens = tokenize(text)
  const at = wakeAt(tokens)
  if (at < 0) return { woke: false, command: '' }
  return { woke: true, command: tokens.slice(at + 2).join(' ').trim() }
}
