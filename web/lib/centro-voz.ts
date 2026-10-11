export type PantallaVoz = 'vent' | 'ac' | 'gen'

export type AccionVoz =
  | 'vent_on' | 'vent_off' | 'vent_auto' | 'vent_manual' | 'vent_speed' | 'vent_sp'
  | 'ac_on' | 'ac_off' | 'ac_temp' | 'ac_up' | 'ac_down'
  | 'ac_cool' | 'ac_heat' | 'ac_fan' | 'ac_dry' | 'ac_auto'
  | 'fan_low' | 'fan_med' | 'fan_high' | 'fan_auto'
  | 'ac_swing' | 'ac_sleep' | 'ac_timer'
  | 'go_vent' | 'go_ac' | 'status'

export const ACCIONES: Record<AccionVoz, { nombre: string; pantalla: PantallaVoz; numero?: boolean }> = {
  vent_on: { nombre: 'Arrancar el motor', pantalla: 'vent' },
  vent_off: { nombre: 'Detener el motor', pantalla: 'vent' },
  vent_auto: { nombre: 'Pasar a modo automatico', pantalla: 'vent' },
  vent_manual: { nombre: 'Pasar a modo manual', pantalla: 'vent' },
  vent_speed: { nombre: 'Fijar velocidad (0-100 %)', pantalla: 'vent', numero: true },
  vent_sp: { nombre: 'Fijar temperatura objetivo', pantalla: 'vent', numero: true },
  ac_on: { nombre: 'Encender el aire', pantalla: 'ac' },
  ac_off: { nombre: 'Apagar el aire', pantalla: 'ac' },
  ac_temp: { nombre: 'Fijar temperatura (16-30 °C)', pantalla: 'ac', numero: true },
  ac_up: { nombre: 'Subir 1 °C', pantalla: 'ac' },
  ac_down: { nombre: 'Bajar 1 °C', pantalla: 'ac' },
  ac_cool: { nombre: 'Modo frio', pantalla: 'ac' },
  ac_heat: { nombre: 'Modo calor', pantalla: 'ac' },
  ac_fan: { nombre: 'Modo ventilador', pantalla: 'ac' },
  ac_dry: { nombre: 'Modo deshumidificar', pantalla: 'ac' },
  ac_auto: { nombre: 'Modo automatico', pantalla: 'ac' },
  fan_low: { nombre: 'Ventilador del aire: baja', pantalla: 'ac' },
  fan_med: { nombre: 'Ventilador del aire: media', pantalla: 'ac' },
  fan_high: { nombre: 'Ventilador del aire: alta', pantalla: 'ac' },
  fan_auto: { nombre: 'Ventilador del aire: auto', pantalla: 'ac' },
  ac_swing: { nombre: 'Alternar swing', pantalla: 'ac' },
  ac_sleep: { nombre: 'Alternar sleep', pantalla: 'ac' },
  ac_timer: { nombre: 'Alternar temporizador', pantalla: 'ac' },
  go_vent: { nombre: 'Ir a Ventilacion', pantalla: 'gen' },
  go_ac: { nombre: 'Ir a Aire acondicionado', pantalla: 'gen' },
  status: { nombre: 'Decir el estado de todo', pantalla: 'gen' },
}

export const PANTALLAS: Record<PantallaVoz, string> = {
  vent: 'Ventilacion',
  ac: 'Aire acondicionado',
  gen: 'General',
}

export function esAccion(valor: string): valor is AccionVoz {
  return valor in ACCIONES
}

