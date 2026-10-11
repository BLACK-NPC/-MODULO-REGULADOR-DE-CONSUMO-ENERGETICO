/**
 * Lenguaje natural en español para el asistente de voz: normalizacion de texto,
 * numeros hablados, horas, rangos de horas, dias y duraciones.
 * Sin dependencias del resto de la app para poder probarlo aislado.
 */

export const DAY_KEYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const
export const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

export function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b([ap])\s?\.\s?m\b\.?/g, '$1m')
    .replace(/[^a-z0-9:%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT = new Map<string, number>(
  Object.entries({
    cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
    veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  }),
)
const TENS = new Map<string, number>(
  Object.entries({ treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 }),
)

/** Cambia numeros escritos con letras por digitos ("treinta y cinco" -> "35"). Recibe texto ya normalizado. */
export function wordsToDigits(t: string): string {
  const w = t.split(' ')
  const out: string[] = []
  for (let i = 0; i < w.length; i += 1) {
    const x = w[i]
    if (x === 'veinte' || TENS.has(x)) {
      const base = x === 'veinte' ? 20 : (TENS.get(x) as number)
      const next = UNIT.get(w[i + 2] ?? '')
      if (w[i + 1] === 'y' && next !== undefined && next >= 1 && next <= 9) {
        out.push(String(base + next))
        i += 2
        continue
      }
      out.push(String(base))
      continue
    }
    if (x === 'cien' || x === 'ciento') {
      out.push('100')
      continue
    }
    if (UNIT.has(x)) {
      out.push(String(UNIT.get(x)))
      continue
    }
    out.push(x)
  }
  return out.join(' ')
}

/** Texto listo para analizar: sin acentos, sin signos, numeros en digitos. */
export function prep(raw: string): string {
  return wordsToDigits(norm(raw))
    .replace(/\b(a|de|desde|hasta|entre|y|para|por) la una\b/g, '$1 la 1')
    .replace(/\bmedio dia\b/g, 'mediodia')
    .replace(/\bmedia noche\b/g, 'medianoche')
}

export function firstInt(t: string): number | null {
  const m = t.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/* ------------------------------------------------------------------ horas */

export interface Clock {
  h: number
  m: number
  index: number
  end: number
  explicit: boolean
}

function to24(h: number, period?: string, ampm?: string): number {
  if (ampm === 'am') return h === 12 ? 0 : h
  if (ampm === 'pm') return h < 12 ? h + 12 : h
  switch (period) {
    case 'manana':
      return h
    case 'madrugada':
      return h === 12 ? 0 : h
    case 'tarde':
      return h < 12 ? h + 12 : h
    case 'noche':
      if (h === 12) return 0
      return h >= 6 && h < 12 ? h + 12 : h
    default:
      return h
  }
}

const CLOCK_RE = new RegExp(
  '(?:\\b(?:la|las)\\s+(\\d{1,2})(?::(\\d{2}))?|\\b(\\d{1,2}):(\\d{2})|\\b(\\d{1,2})(?=\\s*(?:am|pm)\\b)|\\b(\\d{1,2})(?=\\s+(?:de la|en la|del)\\s+(?:manana|tarde|noche|madrugada|mediodia)\\b)|\\b(mediodia|medianoche)\\b)' +
    '(?:\\s+(?:y|con)\\s+(media|cuarto|\\d{1,2})\\b|\\s+menos\\s+(cuarto|\\d{1,2})\\b)?' +
    '(?:\\s+horas?\\b)?' +
    '(?:\\s+(?:de la|en la|del)\\s+(manana|tarde|noche|madrugada|dia|mediodia)\\b|\\s*\\b(am|pm)\\b)?',
  'g',
)

/** Horas sueltas dentro de un texto preparado con prep(). */
export function parseClocks(t: string): Clock[] {
  const out: Clock[] = []
  const re = new RegExp(CLOCK_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1
      continue
    }
    let h: number
    let min = 0
    let explicit = false
    if (m[7]) {
      h = m[7] === 'mediodia' ? 12 : 0
      explicit = true
    } else {
      h = Number(m[1] ?? m[3] ?? m[5] ?? m[6])
      min = Number(m[2] ?? m[4] ?? 0)
    }
    if (m[8]) {
      min = m[8] === 'media' ? 30 : m[8] === 'cuarto' ? 15 : Number(m[8])
    }
    if (m[9]) {
      const rest = m[9] === 'cuarto' ? 15 : Number(m[9])
      h -= 1
      min = 60 - rest
      if (h < 0) h += 12
    }
    if (!m[7]) {
      const hh = to24(h, m[10], m[11])
      explicit = Boolean(m[10] || m[11]) || h >= 13
      h = hh
    }
    if (h === 24) h = 0
    if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) continue
    out.push({ h, m: min, index: m.index, end: m.index + m[0].length, explicit })
  }
  return out
}

const RANGE_RE = new RegExp(
  '(?:desde|de|entre)\\s+(?:las?\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:(?:de la|en la|del)\\s+(manana|tarde|noche|madrugada))?\\s+(?:hasta|a|y)\\s+(?:las?\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(?:horas?)?\\s*(?:(am|pm)|(?:(?:de la|en la|del)\\s+(manana|tarde|noche|madrugada|mediodia)))?',
)

export interface HourRange {
  from: number
  /** Hasta 48: si pasa de 24 cruza la medianoche. */
  to: number
}

const PERIODS: Record<string, HourRange> = {
  manana: { from: 6, to: 12 },
  tarde: { from: 12, to: 18 },
  noche: { from: 18, to: 24 },
  madrugada: { from: 0, to: 6 },
}

/** Rango de horas pedido en la frase ("desde las 8 hasta las 12", "de 6 a 9 de la noche", "en la tarde"). */
export function parseHourRange(t: string, now = new Date()): HourRange | null {
  const last = t.match(/\bultim[ao]s?\s+(\d+)?\s*horas?\b/)
  if (last) {
    const n = Math.max(1, Number(last[1] ?? 1))
    const h = now.getHours()
    return { from: Math.max(0, h - n + 1), to: h + 1 }
  }

  const r = t.match(RANGE_RE)
  if (r) {
    const h1raw = Number(r[1])
    const h2raw = Number(r[5])
    const m2 = Number(r[6] ?? 0)
    if (h1raw <= 24 && h2raw <= 24) {
      const p2 = r[8]
      const am2 = r[7]
      const h2 = to24(h2raw, p2, am2) === 0 ? 24 : to24(h2raw, p2, am2)
      let h1 = to24(h1raw, r[4], r[3])
      if (!r[3] && !r[4] && (p2 || am2)) {
        const inherited = to24(h1raw, p2, am2)
        if (inherited < h2) h1 = inherited
      }
      const to = h2 + (m2 > 0 && h2 < 24 ? 1 : 0)
      if (to === h1) return null
      return { from: h1, to: to > h1 ? to : to + 24 }
    }
  }

  const clocks = parseClocks(t)
  if (clocks.length >= 2) {
    const a = clocks[0]
    const b = clocks[1]
    const to = b.h + (b.m > 0 ? 1 : 0)
    if (to === a.h) return null
    return { from: a.h, to: to > a.h ? to : to + 24 }
  }

  const p = t.match(/\b(?:en|durante|por|esta|de)\s+(?:la\s+)?(manana|tarde|noche|madrugada)\b/)
  if (p) return PERIODS[p[1]]
  return null
}

/* ------------------------------------------------------------------- dias */

export type DayRef = { kind: 'day'; idx: number } | { kind: 'week' }

const DAY_INDEX: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
}

