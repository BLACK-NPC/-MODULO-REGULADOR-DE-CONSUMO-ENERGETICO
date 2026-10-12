import { NO_RE, SI_RE, prep } from '@/lib/voice-nlu'

/** Acciones que la pantalla ya sabe hacer. La voz no inventa botones: solo les pone una frase. */
export type AccionPantalla = {
  id: string
  op: 'separar' | 'unir' | 'ocultar' | 'mostrar'
  metrica: 'temperatura' | 'humedad' | 'potencia'
  frase: string
}

const CLAVE = 'ecopulse-voz-aprendido'
const DIALOGO_MS = 90_000

const METRICA: Record<AccionPantalla['metrica'], string> = {
  humedad: 'la humedad',
  temperatura: 'la temperatura',
  potencia: 'la potencia',
}

const HECHO: Record<AccionPantalla['op'], string> = {
  separar: 'Separé',
  unir: 'Volví a unir',
  ocultar: 'Oculté',
  mostrar: 'Mostré',
}

const OPS: { op: AccionPantalla['op']; re: RegExp }[] = [
  { op: 'unir', re: /\b(une|unir|junta|juntar|devuelve|devolver|regresa|regresar)\b/ },
  { op: 'separar', re: /\b(separa\w*|aparta\w*|aisla\w*|saca|sacar)\b/ },
  { op: 'ocultar', re: /\b(oculta\w*|esconde\w*|esconder)\b/ },
  { op: 'mostrar', re: /\b(muestra\w*|mostrar|ensena\w*)\b/ },
]

type Guardada = { phrase: string; accion: AccionPantalla }
type Dialogo = { phrase: string; accion: AccionPantalla; expires: number }

let dialogo: Dialogo | null = null

export type ResultadoAprender = { text: string; run?: AccionPantalla }

function metricaDe(t: string): AccionPantalla['metrica'] | null {
  if (/\b(humedad|humedo)\b/.test(t)) return 'humedad'
  if (/\b(temperatura|calor)\b/.test(t)) return 'temperatura'
  if (/\b(potencia|vatios|watts?)\b/.test(t)) return 'potencia'
  return null
}

/** Si la frase pide una accion que Monitoreo ya tiene, devuelve esa accion. */
export function reconocerAccionPantalla(raw: string): AccionPantalla | null {
  const t = prep(raw)
  const metrica = metricaDe(t)
  const op = OPS.find((item) => item.re.test(t))?.op
  if (!metrica || !op) return null
  const id = `monitoreo.${op}.${metrica}`
  const verbo = op === 'separar' ? 'separar' : op === 'unir' ? 'volver a unir' : op === 'ocultar' ? 'ocultar' : 'mostrar'
  return { id, op, metrica, frase: `${verbo} ${METRICA[metrica]}` }
}

function leer(): Guardada[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CLAVE)
    const data = raw ? (JSON.parse(raw) as Guardada[]) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function guardar(lista: Guardada[]) {
  window.localStorage.setItem(CLAVE, JSON.stringify(lista))
}

export function ejecutarAprendida(raw: string): ResultadoAprender | undefined {
  const t = prep(raw)
  const item = leer().find((g) => g.phrase === t)
  if (!item) return undefined
  const a = item.accion
  return { text: `${HECHO[a.op]} ${METRICA[a.metrica]} en Monitoreo.`, run: a }
}

export function ofrecerAprender(raw: string): ResultadoAprender | undefined {
  const accion = reconocerAccionPantalla(raw)
  if (!accion) return undefined
  const phrase = prep(raw)
  if (leer().some((g) => g.phrase === phrase)) return undefined
  dialogo = { phrase, accion, expires: Date.now() + DIALOGO_MS }
  return {
    text: `No existe un comando para eso. En Monitoreo sí puedo ${accion.frase}. ¿Quieres que lo aprenda?`,
  }
}

export function continueLearn(raw: string, intentIsUnknown: boolean): ResultadoAprender | undefined {
  if (!dialogo) return undefined
  if (Date.now() > dialogo.expires) {
    dialogo = null
    return undefined
  }
  const t = prep(raw)
  if (!intentIsUnknown) {
    dialogo = null
    return undefined
  }
  if (NO_RE.test(t) && !SI_RE.test(t)) {
    dialogo = null
    return { text: 'Listo, no lo aprendí.' }
  }
  if (!SI_RE.test(t)) {
    dialogo.expires = Date.now() + DIALOGO_MS
    return { text: 'Dime sí para aprenderlo, o no para dejarlo.' }
  }
  const actual = dialogo
  dialogo = null
  const lista = leer().filter((g) => g.phrase !== actual.phrase)
  lista.push({ phrase: actual.phrase, accion: actual.accion })
  guardar(lista)
  const a = actual.accion
  return {
    text: `Listo. Aprendí esa frase para ${a.frase}. ${HECHO[a.op]} ${METRICA[a.metrica]} en Monitoreo.`,
    run: a,
  }
}
