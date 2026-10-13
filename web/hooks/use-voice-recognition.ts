'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent, marcarOfertaResumen } from '@/components/voice-assistant'
import { speak, stopSpeaking, esEcoDeLaVoz, getSpeakingText, getArrancoHabla } from '@/lib/speech-synthesis'
import { detectWakeWord, fixEco, splitWake, stripWakeWords } from '@/lib/wake-word'

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
/** Pausa tras terminar TTS antes de reabrir el microfono (Android/iOS). */
const POST_TTS_DELAY_MS = 500
/** Pausa antes de reiniciar recognition tras onend vacio. */
const RESTART_DELAY_MS = 300

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  /** Si true, la primera frase debe ser "Hey Eco" antes de aceptar comandos. */
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
    if (wakePhaseRef.current && !esperandoRespuestaSaludoRef.current) return

    inactivityTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current) return
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

      void speak('Control por voz desactivado por falta de respuesta.', lang).finally(() => {
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

    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current) return
      if (busyRef.current && !getSpeakingText()) return

      pendingTranscriptRef.current = ''
      try {
        recognition.start()
      } catch {
        /* ya en ejecucion */
      }
    }, delayMs)
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
          await speak('Te escucho.', lang)
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
        setResponseText('Comando no reconocido')
        message = 'Comando no reconocido'
      }

      if (commandAbortRef.current === abortController) {
        commandAbortRef.current = null
      }

      setTranscript('')

      if (message && sessionActiveRef.current) {
        setStatus('speaking')
        const habla = speak(message, lang)
        tryStartListening(200)
        await habla
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
      grammars.addFromString('#JSGF V1.0; grammar eco; public <wake> = hey eco | eco | hey echo | echo;', 1)
      recognition.grammars = grammars
    }

    recognition.onstart = () => {
      if (!sessionActiveRef.current) return
      setStatus(wakePhaseRef.current ? 'wake' : 'listening')
      setErrorMsg('')
      scheduleInactivityTimeout()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!sessionActiveRef.current) return

      let interim = ''
      let allFinal = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        let text = result[0]?.transcript ?? ''
        for (let alt = 1; alt < result.length; alt++) {
          const option = result[alt]?.transcript ?? ''
          if (option && detectWakeWord(option) && !detectWakeWord(text)) text = option
        }
        text = fixEco(text)
        if (result.isFinal) {
          allFinal += text
        } else if (i >= event.resultIndex) {
          interim += text
        }
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
      if (!sessionActiveRef.current) return

      const text = pendingTranscriptRef.current.trim()
      pendingTranscriptRef.current = ''

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
      tryStartListening()
    }

    recognitionRef.current = recognition
    const armTimer = window.setTimeout(() => beginRef.current(false), 500)

    return () => {
      window.clearTimeout(armTimer)
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

    try {
      recognition.start()
      setStatus(requireWakeWord ? 'wake' : 'listening')
      scheduleInactivityTimeout()
    } catch {
      sessionActiveRef.current = false
      setStatus('idle')
    }
  }, [requireWakeWord, scheduleInactivityTimeout])
  beginRef.current = beginSession

  const startListening = useCallback(() => {
    if (status === 'unsupported') return

    if (sessionActiveRef.current) {
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
  }, [status, stopSession, beginSession])

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

  useEffect(() => {
    if (!handsFree || saludoHecho) return
    const inicio = Date.now()
    const intentar = window.setInterval(() => {
      if (saludoHecho) {
        window.clearInterval(intentar)
        return
      }
      if (!recognitionRef.current && Date.now() - inicio < 8000) return
      if (document.readyState !== 'complete' && Date.now() - inicio < 8000) return
      window.clearInterval(intentar)
      saludoHecho = true
      beginSession(false)
      wakePhaseRef.current = false
      esperandoRespuestaSaludoRef.current = true
      marcarOfertaResumen(true)
      void speak(SALUDO).finally(() => {
        if (!sessionActiveRef.current || !esperandoRespuestaSaludoRef.current) return
        scheduleInactivityTimeout()
      })
      window.setTimeout(() => {
        if (getArrancoHabla() || getSpeakingText()) return
        const alTocar = () => {
          window.removeEventListener('pointerdown', alTocar)
          esperandoRespuestaSaludoRef.current = true
          marcarOfertaResumen(true)
          void speak(SALUDO).finally(() => {
            if (!sessionActiveRef.current || !esperandoRespuestaSaludoRef.current) return
            scheduleInactivityTimeout()
          })
        }
        window.addEventListener('pointerdown', alTocar, { once: true })
      }, 1600)
    }, 300)
    return () => window.clearInterval(intentar)
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
    stopListening,
    clearResponse,
    isListening: status === 'listening' || status === 'wake',
    isWakePhase: status === 'wake',
    isProcessing: status === 'processing' || status === 'speaking',
    isUnsupported: status === 'unsupported',
  }
}
