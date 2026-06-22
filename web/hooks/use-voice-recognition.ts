'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent } from '@/components/voice-assistant'
import { stopSpeaking } from '@/lib/speech-synthesis'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'unsupported'
  | 'error'

const SILENCE_TIMEOUT_MS = 5000
const RESTART_DELAY_MS = 250

function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

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
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef = useRef(false)
  const commandAbortRef = useRef<AbortController | null>(null)
  const commandGenerationRef = useRef(0)
  const useContinuousRef = useRef(true)

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
    processingRef.current = false
    abortCurrentCommand()
    clearSilenceTimer()
    clearRestartTimer()
    try {
      recognitionRef.current?.abort()
    } catch {
      recognitionRef.current?.stop()
    }
    setStatus('idle')
    setTranscript('')
    onSessionEndRef.current?.()
  }, [abortCurrentCommand, clearSilenceTimer, clearRestartTimer])

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
    if (!recognition || !sessionActiveRef.current || processingRef.current) return

    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current || processingRef.current) return

      try {
        recognition.start()
        setStatus('listening')
        scheduleSilenceTimeout()
      } catch {
        /* already running */
      }
    }, RESTART_DELAY_MS)
  }, [clearRestartTimer, scheduleSilenceTimeout])

  const processFinalTranscript = useCallback(
    async (finalText: string) => {
      const generation = commandGenerationRef.current + 1
      commandGenerationRef.current = generation

      const abortController = new AbortController()
      commandAbortRef.current = abortController

      processingRef.current = true
      setStatus('processing')
      clearSilenceTimer()

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
        processingRef.current = false
        if (commandAbortRef.current === abortController) {
          commandAbortRef.current = null
        }
        return
      }

      if (message) {
        setResponseText(message)
      } else if (intent.type === 'UNKNOWN') {
        setResponseText('Comando no reconocido')
      }

      processingRef.current = false
      if (commandAbortRef.current === abortController) {
        commandAbortRef.current = null
      }

      setTranscript('')
      restartListening()
    },
    [clearSilenceTimer, restartListening]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    useContinuousRef.current = !isAndroidDevice()

    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionImpl) {
      setStatus('unsupported')
      return
    }

    const recognition = new SpeechRecognitionImpl()
    recognition.lang = lang
    recognition.continuous = useContinuousRef.current
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setStatus('listening')
      setErrorMsg('')
      scheduleSilenceTimeout()
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
        scheduleSilenceTimeout()
      }

      if (processingRef.current && spoken) {
        abortCurrentCommand()
        processingRef.current = false
        setStatus('listening')
        setResponseText(null)
      }

      setTranscript(final || interim)

      if (!final.trim()) return

      void processFinalTranscript(final.trim())
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        scheduleSilenceTimeout()
        return
      }

      if (event.error === 'aborted') {
        return
      }

      if (event.error === 'network') {
        scheduleSilenceTimeout()
        return
      }

      setStatus('error')
      sessionActiveRef.current = false
      processingRef.current = false
      clearSilenceTimer()
      clearRestartTimer()

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
      clearRestartTimer()
      abortCurrentCommand()
      recognition.abort()
      recognitionRef.current = null
    }
  }, [
    lang,
    abortCurrentCommand,
    clearRestartTimer,
    clearSilenceTimer,
    processFinalTranscript,
    restartListening,
    scheduleSilenceTimeout,
  ])

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || status === 'unsupported') return

    if (sessionActiveRef.current) {
      stopSession()
      return
    }

    sessionActiveRef.current = true
    processingRef.current = false
    commandGenerationRef.current = 0
    setTranscript('')
    setResponseText(null)
    setErrorMsg('')

    try {
      recognition.start()
      setStatus('listening')
      scheduleSilenceTimeout()
    } catch {
      sessionActiveRef.current = false
      setStatus('idle')
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
