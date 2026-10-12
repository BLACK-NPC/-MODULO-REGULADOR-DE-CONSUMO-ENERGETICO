/** El reconocedor casi nunca escribe "eco": lo oye como echo, eko o hecho. */
const HEY = new Set(['hey', 'ei', 'ey', 'hei'])
const ECO = new Set(['eco', 'echo', 'eko', 'ego', 'ecco', 'ecko', 'equo', 'heco', 'eico', 'eiko', 'aiko', 'echos', 'hecho'])
const FUSED = new Set(['heyeco', 'heyeko', 'heyecho', 'heyego', 'heyecco', 'heyheco', 'eyeco', 'eyeko', 'eyecho'])

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
    if (i < tokens.length - 1 && HEY.has(tokens[i]) && ECO.has(tokens[i + 1])) return { at: i, length: 2 }
  }
  if (tokens.length > 0 && ECO.has(tokens[0])) return { at: 0, length: 1 }
  return null
}

/** true si la frase es "Hey Eco", solo "eco", o una transcripcion cercana (echo, hecho...). */
export function detectWakeWord(text: string): 'hey eco' | null {
  if (!text) return null
  return wakeSpan(tokensOf(text)) ? 'hey eco' : null
}

/**
 * Quita la frase de activacion del inicio.
 * "hey echo enciende el motor" → "enciende el motor".
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

/** Muestra "eco" cuando el reconocedor escribio echo, eko u otra forma clara del nombre. */
export function fixEco(text: string): string {
  return text.replace(/\b(echo|eko|ecko|ecco|equo|heco|eico|eiko|aiko|echos)\b/gi, 'eco')
}
