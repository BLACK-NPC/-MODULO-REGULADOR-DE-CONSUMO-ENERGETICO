'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent } from '@/components/voice-assistant'
import { speak, stopSpeaking } from '@/lib/speech-synthesis'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'unsupported'
  | 'error'

const INACTIVITY_TIMEOUT_MS = 5000
const RESTART_DELAY_MS = 200

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  onCommand: (
    intent: VoiceIntent,
    signal?: AbortSignal
  ) => Promise<string | null> | string | null
  onSessionEnd?: () => void
}

export function useVoiceRecognition({
  lang = 'es-CO',
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
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyRef = useRef(false)
  const commandAbortRef = useRef<AbortController | null>(null)
  const commandGenerationRef = useRef(0)

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
      if (sessionActiveRef.current && !busyRef.current) {
        stopSession()
      }
    }, INACTIVITY_TIMEOUT_MS)
  }, [clearInactivityTimer, stopSession])

  const tryStartListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || !sessionActiveRef.current || busyRef.current) return

    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current || busyRef.current) return

      try {
        recognition.start()
      } catch {
        /* already running */
      }
    }, RESTART_DELAY_MS)
  }, [clearRestartTimer])

  const resumeAfterResponse = useCallback(() => {
    if (!sessionActiveRef.current) return
    busyRef.current = false
    setStatus('listening')
    scheduleInactivityTimeout()
    tryStartListening()
  }, [scheduleInactivityTimeout, tryStartListening])

  const processFinalTranscript = useCallback(
    async (finalText: string) => {
      const generation = commandGenerationRef.current + 1
      commandGenerationRef.current = generation

      const abortController = new AbortController()
      commandAbortRef.current = abortController

      busyRef.current = true
      setStatus('processing')
      clearInactivityTimer()

      const intent = parseIntent(finalText)
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
          resumeAfterResponse()
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

      resumeAfterResponse()
    },
    [clearInactivityTimer, lang, resumeAfterResponse]
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
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += text
        } else {
          interim += text
        }
      }

      const spoken = (final || interim).trim()
      if (spoken) {
        scheduleInactivityTimeout()
      }

      if (busyRef.current && spoken) {
        abortCurrentCommand()
        busyRef.current = false
        setResponseText(null)
      }

      setTranscript(final || interim)

      if (!final.trim()) return

      busyRef.current = true
      void processFinalTranscript(final.trim())
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return

      if (event.error === 'no-speech' || event.error === 'network') {
        if (sessionActiveRef.current && !busyRef.current) {
          scheduleInactivityTimeout()
          tryStartListening()
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
      clearInactivityTimer()
      clearRestartTimer()
      setStatus('error')
    }

    recognition.onend = () => {
      if (!sessionActiveRef.current || busyRef.current) return
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
    commandGenerationRef.current = 0
    setTranscript('')
    setResponseText(null)
    setErrorMsg('')

    try {
      recognition.start()
      setStatus('listening')
      scheduleInactivityTimeout()
    } catch {
      sessionActiveRef.current = false
      setStatus('idle')
    }
  }, [status, stopSession, scheduleInactivityTimeout])

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
    isListening: status === 'listening',
    isProcessing: status === 'processing' || status === 'speaking',
    isUnsupported: status === 'unsupported',
  }
}
