let arrancoHabla = false
let textoEnCurso = ''

export function getArrancoHabla() {
  return arrancoHabla
}
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
let audioActual: HTMLAudioElement | null = null
let urlActual: string | null = null
let corteVoz: AbortController | null = null

function pararReproductor() {
  corteVoz?.abort()
  corteVoz = null
  if (audioActual) {
    audioActual.onended = null
    audioActual.onerror = null
    audioActual.pause()
    audioActual.removeAttribute('src')
    audioActual.load()
    audioActual = null
  }
  if (urlActual) {
    URL.revokeObjectURL(urlActual)
    urlActual = null
  }
}

function decirJorge(text: string, mio: number): Promise<'ok' | 'no'> {
  if (typeof window === 'undefined' || !text.trim()) return Promise.resolve('no')
  const ctrl = new AbortController()
  corteVoz = ctrl
  return fetch('/api/voz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: text.slice(0, 600) }),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok || mio !== turno) return 'no'
    const blob = await res.blob()
    if (mio !== turno || blob.size === 0) return 'no'
    const url = URL.createObjectURL(blob)
    urlActual = url
    const audio = new Audio(url)
    audioActual = audio
    audio.playbackRate = Math.min(1.15, Math.max(0.85, speechRate))
    return new Promise<'ok' | 'no'>((resolve) => {
      const cerrar = (bien: 'ok' | 'no') => {
        isSpeaking = false
        if (audioActual === audio) audioActual = null
        if (urlActual === url) {
          URL.revokeObjectURL(url)
          urlActual = null
        }
        resolve(bien)
      }
      audio.onplaying = () => {
        if (mio !== turno) {
          audio.pause()
          cerrar('no')
          return
        }
        isSpeaking = true
        arrancoHabla = true
      }
      audio.onended = () => cerrar('ok')
      audio.onerror = () => cerrar('no')
      audio.play().then(() => {
        if (mio !== turno) {
          audio.pause()
          cerrar('no')
        }
      }).catch(() => cerrar('no'))
    })
  }).catch(() => 'no')
}

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

const MALE_NAME = /\b(jorge|alvaro|andres|pablo|raul|diego|enrique|carlos|gonzalo|male|hombre)\b/i
const FEMALE_NAME = /\b(helena|sabina|laura|elvira|monica|paulina|sofia|lucia|maria|elena|dalia|female|mujer)\b/i
const NATURAL = /natural|neural|wavenet|premium/i

function pickSpanishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !window.speechSynthesis) return undefined
  const voices = window.speechSynthesis.getVoices().filter((voz) => voz.lang.toLowerCase().startsWith('es'))
  const puntaje = (voz: SpeechSynthesisVoice) => {
    const nombre = voz.name
    let puntos = 0
    const natural = NATURAL.test(nombre)
    const hombre = MALE_NAME.test(nombre) && !FEMALE_NAME.test(nombre)
    if (natural && hombre) puntos += 40
    else if (natural) puntos += 24
    else if (hombre) puntos += 8
    if (/\bjorge\b/i.test(nombre)) puntos += 6
    if (/google/i.test(nombre) && natural) puntos += 4
    if (voz.lang.toLowerCase().startsWith('es-mx') || voz.lang.toLowerCase().startsWith('es-419')) puntos += 3
    else if (voz.lang.toLowerCase().startsWith('es-co')) puntos += 2
    if (voz.localService && !natural) puntos -= 8
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
    const natural = voice ? /natural|neural|wavenet/i.test(voice.name) : false
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
    utterance.rate = natural ? Math.min(speechRate, 0.94) : speechRate
    utterance.pitch = natural ? 1 : speechPitch

    const finish = () => {
      isSpeaking = false
      if (activeUtterance === utterance) activeUtterance = null
      resolve()
    }

    utterance.onstart = () => {
      isSpeaking = true
      arrancoHabla = true
    }
    utterance.onend = finish
    utterance.onerror = finish

    activeUtterance = utterance
    window.speechSynthesis.resume()
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

function vocesListas() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve()
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const seguir = () => {
      window.speechSynthesis.onvoiceschanged = preloadVoices
      resolve()
    }
    window.speechSynthesis.onvoiceschanged = seguir
    window.setTimeout(seguir, 700)
  })
}

export function speak(text: string, lang = 'es-CO'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  const mio = ++turno
  arrancoHabla = false
  textoEnCurso = text
  pararReproductor()
  const frases = frasesDe(text)

  const correr = (indice: number): Promise<void> => {
    if (mio !== turno || indice >= frases.length) return Promise.resolve()
    const lanzar = () => decir(frases[indice], lang).then(() => {
      if (mio !== turno || indice >= frases.length - 1) return
      return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 280)
      }).then(() => correr(indice + 1))
    })
    if (isIOS && indice === 0) return new Promise((resolve) => setTimeout(resolve, 120)).then(lanzar)
    return lanzar()
  }

  const pulso = window.setInterval(() => {
    if (mio === turno && window.speechSynthesis?.speaking) window.speechSynthesis.resume()
  }, 4000)

  return decirJorge(text, mio).then((resultado) => {
    if (mio !== turno || resultado === 'ok' || !window.speechSynthesis) return
    return vocesListas().then(() => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 80)
    })).then(() => {
      if (mio !== turno) return
      window.speechSynthesis.resume()
      return correr(0)
    })
  }).finally(() => {
    window.clearInterval(pulso)
    if (mio === turno) textoEnCurso = ''
  })
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  turno += 1
  textoEnCurso = ''
  isSpeaking = false
  activeUtterance = null
  pararReproductor()
  window.speechSynthesis?.cancel()
}

export function pauseSpeaking(): void {
  if (typeof window === 'undefined' || !isSpeaking) return
  audioActual?.pause()
  window.speechSynthesis?.pause()
}

export function resumeSpeaking(): void {
  if (typeof window === 'undefined') return
  audioActual?.play().catch(() => undefined)
  window.speechSynthesis?.resume()
}
