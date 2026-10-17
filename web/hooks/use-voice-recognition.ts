'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent, marcarOfertaResumen } from '@/components/voice-assistant'
import { speak, stopSpeaking, esEcoDeLaVoz, getSpeakingText, getArrancoHabla, prepararVoz } from '@/lib/speech-synthesis'
import { detectWakeWord, fixEco, splitWake, stripWakeWords } from '@/lib/wake-word'
import { mensajeNoEntendi } from '@/lib/voice-suggest'
import { frases } from '@/lib/voice-frases'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'wake'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'unsupported'
  | 'error'

/** Tiempo sin hablar antes de apagar la sesion. */
function valeInterrumpir(heard: string) {
  if (!getSpeakingText() || esEcoDeLaVoz(heard)) return false
  const plano = heard.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (/^(si|no|silencio|callate|calla)$/.test(plano)) return true
  const palabras = plano.split(/\s+/).filter((palabra) => palabra.length > 3)
  return palabras.length >= 2
}

const INACTIVITY_TIMEOUT_MS = 15000
const SALUDO = 'Hola señor. ¿Qué tal se siente el día de hoy? ¿Desea que le dé el resumen del día? O, ¿quiere saber algún dato en particular?'
let saludoHecho = false
let saludoPromesa: Promise<void> | null = null
if (typeof window !== 'undefined') prepararVoz(SALUDO)

export function anticiparSaludo() {
  if (typeof window === 'undefined' || saludoPromesa) return
  if ((window as Window & { __recargando?: number }).__recargando) return
  saludoHecho = true
  // El reintento por toque del saludo lo gestiona el hook (alTocar), junto con la oferta de resumen.
  saludoPromesa = speak(SALUDO, 'es-CO', { reintentar: false })
}
/** Pausa tras terminar TTS antes de reabrir el microfono (Android/iOS). */
const POST_TTS_DELAY_MS = 500
/** Pausa antes de reiniciar recognition tras onend vacio. */
const RESTART_DELAY_MS = 300
/**
 * En Android Chrome cierra el microfono solo (continuous no se respeta) y cada
 * recognition.start() muestra el aviso del sistema. Reabrirlo al instante parece
 * que el microfono parpadea y, si coincide con el audio, corta la voz de Jorge.
 */
const RESTART_DELAY_ANDROID_MS = 1200

function esAndroid() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}
/** Silencio minimo tras la voz de Jorge antes de abrir el microfono (cola del eco). */
const COLA_ECO_MS = 650
/** Cada cuanto se comprueba si Jorge empezo a hablar con el microfono abierto. */
const VIGILANTE_VOZ_MS = 150
/** Confianza minima de una frase final; 0 = el navegador no la informa y se acepta. */
const MIN_CONFIANZA = 0.45
const MIN_CONFIANZA_WAKE = 0.55

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  /** Si true, la primera frase debe ser "Hey Dux" antes de aceptar comandos. */
  requireWakeWord?: boolean
  /** Arranca la escucha al abrir la pagina, sin pulsar el microfono. */
  handsFree?: boolean
  onCommand: (
    intent: VoiceIntent,
    signal?: AbortSignal
  ) => Promise<string | null> | string | null
  onSessionEnd?: () => void
}