const FABRICA: [AccionVoz, string][] = [
  ['vent_on', 'arranca el ventilador|enciende el motor|pon en marcha la ventilación'],
  ['vent_off', 'detén el ventilador|apaga el motor|para la ventilación'],
  ['vent_auto', 'modo automático ventilación|ventilación en automático'],
  ['vent_manual', 'modo manual ventilación|ventilación en manual'],
  ['vent_speed', 'velocidad {n} por ciento|pon el ventilador al {n}'],
  ['vent_sp', 'objetivo de ventilación {n} grados'],
  ['ac_on', 'enciende el aire|prende el aire acondicionado|activa el aire'],
  ['ac_off', 'apaga el aire|apaga el aire acondicionado'],
  ['ac_temp', 'pon el aire en {n} grados|temperatura {n} grados|ajusta a {n} grados'],
  ['ac_up', 'sube la temperatura|más calor|sube un grado'],
  ['ac_down', 'baja la temperatura|más frío|baja un grado'],
  ['ac_cool', 'modo frío'],
  ['ac_heat', 'modo calor'],
  ['ac_fan', 'modo ventilador'],
  ['ac_dry', 'deshumidifica|modo seco'],
  ['ac_auto', 'aire en automático'],
  ['fan_low', 'aire velocidad baja'],
  ['fan_med', 'aire velocidad media'],
  ['fan_high', 'aire velocidad alta'],
  ['fan_auto', 'aire velocidad automática'],
  ['ac_swing', 'activa el swing|aire oscilar'],
  ['ac_sleep', 'modo dormir|modo sleep'],
  ['ac_timer', 'temporizador del aire'],
  ['go_vent', 'abre ventilación|ve a ventilación'],
  ['go_ac', 'abre el aire acondicionado|ve al aire'],
  ['status', 'cómo está todo|dame el estado'],
]

export type ComandoVoz = { id: string; accion: AccionVoz; frases: string[]; activo: boolean }

export type AjustesVoz = {
  sensibilidad: number
  palabra: string
  palabraActiva: boolean
  continua: boolean
  hablar: boolean
}

export const AJUSTES_INICIALES: AjustesVoz = {
  sensibilidad: 75,
  palabra: 'ecopulse',
  palabraActiva: false,
  continua: false,
  hablar: true,
}

export function comandosDeFabrica(): ComandoVoz[] {
  return FABRICA.map(([accion, frases], i) => ({ id: `c${i}`, accion, frases: frases.split('|'), activo: true }))
}

const CLAVE_VOZ = 'ecopulse_voice'

export function cargarCentroVoz(): { ajustes: AjustesVoz; comandos: ComandoVoz[] } {
  const base = { ajustes: AJUSTES_INICIALES, comandos: comandosDeFabrica() }
  if (typeof window === 'undefined') return base
  try {
    const raw = window.localStorage.getItem(CLAVE_VOZ)
    if (!raw) return base
    return importarCentroVoz(JSON.parse(raw), base)
  } catch {
    return base
  }
}

export function guardarCentroVoz(ajustes: AjustesVoz, comandos: ComandoVoz[]) {
  try {
    window.localStorage.setItem(CLAVE_VOZ, JSON.stringify({ ajustes, comandos }))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export function importarCentroVoz(
  datos: unknown,
  base: { ajustes: AjustesVoz; comandos: ComandoVoz[] },
): { ajustes: AjustesVoz; comandos: ComandoVoz[] } {
  const d = (datos ?? {}) as { ajustes?: Partial<AjustesVoz>; comandos?: unknown }
  const comandos = Array.isArray(d.comandos)
    ? d.comandos
        .filter((c): c is ComandoVoz => !!c && typeof c === 'object' && esAccion(String((c as ComandoVoz).accion)))
        .map((c) => ({
          id: String(c.id),
          accion: c.accion,
          frases: Array.isArray(c.frases) ? c.frases.map(String) : [],
          activo: c.activo !== false,
        }))
    : base.comandos
  return { ajustes: { ...base.ajustes, ...(d.ajustes ?? {}) }, comandos }
}

/* ---- lenguaje ---- */

const NUMEROS: Record<string, number> = {}
'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve treinta'
  .split(' ')
  .forEach((w, i) => {
    NUMEROS[w] = i
  })
Object.assign(NUMEROS, { cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 })

const VACIAS = new Set('el la los las un una por favor de del en a al y que me te lo'.split(' '))

export function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9{}#]+/g, ' ')
    .trim()
}

export function tokenizar(s: string): { t: string[]; n: number | null } {
  let n: number | null = null
  const t = normalizar(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      if (w === '{n}' || w === '#') return '#'
      if (/^\d+$/.test(w)) {
        if (n === null) n = Number(w)
        return '#'
      }
      if (w in NUMEROS) {
        if (n === null) n = NUMEROS[w]
        return '#'
      }
      return w
    })
    .filter((w) => !VACIAS.has(w))
  return { t, n }
}