export function parseDayRef(t: string, now = new Date()): DayRef | null {
  const today = now.getDay()
  if (/\b(antes de ayer|antier|anteayer)\b/.test(t)) return { kind: 'day', idx: (today + 5) % 7 }
  if (/\bayer\b/.test(t)) return { kind: 'day', idx: (today + 6) % 7 }
  if (/\b(hoy|esta manana|esta tarde|esta noche)\b/.test(t)) return { kind: 'day', idx: today }
  if (/\b(esta semana|la semana|semana pasada|ultima semana|ultimos 7 dias|semanal)\b/.test(t)) return { kind: 'week' }
  const d = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?\b/)
  if (d) return { kind: 'day', idx: DAY_INDEX[d[1]] }
  return null
}

/** Dias de la semana como mascara de bits del HMI: bit 0 = lunes ... bit 6 = domingo. */
export function parseDaysMask(t: string): number | null {
  if (/\b(todos los dias|toda la semana|cada dia|diario|diaria|diariamente|lunes a domingo)\b/.test(t)) return 0x7f
  if (/\b(entre semana|dias laborales|dias habiles|dias de semana)\b/.test(t)) return 0x1f
  if (/\b(fines? de semana|findes?)\b/.test(t)) return 0x60
  const order = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
  const range = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?\s+(?:a|hasta)\s+(?:el\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?\b/)
  if (range) {
    let i = order.indexOf(range[1])
    const end = order.indexOf(range[2])
    let mask = 0
    for (let n = 0; n < 7; n += 1) {
      mask |= 1 << i
      if (i === end) break
      i = (i + 1) % 7
    }
    return mask
  }
  let mask = 0
  order.forEach((name, bit) => {
    if (new RegExp(`\\b${name}s?\\b`).test(t)) mask |= 1 << bit
  })
  return mask === 0 ? null : mask
}