export function useVoiceRecognition({
  lang = 'es-CO',
  requireWakeWord = false,
  handsFree = false,
  onCommand,
  onSessionEnd,
}: UseVoiceRecognitionOptions) {
  const [status, setStatus] = useState<VoiceRecognitionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [responseText, setResponseText] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onCommandRef = useRef(onCommand)
  const onSessionEndRef = useRef(onSessionEnd)
  const sessionActiveRef = useRef(false)
  /** true = esperando palabra clave antes de aceptar comandos */
  const wakePhaseRef = useRef(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyRef = useRef(false)
  const commandAbortRef = useRef<AbortController | null>(null)
  const commandGenerationRef = useRef(0)
  const pendingTranscriptRef = useRef('')
  const handsFreeRef = useRef(handsFree)
  const fromGestureRef = useRef(false)
  const pausedByUserRef = useRef(false)
  const interrumpioVozRef = useRef(false)
  const esperandoRespuestaSaludoRef = useRef(false)
  /** true mientras el reconocedor tiene el microfono abierto. */
  const micAbiertoRef = useRef(false)
  /** Ultimo instante en que se vio hablar a Jorge (turnos sin solapar). */
  const ultimaVozRef = useRef(0)
  /** Pulsar para hablar: true mientras el boton esta mantenido. */
  const pushRef = useRef(false)
  /** Lo dicho en tramos mientras se mantiene pulsado; se envia al soltar. */
  const pushBufferRef = useRef('')
  const [pushActivo, setPushActivo] = useState(false)
  const beginRef = useRef<(fromGesture: boolean) => void>(() => {})
  handsFreeRef.current = handsFree

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd
  }, [onSessionEnd])

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }, [])

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const abortCurrentCommand = useCallback(() => {
    commandGenerationRef.current += 1
    commandAbortRef.current?.abort()
    commandAbortRef.current = null
    stopSpeaking()
  }, [])

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false
    busyRef.current = false
    pendingTranscriptRef.current = ''
    pushRef.current = false
    pushBufferRef.current = ''
    setPushActivo(false)
    abortCurrentCommand()
    clearInactivityTimer()
    clearRestartTimer()
    try {
      recognitionRef.current?.abort()
    } catch {
      recognitionRef.current?.stop()
    }
    setStatus('idle')
    setTranscript('')
    onSessionEndRef.current?.()
  }, [abortCurrentCommand, clearInactivityTimer, clearRestartTimer])

  const scheduleInactivityTimeout = useCallback(() => {
    clearInactivityTimer()
    if (!sessionActiveRef.current) return
    if (getSpeakingText()) return
    if (pushRef.current) return
    if (wakePhaseRef.current && !esperandoRespuestaSaludoRef.current) return

    inactivityTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current) return
      if (pushRef.current) return
      if (getSpeakingText() || busyRef.current) {
        scheduleInactivityTimeout()
        return
      }

      if (esperandoRespuestaSaludoRef.current) {
        esperandoRespuestaSaludoRef.current = false
        marcarOfertaResumen(false)
        wakePhaseRef.current = true
        busyRef.current = false
        setStatus('wake')
        setTranscript('')
        tryStartListening(200)
        return
      }

      sessionActiveRef.current = false
      busyRef.current = true
      clearRestartTimer()
      try {
        recognitionRef.current?.abort()
      } catch {
        recognitionRef.current?.stop()
      }

      void speak(frases.retiro(), lang).finally(() => {
        busyRef.current = false
        setStatus('idle')
        setTranscript('')
        onSessionEndRef.current?.()
      })
    }, INACTIVITY_TIMEOUT_MS)
  }, [clearInactivityTimer, clearRestartTimer, lang])

  const tryStartListening = useCallback((delayMs = RESTART_DELAY_MS) => {
    const recognition = recognitionRef.current
    if (!recognition || !sessionActiveRef.current) return
    if (busyRef.current && !getSpeakingText()) return

    const armar = (espera: number) => {
      clearRestartTimer()
      restartTimerRef.current = setTimeout(() => {
        if (!sessionActiveRef.current) return
        if (busyRef.current && !getSpeakingText()) return

        // Turnos: el microfono no se abre mientras Jorge habla ni justo despues.
        if (getSpeakingText()) {
          ultimaVozRef.current = Date.now()
          armar(POST_TTS_DELAY_MS)
          return
        }
        const falta = COLA_ECO_MS - (Date.now() - ultimaVozRef.current)
        if (falta > 0) {
          armar(falta)
          return
        }

        pendingTranscriptRef.current = ''
        try {
          recognition.start()
        } catch {
          /* ya en ejecucion */
        }
      }, espera)
    }
    armar(delayMs)
  }, [clearRestartTimer])

  /** Reinicia el microfono SOLO despues de que termina el TTS (patron HTML onend). */
  const resumeListeningAfterSpeech = useCallback(() => {
    if (!sessionActiveRef.current) return
    busyRef.current = false
    setStatus('listening')
    scheduleInactivityTimeout()
    tryStartListening(POST_TTS_DELAY_MS)
  }, [scheduleInactivityTimeout, tryStartListening])

  const processFinalTranscript = useCallback(
    async (finalText: string) => {
      let commandText = stripWakeWords(finalText) || finalText
      const interrumpio = interrumpioVozRef.current
      interrumpioVozRef.current = false

      if (wakePhaseRef.current && !interrumpio) {
        const heard = splitWake(finalText)
        if (!heard.woke) {
          busyRef.current = false
          tryStartListening()
          return
        }
        wakePhaseRef.current = false
        if (!heard.command) {
          setStatus('speaking')
          clearInactivityTimer()
          await speak(frases.teEscucho(), lang)
          if (sessionActiveRef.current) resumeListeningAfterSpeech()
          else busyRef.current = false
          return
        }
        commandText = heard.command
      }

      const generation = commandGenerationRef.current + 1
      commandGenerationRef.current = generation
      esperandoRespuestaSaludoRef.current = false

      const abortController = new AbortController()
      commandAbortRef.current = abortController

      busyRef.current = true
      setStatus('processing')
      clearInactivityTimer()

      const intent = parseIntent(commandText)
      let message: string | null = null

      try {
        message = await onCommandRef.current(intent, abortController.signal)
      } catch {
        if (!abortController.signal.aborted) {
          setErrorMsg('Error al ejecutar el comando.')
        }
      }

      if (
        abortController.signal.aborted ||
        generation !== commandGenerationRef.current ||
        !sessionActiveRef.current
      ) {
        busyRef.current = false
        if (commandAbortRef.current === abortController) {
          commandAbortRef.current = null
        }
        if (sessionActiveRef.current) {
          resumeListeningAfterSpeech()
        }
        return
      }

      if (message) {
        setResponseText(message)
      } else if (intent.type === 'UNKNOWN') {
        message = mensajeNoEntendi(intent.raw)
        setResponseText(message)
      }

      if (commandAbortRef.current === abortController) {
        commandAbortRef.current = null
      }

      setTranscript('')

      if (message && sessionActiveRef.current) {
        setStatus('speaking')
        // Turnos: el microfono se reabre solo cuando Jorge termina (resumeListeningAfterSpeech).
        await speak(message, lang)
      }

      if (
        generation !== commandGenerationRef.current ||
        !sessionActiveRef.current
      ) {
        busyRef.current = false
        return
      }

      resumeListeningAfterSpeech()
    },
    [clearInactivityTimer, lang, resumeListeningAfterSpeech, tryStartListening]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionImpl) {
      setStatus('unsupported')
      return
    }

    const recognition = new SpeechRecognitionImpl()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 5

    const GrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList
    if (GrammarList) {
      const grammars = new GrammarList()
      grammars.addFromString('#JSGF V1.0; grammar dux; public <wake> = hey dux | dux | hey ducks | ducks;', 1)
      recognition.grammars = grammars
    }

    recognition.onstart = () => {
      micAbiertoRef.current = true
      if (!sessionActiveRef.current) return
      setStatus(wakePhaseRef.current ? 'wake' : 'listening')
      setErrorMsg('')
      scheduleInactivityTimeout()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!sessionActiveRef.current) return
      // Turnos: lo que entra mientras Jorge habla es su propio eco o ruido, nunca una orden.
      if (getSpeakingText()) {
        pendingTranscriptRef.current = ''
        return
      }

      let interim = ''
      let allFinal = ''
      let descartado = false
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        let text = result[0]?.transcript ?? ''
        // La confianza es la de la frase tal como la oyo el motor, aunque se cambie por una alternativa con "eco".
        const confianza = result[0]?.confidence ?? 0
        for (let alt = 1; alt < result.length; alt++) {
          const option = result[alt]?.transcript ?? ''
          if (option && detectWakeWord(option) && !detectWakeWord(text)) text = option
        }
        text = fixEco(text)
        if (result.isFinal) {
          // Voz lejana, murmullos o ruido de fondo llegan con confianza baja: se ignoran.
          const minimo = wakePhaseRef.current ? MIN_CONFIANZA_WAKE : MIN_CONFIANZA
          if (confianza > 0 && confianza < minimo) {
            descartado = true
            continue
          }
          allFinal += text
        } else if (i >= event.resultIndex) {
          interim += text
        }
      }

      if (descartado && !allFinal) {
        pendingTranscriptRef.current = ''
        setTranscript('')
        return
      }

      const spoken = (allFinal || interim).trim()
      if (spoken && esEcoDeLaVoz(spoken)) {
        pendingTranscriptRef.current = ''
        return
      }
      if (spoken && valeInterrumpir(spoken)) {
        interrumpioVozRef.current = true
        esperandoRespuestaSaludoRef.current = false
        abortCurrentCommand()
        busyRef.current = false
        setResponseText(null)
        setStatus('listening')
      }

      if (spoken) {
        scheduleInactivityTimeout()
      }

      if (busyRef.current && spoken) {
        abortCurrentCommand()
        busyRef.current = false
        setResponseText(null)
        setStatus('listening')
      }

      const heard = (allFinal || interim).trim()
      if (heard) {
        // Android a veces no marca isFinal antes de onend; guardar lo ultimo escuchado.
        pendingTranscriptRef.current = heard
      }

      setTranscript(heard)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return

      if (event.error === 'no-speech' || event.error === 'network') {
        if (sessionActiveRef.current && !busyRef.current) {
          scheduleInactivityTimeout()
        }
        return
      }

      if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && !fromGestureRef.current) {
        sessionActiveRef.current = false
        busyRef.current = false
        pendingTranscriptRef.current = ''
        setStatus('idle')
        return
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Permiso de microfono denegado.')
      } else {
        setErrorMsg(`Error de reconocimiento: ${event.error}`)
      }

      sessionActiveRef.current = false
      busyRef.current = false
      pendingTranscriptRef.current = ''
      clearInactivityTimer()
      clearRestartTimer()
      setStatus('error')
    }

    recognition.onend = () => {
      micAbiertoRef.current = false
      if (!sessionActiveRef.current) return

      const hablado = pendingTranscriptRef.current.trim()
      pendingTranscriptRef.current = ''

      // Pulsar para hablar: mientras se mantiene el boton se acumula lo dicho y el microfono
      // se reabre tras cada pausa; la orden se envia al soltar.
      if (pushRef.current) {
        if (hablado) pushBufferRef.current = `${pushBufferRef.current} ${hablado}`.trim()
        tryStartListening(80)
        return
      }
      const text = pushBufferRef.current ? `${pushBufferRef.current} ${hablado}`.trim() : hablado
      pushBufferRef.current = ''

      if (text && getSpeakingText() && !valeInterrumpir(text) && !interrumpioVozRef.current) {
        tryStartListening(200)
        return
      }

      if (text && (getSpeakingText() || interrumpioVozRef.current)) {
        interrumpioVozRef.current = true
        abortCurrentCommand()
        busyRef.current = false
        void processFinalTranscript(text)
        return
      }

      if (busyRef.current) {
        if (getSpeakingText()) tryStartListening(200)
        return
      }

      if (text) {
        busyRef.current = true
        void processFinalTranscript(text)
        return
      }

      scheduleInactivityTimeout()
      tryStartListening(esAndroid() ? RESTART_DELAY_ANDROID_MS : RESTART_DELAY_MS)
    }

    recognitionRef.current = recognition
    const armTimer = window.setTimeout(() => beginRef.current(false), 500)

    // Turnos sin solapar: si Jorge empieza a hablar con el microfono abierto, se cierra
    // y onend lo reabre (tryStartListening espera a que Jorge termine).
    const vigilante = window.setInterval(() => {
      if (!sessionActiveRef.current || !getSpeakingText()) return
      ultimaVozRef.current = Date.now()
      if (!micAbiertoRef.current) return
      pendingTranscriptRef.current = ''
      try {
        recognition.abort()
      } catch {
        /* ya cerrado */
      }
    }, VIGILANTE_VOZ_MS)

    return () => {
      window.clearTimeout(armTimer)
      window.clearInterval(vigilante)
      micAbiertoRef.current = false
      sessionActiveRef.current = false
      clearInactivityTimer()
      clearRestartTimer()
      abortCurrentCommand()
      recognition.abort()
      recognitionRef.current = null
    }
  }, [
    abortCurrentCommand,
    clearInactivityTimer,
    clearRestartTimer,
    processFinalTranscript,
    scheduleInactivityTimeout,
    tryStartListening,
    lang,
  ])

  const beginSession = useCallback((fromGesture: boolean) => {
    if (!fromGesture && (pausedByUserRef.current || !handsFreeRef.current)) return
    const recognition = recognitionRef.current
    if (!recognition || sessionActiveRef.current) return

    fromGestureRef.current = fromGesture
    sessionActiveRef.current = true
    busyRef.current = false
    pendingTranscriptRef.current = ''
    commandGenerationRef.current = 0
    wakePhaseRef.current = requireWakeWord
    setTranscript('')
    setResponseText(null)
    setErrorMsg('')

    setStatus(requireWakeWord ? 'wake' : 'listening')
    scheduleInactivityTimeout()

    // No abrir el microfono mientras Jorge habla. En Android el microfono se queda
    // con el audio del telefono y la frase se oye cortada.
    if (getSpeakingText()) {
      tryStartListening(POST_TTS_DELAY_MS)
      return
    }

    try {
      recognition.start()
    } catch {
      sessionActiveRef.current = false
      setStatus('idle')
    }
  }, [requireWakeWord, scheduleInactivityTimeout, tryStartListening])
  beginRef.current = beginSession

  const startListening = useCallback(() => {
    if (status === 'unsupported') return

    if (sessionActiveRef.current) {
      // El boton calla a Jorge sin cerrar la sesion; el microfono se reabre solo.
      if (getSpeakingText()) {
        abortCurrentCommand()
        busyRef.current = false
        setResponseText(null)
        setStatus(wakePhaseRef.current ? 'wake' : 'listening')
        scheduleInactivityTimeout()
        tryStartListening(POST_TTS_DELAY_MS)
        return
      }
      if (wakePhaseRef.current) {
        wakePhaseRef.current = false
        pausedByUserRef.current = false
        setStatus('listening')
        scheduleInactivityTimeout()
        return
      }
      pausedByUserRef.current = true
      stopSession()
      return
    }

    pausedByUserRef.current = false
    beginSession(true)
  }, [status, stopSession, beginSession, abortCurrentCommand, scheduleInactivityTimeout, tryStartListening])

  /** Pulsar para hablar (inicio): sin "Hey Dux", el microfono escucha solo mientras se mantiene el boton. */
  const startPush = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || pushRef.current) return

    pausedByUserRef.current = false
    pushRef.current = true
    pushBufferRef.current = ''
    setPushActivo(true)
    clearInactivityTimer()

    // Si Jorge hablaba o habia una orden en curso, se corta: ahora habla el usuario.
    if (getSpeakingText() || busyRef.current) {
      abortCurrentCommand()
      busyRef.current = false
      setResponseText(null)
    }
    ultimaVozRef.current = 0

    if (!sessionActiveRef.current) beginSession(true)
    wakePhaseRef.current = false
    setTranscript('')
    setStatus('listening')

    if (!micAbiertoRef.current) {
      clearRestartTimer()
      try {
        recognition.start()
      } catch {
        /* ya en ejecucion */
      }
    }
  }, [abortCurrentCommand, beginSession, clearInactivityTimer, clearRestartTimer])

  /** Pulsar para hablar (fin): cierra el microfono y envia lo dicho. */
  const endPush = useCallback(() => {
    if (!pushRef.current) return
    pushRef.current = false
    setPushActivo(false)

    const recognition = recognitionRef.current
    if (!recognition || !sessionActiveRef.current) return

    if (micAbiertoRef.current) {
      // stop() entrega el resultado final; onend procesa lo acumulado.
      try {
        recognition.stop()
      } catch {
        /* ya cerrado */
      }
      return
    }

    // El microfono estaba entre dos reinicios: se envia lo que ya se tenia.
    clearRestartTimer()
    const texto = `${pushBufferRef.current} ${pendingTranscriptRef.current}`.trim()
    pushBufferRef.current = ''
    pendingTranscriptRef.current = ''
    if (texto && !busyRef.current) {
      busyRef.current = true
      void processFinalTranscript(texto)
      return
    }
    scheduleInactivityTimeout()
    tryStartListening()
  }, [clearRestartTimer, processFinalTranscript, scheduleInactivityTimeout, tryStartListening])

  useEffect(() => {
    if (handsFree) return
    if (sessionActiveRef.current) stopSession()
  }, [handsFree, stopSession])

  useEffect(() => {
    if (!handsFree) return

    const tryArm = () => {
      if (document.visibilityState === 'hidden' || pausedByUserRef.current) return
      beginSession(false)
    }

    const timer = window.setTimeout(tryArm, 400)
    document.addEventListener('visibilitychange', tryArm)
    window.addEventListener('pageshow', tryArm)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', tryArm)
      window.removeEventListener('pageshow', tryArm)
    }
  }, [handsFree, beginSession])

  const saludoArmado = useRef(false)
  useEffect(() => {
    if (!handsFree || saludoArmado.current) return
    saludoArmado.current = true
    anticiparSaludo()
    beginSession(false)
    wakePhaseRef.current = false
    esperandoRespuestaSaludoRef.current = true
    marcarOfertaResumen(true)

    void saludoPromesa?.finally(() => {
      if (getArrancoHabla()) {
        if (!sessionActiveRef.current || !esperandoRespuestaSaludoRef.current) return
        scheduleInactivityTimeout()
        return
      }
      const alTocar = () => {
        window.removeEventListener('pointerdown', alTocar)
        esperandoRespuestaSaludoRef.current = true
        marcarOfertaResumen(true)
        void speak(SALUDO, 'es-CO', { reintentar: false }).finally(() => {
          if (!sessionActiveRef.current || !esperandoRespuestaSaludoRef.current) return
          scheduleInactivityTimeout()
        })
      }
      window.addEventListener('pointerdown', alTocar, { once: true })
    })
  }, [handsFree, beginSession, scheduleInactivityTimeout])

  const stopListening = useCallback(() => {
    stopSession()
  }, [stopSession])

  const clearResponse = useCallback(() => {
    setResponseText(null)
    setErrorMsg('')
    setTranscript('')
  }, [])

  return {
    status,
    transcript,
    responseText,
    errorMsg,
    startListening,
    startPush,
    endPush,
    isPushToTalk: pushActivo,
    stopListening,
    clearResponse,
    isListening: status === 'listening' || status === 'wake',
    isWakePhase: status === 'wake',
    isProcessing: status === 'processing' || status === 'speaking',
    isUnsupported: status === 'unsupported',
  }
}
