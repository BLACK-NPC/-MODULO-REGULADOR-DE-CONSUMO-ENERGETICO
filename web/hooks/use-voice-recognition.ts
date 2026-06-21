'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseIntent, type VoiceIntent } from '@/components/voice-assistant'

export type VoiceRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'unsupported'
  | 'error'

interface UseVoiceRecognitionOptions {
  lang?: 'es-CO' | 'es-ES'
  onCommand: (intent: VoiceIntent) => Promise<string | null> | string | null
}

export function useVoiceRecognition({
  lang = 'es-CO',
  onCommand,
}: UseVoiceRecognitionOptions) {
  const [status, setStatus] = useState<VoiceRecognitionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [responseText, setResponseText] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onCommandRef = useRef(onCommand)

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

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
      setStatus('listening')
      setTranscript('')
      setErrorMsg('')
      setResponseText(null)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

      if (final) {
        void (async () => {
          setStatus('processing')
          const intent = parseIntent(final)
          const message = await onCommandRef.current(intent)
          if (message) {
            setResponseText(message)
          } else if (intent.type === 'UNKNOWN') {
            setResponseText('Comando no reconocido')
          }
          setStatus('idle')
        })()
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setStatus('error')
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Permiso de microfono denegado.')
      } else if (event.error === 'no-speech') {
        setErrorMsg('No se detecto voz. Intenta de nuevo.')
      } else {
        setErrorMsg(`Error de reconocimiento: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setStatus((prev) => (prev === 'listening' ? 'idle' : prev))
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [lang])

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || status === 'unsupported' || status === 'processing') return

    if (status === 'listening') {
      recognition.stop()
      setStatus('idle')
      return
    }

    try {
      recognition.start()
    } catch {
      /* already active */
    }
  }, [status])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setStatus('idle')
  }, [])

  return {
    status,
    transcript,
    responseText,
    errorMsg,
    startListening,
    stopListening,
    isListening: status === 'listening',
    isProcessing: status === 'processing',
    isUnsupported: status === 'unsupported',
  }
}