/* -------------------------------------------------------------- duraciones */

/** Duracion en minutos ("30 minutos", "2 horas", "una hora y media", "media hora"). */
export function parseDurationMinutes(t: string): number | null {
  if (/\bmedia hora\b/.test(t)) return 30
  if (/\bun cuarto de hora\b/.test(t)) return 15
  const hm = t.match(/\b(\d+|una|un)\s*(?:horas?|hs|h)\b(?:\s*(?:y|con)\s*(\d+|media)\s*(?:minutos?|min)?)?/)
  if (hm) {
    const hours = hm[1] === 'una' || hm[1] === 'un' ? 1 : Number(hm[1])
    const extra = hm[2] === 'media' ? 30 : Number(hm[2] ?? 0)
    return hours * 60 + extra
  }
  const mm = t.match(/\b(\d+)\s*(?:minutos?|mins?)\b/)
  if (mm) return Number(mm[1])
  const ss = t.match(/\b(\d+)\s*segundos?\b/)
  if (ss) return Math.max(1, Math.ceil(Number(ss[1]) / 60))
  return null
}

/* ------------------------------------------------------------ al hablar */

export function fmt(n: number, decimals = 1): string {
  const p = 10 ** decimals
  return String(Math.round(n * p) / p).replace('.', ',')
}

export function decirHora(h: number, m = 0): string {
  if (h === 0 && m === 0) return 'medianoche'
  if (h === 12 && m === 0) return 'mediodía'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const periodo = h < 6 ? 'de la madrugada' : h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche'
  const art = h12 === 1 ? 'la' : 'las'
  const mm = m === 0 ? '' : m === 30 ? ' y media' : m === 15 ? ' y cuarto' : ` y ${m}`
  return `${art} ${h12}${mm} ${periodo}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function etiquetaDia(idx: number, now = new Date()): string {
  const today = now.getDay()
  if (idx === today) return 'hoy'
  if (idx === (today + 6) % 7) return 'ayer'
  return `el ${DAY_NAMES[idx]}`
}

export const SI_RE = /\b(si|dale|claro|ok|okay|confirmo|confirma|confirmado|guarda|guardalo|guardala|listo|hazlo|adelante|correcto|afirmativo|de acuerdo|perfecto|exacto|asi es)\b/
export const NO_RE = /\b(no|cancela|cancelar|cancelalo|olvidalo|mejor no|negativo|detente|deja asi|nada)\b/
