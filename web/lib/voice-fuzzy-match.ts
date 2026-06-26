function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }

  return dp[m][n]
}

export function similitud(a: string, b: string): number {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase())
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - dist / maxLen
}

export function findBestSensorMatch(
  spoken: string,
  sensores: readonly string[],
  threshold = 0.75,
): string | null {
  const normalized = spoken.trim().toLowerCase()
  if (!normalized) return null

  let best: string | null = null
  let bestScore = 0

  for (const sensor of sensores) {
    const score = similitud(normalized, sensor)
    if (score > bestScore) {
      bestScore = score
      best = sensor
    }
    if (normalized.includes(sensor) || sensor.includes(normalized)) {
      return sensor
    }
  }

  return bestScore >= threshold ? best : null
}

export interface FuzzyPhrase {
  id: string
  frases: string[]
}

export const FUZZY_VOICE_PHRASES: FuzzyPhrase[] = [
  {
    id: 'ALARMS_QUERY',
    frases: [
      'hay alarmas',
      'tengo alarmas',
      'existen alarmas activas',
      'alarmas activas',
      'muestrame las alarmas',
      'estado de las alarmas',
    ],
  },
  {
    id: 'FIREBASE_STATUS',
    frases: [
      'esta conectada la pagina a firebase',
      'esta conectado firebase',
      'estado de la conexion',
      'firebase esta activo',
      'hay conexion con firebase',
    ],
  },
  {
    id: 'CONSUMPTION_CURRENT',
    frases: [
      'cual es el consumo actual',
      'cuanto estoy consumiendo',
      'cuanta potencia se esta usando',
      'consumo actual del sistema',
    ],
  },
  {
    id: 'CONSUMPTION_VARIATION',
    frases: [
      'como ha variado la potencia hoy',
      'como ha variado el consumo hoy',
      'ha cambiado mucho el consumo hoy',
      'variacion de potencia de hoy',
    ],
  },
  {
    id: 'FAN_CONSUMPTION',
    frases: [
      'cual es el consumo del ventilador',
      'cuanto consume el ventilador',
      'consumo actual del ventilador',
      'potencia del ventilador',
    ],
  },
  {
    id: 'WIFI_NETWORK',
    frases: [
      'a que red estoy conectado',
      'cual es la red wifi',
      'a que wifi esta conectado el sistema',
      'cual es mi conexion actual',
    ],
  },
  {
    id: 'TIME_NOW',
    frases: ['que hora es', 'dime la hora', 'que hora es ahora', 'hora actual'],
  },
  {
    id: 'DATE_TODAY',
    frases: ['que dia es hoy', 'dime la fecha', 'fecha actual', 'que fecha es hoy'],
  },
  {
    id: 'MODE_AUTO_START',
    frases: [
      'a que hora se inicio el modo automatico',
      'cuando empezo el modo automatico',
      'a que hora entro en automatico',
    ],
  },
  {
    id: 'MODE_AUTO_END',
    frases: [
      'a que hora se apago el modo automatico',
      'cuando termino el modo automatico',
      'a que hora salio del modo automatico',
    ],
  },
  {
    id: 'MODE_MANUAL_START',
    frases: [
      'a que hora se inicio el modo manual',
      'cuando inicio el modo manual',
      'a que hora entro en manual',
    ],
  },
  {
    id: 'MODE_CURRENT',
    frases: [
      'en que modo esta el sistema',
      'que modo esta activo',
      'estoy en modo automatico o manual',
    ],
  },
  {
    id: 'UPTIME',
    frases: [
      'cuanto tiempo lleva encendido el sistema',
      'desde cuando esta activo el sistema',
      'tiempo de actividad del sistema',
      'hace cuanto se encendio',
    ],
  },
  {
    id: 'SYSTEM_HEALTH',
    frases: [
      'como esta el sistema',
      'hay algun error en el sistema',
      'estado general del sistema',
      'esta todo funcionando bien',
      'diagnostico del sistema',
    ],
  },
  {
    id: 'SETPOINT_QUERY',
    frases: [
      'cual es el setpoint actual',
      'que setpoint tengo',
      'a cuanto esta el setpoint',
      'cual es la temperatura configurada',
    ],
  },
]

const UMBRAL_EXACTO = 0.85

export function matchFuzzyVoiceCommand(text: string): { id: string; score: number } | null {
  const normalized = text.trim().toLowerCase()
  let bestId: string | null = null
  let bestScore = 0

  for (const group of FUZZY_VOICE_PHRASES) {
    for (const frase of group.frases) {
      const score = similitud(normalized, frase)
      if (score > bestScore) {
        bestScore = score
        bestId = group.id
      }
    }
  }

  if (bestId && bestScore >= UMBRAL_EXACTO) {
    return { id: bestId, score: bestScore }
  }

  return null
}
