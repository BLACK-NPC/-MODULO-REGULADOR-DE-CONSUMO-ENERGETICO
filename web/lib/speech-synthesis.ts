let textoEnCurso = ''
let activeUtterance: SpeechSynthesisUtterance | null = null

export function getSpeakingText() {
  return textoEnCurso
}

function plano(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
}

/** true si lo escuchado es el propio asistente, no una frase nueva del usuario. */
export function esEcoDeLaVoz(heard: string) {
  if (!textoEnCurso || !heard.trim()) return false
  const dichas = plano(textoEnCurso).split(/\s+/).filter((palabra) => palabra.length > 2)
  const oidas = plano(heard).split(/\s+/).filter((palabra) => palabra.length > 2)
  if (oidas.length === 0) return true
  const propias = new Set(dichas)
  return oidas.every((palabra) => propias.has(palabra))
}
let isSpeaking = false
let speechRate = 0.98
const speechPitch = 1
let turno = 0

const isIOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

/** Fuerza la carga de voces en Chrome (son asincronas la primera vez). */
function preloadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.getVoices()
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = preloadVoices
  preloadVoices()
}

const MALE_NAME = /\b(pablo|alvaro|raul|jorge|diego|enrique|carlos|andres|juan|miguel|antonio|gonzalo|male|hombre)\b/i
const FEMALE_NAME = /\b(helena|sabina|laura|elvira|monica|paulina|sofia|lucia|maria|elena|female|mujer)\b/i
const NATURAL = /natural|neural|premium|enhanced|google|online/i

function pickSpanishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !window.speechSynthesis) return undefined
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
  const puntaje = (voz: SpeechSynthesisVoice) => {
    const nombre = voz.name
    let puntos = 0
    if (MALE_NAME.test(nombre) && !FEMALE_NAME.test(nombre)) puntos += 8
    if (NATURAL.test(nombre)) puntos += 10
    if (voz.lang.toLowerCase().startsWith('es-co')) puntos += 3
    else if (/^es-(mx|es)/i.test(voz.lang)) puntos += 1
    if (voz.localService && !NATURAL.test(nombre)) puntos -= 3
    return puntos
  }
  return [...voices].sort((a, b) => puntaje(b) - puntaje(a))[0]
}

export function getIsSpeaking(): boolean {
  return isSpeaking
}

export function getSpeechRate(): number {
  return speechRate
}

/** Ajusta la velocidad de sintesis (rango 0.5–2.0). Devuelve el valor final. */
export function setSpeechRate(rate: number): number {
  speechRate = Math.max(0.5, Math.min(2.0, rate))
  return speechRate
}

function decir(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = speechRate
    utterance.pitch = speechPitch

    const voice = pickSpanishVoice()
    if (voice) utterance.voice = voice

    const finish = () => {
      isSpeaking = false
      if (activeUtterance === utterance) activeUtterance = null
      resolve()
    }

    utterance.onstart = () => { isSpeaking = true }
    utterance.onend = finish
    utterance.onerror = finish

    activeUtterance = utterance
    window.speechSynthesis.speak(utterance)
  })
}

function frasesDe(text: string) {
  const partes = text
    .split(/(?<=[.!?;])\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
  return partes.length > 0 ? partes : [text]
}

export function speak(text: string, lang = 'es-CO'): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve()

  const mio = ++turno
  textoEnCurso = text
  window.speechSynthesis.cancel()
  const frases = frasesDe(text)

  const correr = (indice: number): Promise<void> => {
    if (mio !== turno || indice >= frases.length) return Promise.resolve()
    const lanzar = () => decir(frases[indice], lang).then(() => {
      if (mio !== turno || indice >= frases.length - 1) return
      return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 160)
      }).then(() => correr(indice + 1))
    })
    if (isIOS && indice === 0) return new Promise((resolve) => setTimeout(resolve, 120)).then(lanzar)
    return lanzar()
  }

  return correr(0).finally(() => {
    if (mio === turno) textoEnCurso = ''
  })
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  turno += 1
  textoEnCurso = ''
  isSpeaking = false
  activeUtterance = null
  window.speechSynthesis?.cancel()
}

export function pauseSpeaking(): void {
  if (typeof window === 'undefined' || !isSpeaking) return
  window.speechSynthesis?.pause()
}

export function resumeSpeaking(): void {
  if (typeof window === 'undefined') return
  window.speechSynthesis?.resume()
}
