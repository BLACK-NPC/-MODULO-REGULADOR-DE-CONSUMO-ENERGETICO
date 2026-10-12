let activeUtterance: SpeechSynthesisUtterance | null = null
let isSpeaking = false
let speechRate = 0.9
const speechPitch = 0.82

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

const MALE_NAME = /\b(pablo|alvaro|raul|jorge|diego|enrique|carlos|andres|juan|miguel|antonio|male|hombre)\b/i
const FEMALE_NAME = /\b(helena|sabina|laura|elvira|monica|paulina|sofia|lucia|maria|elena|female|mujer)\b/i

function pickSpanishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !window.speechSynthesis) return undefined
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
  const males = voices.filter((v) => MALE_NAME.test(v.name) && !FEMALE_NAME.test(v.name))
  return (
    males.find((v) => v.lang.toLowerCase().startsWith('es-co') && v.localService) ??
    males.find((v) => v.localService) ??
    males[0] ??
    voices.find((v) => v.localService) ??
    voices[0]
  )
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

export function speak(text: string, lang = 'es-CO'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }

    window.speechSynthesis.cancel()

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

    // iOS requiere cancel() + setTimeout para evitar bloqueo del sintetizador.
    if (isIOS) {
      window.speechSynthesis.cancel()
      setTimeout(() => window.speechSynthesis.speak(utterance), 120)
    } else {
      window.speechSynthesis.speak(utterance)
    }
  })
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
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
