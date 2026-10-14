let arrancoHabla = false
let textoEnCurso = ''

export function getArrancoHabla() {
  if (arrancoHabla) return true
  if (typeof window === 'undefined') return false
  const marca = window as Window & { __jorgeSono?: number }
  return marca.__jorgeSono === 1 || !!window.speechSynthesis?.speaking
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

const memoriaAudio = new Map<string, Blob>()
const viajesAudio = new Map<string, Promise<Blob | null>>()

function huella(texto: string) {
  let hash = 0
  for (let i = 0; i < texto.length; i += 1) hash = (Math.imul(hash, 31) + texto.charCodeAt(i)) | 0
  return String(hash)
}

function leerGuardado(texto: string): Blob | null {
  const listo = memoriaAudio.get(texto)
  if (listo) return listo
  if (typeof window === 'undefined') return null
  try {
    const crudo = window.localStorage.getItem(`ecopulse-jorge-${huella(texto)}`)
    if (!crudo) return null
    const bin = atob(crudo)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    memoriaAudio.set(texto, blob)
    return blob
  } catch {
    return null
  }
}

function guardarAudio(texto: string, blob: Blob) {
  memoriaAudio.set(texto, blob)
  if (blob.size > 180_000 || typeof window === 'undefined') return
  void blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
    try {
      window.localStorage.setItem(`ecopulse-jorge-${huella(texto)}`, btoa(bin))
    } catch {
      /* el navegador puede negar espacio */
    }
  }).catch(() => undefined)
}

function pedirAudio(texto: string): Promise<Blob | null> {
  const clave = texto.slice(0, 600)
  const guardado = leerGuardado(clave)
  if (guardado) return Promise.resolve(guardado)
  const viaje = viajesAudio.get(clave)
  if (viaje) return viaje
  const previo = clave === 'Hola señor.' && typeof window !== 'undefined'
    ? (window as Window & { __jorgeListo?: Promise<Blob | null> }).__jorgeListo
    : undefined
  const trabajo = (previo ?? fetch('/api/voz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: clave }),
  }).then(async (res) => {
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size ? blob : null
  })).then((blob) => {
    if (!blob?.size) return null
    guardarAudio(clave, blob)
    return blob
  }).catch(() => null).finally(() => {
    if (viajesAudio.get(clave) === trabajo) viajesAudio.delete(clave)
  })
  viajesAudio.set(clave, trabajo)
  return trabajo
}

export function prepararVoz(texto: string) {
  const partes = texto.split(/(?<=[.!?;])\s+/).map((parte) => parte.trim()).filter(Boolean)
  if (partes.length > 1) {
    void pedirAudio(partes[0])
    void pedirAudio(partes.slice(1).join(' '))
    return
  }
  void pedirAudio(texto)
}

function decirJorge(text: string, mio: number): Promise<'ok' | 'no' | 'bloqueado'> {
  if (typeof window === 'undefined' || !text.trim()) return Promise.resolve('no')
  const marca = window as Window & { __jorgeAudio?: HTMLAudioElement; __jorgeSono?: number; __saludoNav?: number }
  if (text.startsWith('Hola señor') && marca.__saludoNav === 1) return Promise.resolve('ok')
  if (text.startsWith('Hola señor') && marca.__jorgeAudio && marca.__jorgeSono === 1) {
    const audio = marca.__jorgeAudio
    audioActual = audio
    isSpeaking = !audio.ended
    arrancoHabla = true
    if (audio.ended) {
      isSpeaking = false
      return Promise.resolve('ok')
    }
    return new Promise((resolve) => {
      audio.onended = () => {
        isSpeaking = false
        if (audioActual === audio) audioActual = null
        resolve('ok')
      }
    })
  }
  return pedirAudio(text).then((blob) => {
    if (text.startsWith('Hola señor') && marca.__saludoNav === 1) return 'ok'
    if (text.startsWith('Hola señor') && marca.__jorgeAudio && marca.__jorgeSono === 1) {
      const audio = marca.__jorgeAudio
      audioActual = audio
      isSpeaking = !audio.ended
      arrancoHabla = true
      if (audio.ended) {
        isSpeaking = false
        return 'ok'
      }
      return new Promise<'ok'>((resolve) => {
        audio.onended = () => {
          isSpeaking = false
          if (audioActual === audio) audioActual = null
          resolve('ok')
        }
      })
    }
    if (!blob || mio !== turno) return 'no'
    const url = URL.createObjectURL(blob)
    urlActual = url
    const audio = new Audio(url)
    audioActual = audio
    audio.playbackRate = Math.min(1.15, Math.max(0.85, speechRate))
    return new Promise<'ok' | 'no' | 'bloqueado'>((resolve) => {
      const cerrar = (bien: 'ok' | 'no' | 'bloqueado') => {
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
      }).catch((error: unknown) => {
        const bloqueado = error instanceof DOMException && error.name === 'NotAllowedError'
        cerrar(bloqueado ? 'bloqueado' : 'no')
      })
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
  const marca = window as Window & { __saludoNav?: number; __saludoFin?: number }
  if (marca.__saludoNav === 1) {
    arrancoHabla = true
    return new Promise<void>((resolve) => {
      const ver = () => {
        if (marca.__saludoFin === 1 || mio !== turno) resolve()
        else window.setTimeout(ver, 200)
      }
      ver()
    }).finally(() => {
      if (mio === turno) textoEnCurso = ''
    })
  }
  pararReproductor()
  const frases = frasesDe(text)
  const primera = frases.length > 1 && !leerGuardado(text) ? frases[0] : ''
  const resto = primera ? frases.slice(1).join(' ') : ''
  if (primera) {
    void pedirAudio(primera)
    void pedirAudio(resto)
  }

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

  const jorge = primera
    ? decirJorge(primera, mio).then((resultado) => {
      const voz = window as Window & { __saludoNav?: number }
      if (voz.__saludoNav === 1) return 'ok' as const
      if (resultado !== 'ok' || mio !== turno) return resultado
      return decirJorge(resto, mio)
    })
    : decirJorge(text, mio)

  return jorge.then((resultado) => {
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
