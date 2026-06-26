/** Palabras clave en espanol e ingles para activar el modo de comando. */
export const WAKE_WORDS = ['hey', 'ok', 'okay', 'hola', 'oye'] as const
export type WakeWord = (typeof WAKE_WORDS)[number]

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Detecta si el texto contiene una palabra clave por coincidencia de token completo.
 * Devuelve la palabra encontrada o null.
 */
export function detectWakeWord(text: string): WakeWord | null {
  if (!text) return null
  const tokens = tokenize(text)
  for (const word of WAKE_WORDS) {
    if (tokens.includes(word)) return word
  }
  return null
}

/**
 * Elimina palabras clave del inicio del texto para dejar solo el comando.
 * Ejemplo: "hey enciende el motor" → "enciende el motor"
 */
export function stripWakeWords(text: string): string {
  const tokens = tokenize(text)
  while (tokens.length > 0 && (WAKE_WORDS as readonly string[]).includes(tokens[0])) {
    tokens.shift()
  }
  return tokens.join(' ').trim()
}