function levenshtein(a: string, b: string) {
  const m: number[][] = []
  for (let i = 0; i <= a.length; i++) m[i] = [i]
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return m[a.length][b.length]
}

export function parecidas(a: string, b: string) {
  return a === b || (a.length > 3 && b.length > 3 && levenshtein(a, b) <= 1)
}

function puntaje(dicho: string[], frase: string[]) {
  if (!frase.length || !dicho.length) return 0
  const usados = new Set<number>()
  let iguales = 0
  for (const t of frase) {
    const i = dicho.findIndex((x, k) => !usados.has(k) && parecidas(x, t))
    if (i >= 0) {
      usados.add(i)
      iguales++
    }
  }
  return (0.7 * iguales) / frase.length + (0.3 * iguales) / dicho.length
}

export function buscarComando(texto: string, comandos: ComandoVoz[]) {
  const dicho = tokenizar(texto)
  let mejor: { comando: ComandoVoz; frase: string; puntaje: number } | null = null
  for (const comando of comandos) {
    if (!comando.activo) continue
    for (const frase of comando.frases) {
      const p = puntaje(dicho.t, tokenizar(frase).t)
      if (!mejor || p > mejor.puntaje) mejor = { comando, frase, puntaje: p }
    }
  }
  return { mejor, numero: dicho.n }
}

/* ---- aire acondicionado (mismo estado que la pantalla de Aire) ---- */

const CLAVE_AIRE = 'ecopulse-aire'
export const AIRE_MIN = 16
export const AIRE_MAX = 30

export type ModoAire = 'cool' | 'heat' | 'fan' | 'dry' | 'auto'
export type VentiladorAire = 'low' | 'medium' | 'high' | 'auto'

export type EstadoAire = {
  encendido: boolean
  objetivo: number
  modo: ModoAire
  ventilador: VentiladorAire
  swing: boolean
  temporizador: boolean
  sleep: boolean
}

const AIRE_INICIAL: EstadoAire = {
  encendido: true,
  objetivo: 22,
  modo: 'cool',
  ventilador: 'medium',
  swing: false,
  temporizador: false,
  sleep: false,
}

export const MODO_AIRE: Record<ModoAire, string> = {
  cool: 'Frio',
  heat: 'Calor',
  fan: 'Ventilador',
  dry: 'Deshumidificar',
  auto: 'Automatico',
}

export const VENTILADOR_AIRE: Record<VentiladorAire, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  auto: 'Automatica',
}

export function cargarAire(): EstadoAire {
  if (typeof window === 'undefined') return AIRE_INICIAL
  try {
    const raw = window.localStorage.getItem(CLAVE_AIRE)
    if (!raw) return AIRE_INICIAL
    const parsed = JSON.parse(raw) as Partial<EstadoAire>
    const objetivo = Number(parsed.objetivo)
    return {
      ...AIRE_INICIAL,
      ...parsed,
      objetivo: Number.isFinite(objetivo) ? Math.min(AIRE_MAX, Math.max(AIRE_MIN, objetivo)) : AIRE_INICIAL.objetivo,
    }
  } catch {
    return AIRE_INICIAL
  }
}

export function guardarAire(estado: EstadoAire) {
  window.localStorage.setItem(CLAVE_AIRE, JSON.stringify(estado))
}
