'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent } from '@/components/voice-assistant'
import { speak, stopSpeaking } from '@/lib/speech-synthesis'
import { detectWakeWord, stripWakeWords } from '@/lib/wake-word'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'wake'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'unsupported'
  | 'error'

/** Tiempo sin hablar antes de apagar la sesion. */
const INACTIVITY_TIMEOUT_MS = 15000
/** Pausa tras terminar TTS antes de reabrir el microfono (Android/iOS). */
const POST_TTS_DELAY_MS = 500
/** Pausa antes de reiniciar recognition tras onend vacio. */
const RESTART_DELAY_MS = 300

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  /** Si true, la primera frase debe contener una palabra clave (hey/ok/hola). */
  requireWakeWord?: boolean
  onCommand: (
    intent: VoiceIntent,
    signal?: AbortSignal
  ) => Promise<string | null> | string | null
  onSessionEnd?: () => void
}

export function useVoiceRecognition({
  lang = 'es-CO',
  requireWakeWord = false,
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

    inactivityTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current || busyRef.current) return

      sessionActiveRef.current = false
      busyRef.current = true
      clearRestartTimer()
      try {
        recognitionRef.current?.abort()
      } catch {
        recognitionRef.current?.stop()
      }

      void speak('Asistente desactivado por falta de respuesta.', lang).finally(() => {
        busyRef.current = false
        setStatus('idle')
        setTranscript('')
        onSessionEndRef.current?.()
      })
    }, INACTIVITY_TIMEOUT_MS)
  }, [clearInactivityTimer, lang])

  const tryStartListening = useCallback((delayMs = RESTART_DELAY_MS) => {
    const recognition = recognitionRef.current
    if (!recognition || !sessionActiveRef.current || busyRef.current) return

    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current || busyRef.current) return

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
      // --- Fase wake word ---
      if (wakePhaseRef.current) {
        const wakeWord = detectWakeWord(finalText)
        if (!wakeWord) {
          // No era palabra clave: ignorar y seguir escuchando.
          scheduleInactivityTimeout()
          tryStartListening()
          return
        }
        // Palabra clave detectada: salir de fase wake, pasar a comando.
        wakePhaseRef.current = false
        setStatus('listening')
        scheduleInactivityTimeout()
        tryStartListening(POST_TTS_DELAY_MS)
        return
      }

      // Quitar palabras clave que el usuario incluyera junto al comando.
      const commandText = stripWakeWords(finalText) || finalText

      const generation = commandGenerationRef.current + 1
      commandGenerationRef.current = generation

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
    [clearInactivityTimer, lang, resumeListeningAfterSpeech, scheduleInactivityTimeout, tryStartListening]
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
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (!sessionActiveRef.current) return
      setStatus('listening')
      setErrorMsg('')
      scheduleInactivityTimeout()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!sessionActiveRef.current) return

      let interim = ''
      let allFinal = ''
      for (let i = 0; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          allFinal += text
        } else if (i >= event.resultIndex) {
          interim += text
        }
      }

      const spoken = (allFinal || interim).trim()
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
      if (!sessionActiveRef.current || busyRef.current) return

      const text = pendingTranscriptRef.current.trim()
      pendingTranscriptRef.current = ''

      if (text) {
        busyRef.current = true
        void processFinalTranscript(text)
        return
      }

      scheduleInactivityTimeout()
      tryStartListening()
    }

    recognitionRef.current = recognition

    return () => {
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

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || status === 'unsupported') return

    if (sessionActiveRef.current) {
      stopSession()
      return
    }

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
  }, [status, stopSession, scheduleInactivityTimeout, requireWakeWord])

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
