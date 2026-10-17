/** El reconocedor casi nunca escribe "dux": lo oye como ducks, ducs o duks. */
const HEY = new Set(['hey', 'ei', 'ey', 'hei'])
const DUX = new Set(['dux', 'ducks', 'ducs', 'duks', 'doox', 'ducxs'])
const FUSED = new Set(['heydux', 'heyducks', 'heyducs', 'heyduks', 'eydux', 'eidux', 'heidux'])

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
}

function wakeSpan(tokens: string[]): { at: number; length: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (FUSED.has(tokens[i])) return { at: i, length: 1 }
    if (i < tokens.length - 1 && HEY.has(tokens[i]) && DUX.has(tokens[i + 1])) return { at: i, length: 2 }
  }
  if (tokens.length > 0 && DUX.has(tokens[0])) return { at: 0, length: 1 }
  return null
}

/** true si la frase es "Hey Dux", solo "dux", o una transcripcion cercana (ducks, ducs...). */
export function detectWakeWord(text: string): 'hey dux' | null {
  if (!text) return null
  return wakeSpan(tokensOf(text)) ? 'hey dux' : null
}

/**
 * Quita la frase de activacion del inicio.
 * "hey dux enciende el motor" → "enciende el motor".
 */
export function stripWakeWords(text: string): string {
  const tokens = tokensOf(text)
  const span = wakeSpan(tokens)
  if (span && span.at === 0) return tokens.slice(span.length).join(' ').trim()
  return tokens.join(' ').trim()
}

/** Separa la activacion del comando dicho en la misma frase. */
export function splitWake(text: string): { woke: boolean; command: string } {
  const tokens = tokensOf(text)
  const span = wakeSpan(tokens)
  if (!span) return { woke: false, command: '' }
  return { woke: true, command: tokens.slice(span.at + span.length).join(' ').trim() }
}

/** Muestra "dux" cuando el reconocedor escribio ducks, ducs u otra forma clara del nombre. */
export function fixEco(text: string): string {
  return text.replace(/\b(ducks|ducs|duks|doox|ducxs)\b/gi, 'dux')
}
