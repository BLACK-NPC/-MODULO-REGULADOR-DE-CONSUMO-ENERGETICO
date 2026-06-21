'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent } from '@/components/voice-assistant'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'unsupported'
  | 'error'

const SILENCE_TIMEOUT_MS = 5000

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  onCommand: (intent: VoiceIntent) => Promise<string | null> | string | null
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
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef = useRef(false)

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd
  }, [onSessionEnd])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false
    processingRef.current = false
    clearSilenceTimer()
    recognitionRef.current?.stop()
    setStatus('idle')
    setTranscript('')
    onSessionEndRef.current?.()
  }, [clearSilenceTimer])

  const scheduleSilenceTimeout = useCallback(() => {
    clearSilenceTimer()
    if (!sessionActiveRef.current) return

    silenceTimerRef.current = setTimeout(() => {
      if (sessionActiveRef.current && !processingRef.current) {
        stopSession()
      }
    }, SILENCE_TIMEOUT_MS)
  }, [clearSilenceTimer, stopSession])

  const restartListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || !sessionActiveRef.current) return

    try {
      recognition.start()
      setStatus('listening')
    } catch {
      /* already running */
    }
    scheduleSilenceTimeout()
  }, [scheduleSilenceTimeout])

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
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setStatus('listening')
      setErrorMsg('')
      scheduleSilenceTimeout()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!sessionActiveRef.current) return

      scheduleSilenceTimeout()

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
      setTranscript(final || interim)

      if (!final.trim()) return

      void (async () => {
        processingRef.current = true
        setStatus('processing')
        clearSilenceTimer()

        const intent = parseIntent(final)
        const message = await onCommandRef.current(intent)
        if (message) {
          setResponseText(message)
        } else if (intent.type === 'UNKNOWN') {
          setResponseText('Comando no reconocido')
        }

        processingRef.current = false

        if (!sessionActiveRef.current) {
          setStatus('idle')
          return
        }

        setTranscript('')
        restartListening()
      })()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        scheduleSilenceTimeout()
        return
      }

      if (event.error === 'aborted') {
        return
      }

      setStatus('error')
      sessionActiveRef.current = false
      processingRef.current = false
      clearSilenceTimer()

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Permiso de microfono denegado.')
      } else {
        setErrorMsg(`Error de reconocimiento: ${event.error}`)
      }
    }

    recognition.onend = () => {
      if (!sessionActiveRef.current) {
        setStatus((prev) => (prev === 'listening' ? 'idle' : prev))
        return
      }

      if (!processingRef.current) {
        restartListening()
      }
    }

    recognitionRef.current = recognition

    return () => {
      sessionActiveRef.current = false
      clearSilenceTimer()
      recognition.abort()
      recognitionRef.current = null
    }
  }, [lang, clearSilenceTimer, restartListening, scheduleSilenceTimeout])

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || status === 'unsupported') return

    if (sessionActiveRef.current) {
      stopSession()
      return
    }

    if (status === 'processing') return

    sessionActiveRef.current = true
    processingRef.current = false
    setTranscript('')
    setResponseText(null)
    setErrorMsg('')

    try {
      recognition.start()
      setStatus('listening')
      scheduleSilenceTimeout()
    } catch {
      /* already active */
    }
  }, [status, stopSession, scheduleSilenceTimeout])

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
    isProcessing: status === 'processing',
    isSessionActive: sessionActiveRef.current,
    isUnsupported: status === 'unsupported',
  }
}
