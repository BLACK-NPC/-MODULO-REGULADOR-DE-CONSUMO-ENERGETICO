'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DashboardPage =
  | 'home'
  | 'monitoreo'
  | 'configuraciones'
  | 'alertas'
  | 'datos-externos'

export type VoiceIntent =
  | { type: 'MOTOR_ON'; raw: string }
  | { type: 'MOTOR_OFF'; raw: string }
  | { type: 'MODE_AUTO'; raw: string }
  | { type: 'MODE_MANUAL'; raw: string }
  | { type: 'SETPOINT_UP'; value: number; raw: string }
  | { type: 'SETPOINT_DOWN'; value: number; raw: string }
  | { type: 'SETPOINT_QUERY'; raw: string }
  | { type: 'SYSTEM_STATUS'; raw: string }
  | { type: 'NAVIGATE'; page: DashboardPage; raw: string }
  | { type: 'WEATHER'; city?: string; raw: string }
  | { type: 'UNKNOWN'; raw: string }

interface VoiceAssistantProps {
  onCommand: (intent: VoiceIntent) => void
  lang?: 'es-CO' | 'es-ES'
  className?: string
  embedded?: boolean
}

type Status = 'idle' | 'listening' | 'processing' | 'unsupported' | 'error'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

const WORD_NUMBERS: Record<string, number> = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30,
  'treinta y cinco': 35, cuarenta: 40,
}

function extractNumber(text: string): number | null {
  const digitMatch = text.match(/(\d+)/)
  if (digitMatch) return parseInt(digitMatch[1], 10)

  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (text.includes(word)) return value
  }
  return null
}

function extractCity(text: string): string | undefined {
  const patterns = [
    /(?:clima|tiempo|pronostico|temperatura)\s+(?:en|de|para)\s+([a-z\s]+)/i,
    /(?:en|de|para)\s+([a-z\s]{3,})$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const city = match?.[1]?.trim()
    if (city && !/(motor|sistema|modulo|setpoint|exterior)/.test(city)) {
      return city
    }
  }

  return undefined
}

function parseIntent(transcript: string): VoiceIntent {
  const t = normalize(transcript)

  if (/(ir a|abrir|ve a|mostrar|ir al|panel|inicio|pagina)/.test(t)) {
    if (/monitoreo/.test(t)) return { type: 'NAVIGATE', page: 'monitoreo', raw: transcript }
    if (/alerta/.test(t)) return { type: 'NAVIGATE', page: 'alertas', raw: transcript }
    if (/configuracion/.test(t)) return { type: 'NAVIGATE', page: 'configuraciones', raw: transcript }
    if (/datos externos|clima exterior|externos/.test(t)) {
      return { type: 'NAVIGATE', page: 'datos-externos', raw: transcript }
    }
    if (/inicio|principal|home|panel/.test(t)) return { type: 'NAVIGATE', page: 'home', raw: transcript }
  }

  if (/(clima|tiempo|pronostico|temperatura exterior)/.test(t)) {
    return { type: 'WEATHER', city: extractCity(transcript), raw: transcript }
  }

  if (/(enciende|encender|prende|prender|arranca|activa|inicia)/.test(t) && /(motor|ventilador|sistema|modulo)/.test(t)) {
    return { type: 'MOTOR_ON', raw: transcript }
  }

  if (/(apaga|apagar|detiene|detener|para|parar|desactiva|detente)/.test(t) && /(motor|ventilador|sistema|modulo)/.test(t)) {
    return { type: 'MOTOR_OFF', raw: transcript }
  }

  if (/modo/.test(t) && /(automatico|auto)/.test(t)) {
    return { type: 'MODE_AUTO', raw: transcript }
  }

  if (/modo/.test(t) && /manual/.test(t)) {
    return { type: 'MODE_MANUAL', raw: transcript }
  }

  if (/(sube|subir|aumenta|aumentar|incrementa|incrementar)/.test(t) && /(setpoint|punto|temperatura|grados)/.test(t)) {
    const value = extractNumber(t)
    if (value !== null) return { type: 'SETPOINT_UP', value, raw: transcript }
  }

  if (/(baja|bajar|disminuye|disminuir|reduce|reducir)/.test(t) && /(setpoint|punto|temperatura|grados)/.test(t)) {
    const value = extractNumber(t)
    if (value !== null) return { type: 'SETPOINT_DOWN', value, raw: transcript }
  }

  if (/(cual|que).*(setpoint|punto)|setpoint actual|valor del setpoint/.test(t)) {
    return { type: 'SETPOINT_QUERY', raw: transcript }
  }

  if (/(estado|status|como esta|reporte|informe)/.test(t) && /(sistema|modulo|motor|todo)/.test(t)) {
    return { type: 'SYSTEM_STATUS', raw: transcript }
  }

  if (/^estado del sistema$/.test(t) || t === 'estado') {
    return { type: 'SYSTEM_STATUS', raw: transcript }
  }

  return { type: 'UNKNOWN', raw: transcript }
}

function intentLabel(intent: VoiceIntent): string {
  switch (intent.type) {
    case 'MOTOR_ON': return 'Encender motor'
    case 'MOTOR_OFF': return 'Apagar motor'
    case 'MODE_AUTO': return 'Modo automatico'
    case 'MODE_MANUAL': return 'Modo manual'
    case 'SETPOINT_UP': return `Subir setpoint a ${intent.value}°C`
    case 'SETPOINT_DOWN': return `Bajar setpoint a ${intent.value}°C`
    case 'SETPOINT_QUERY': return 'Consultar setpoint'
    case 'SYSTEM_STATUS': return 'Estado del sistema'
    case 'NAVIGATE': return `Ir a ${intent.page}`
    case 'WEATHER': return intent.city ? `Clima en ${intent.city}` : 'Clima exterior'
    case 'UNKNOWN': return 'Comando no reconocido'
  }
}

export function VoiceAssistant({ onCommand, lang = 'es-CO', className, embedded = false }: VoiceAssistantProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null)
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
        setStatus('processing')
        const intent = parseIntent(final)
        setLastIntent(intent)
        onCommandRef.current(intent)
        window.setTimeout(() => setStatus('idle'), 600)
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

  const handleToggle = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    if (status === 'listening') {
      recognition.stop()
      setStatus('idle')
    } else {
      try {
        recognition.start()
      } catch {
        // start() lanza si ya esta activo
      }
    }
  }, [status])

  const isListening = status === 'listening'
  const isProcessing = status === 'processing'
  const isUnsupported = status === 'unsupported'

  return (
    <div
      className={cn(
        'flex flex-col gap-4 text-card-foreground',
        embedded ? 'p-0' : 'rounded-xl border border-border bg-card p-5',
        className
      )}
      role="region"
      aria-label="Asistente de voz"
    >
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
            <Volume2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Asistente de Voz</h3>
            <p className="text-xs text-muted-foreground">Idioma: {lang}</p>
          </div>
        </div>
      )}

      <Button
        onClick={handleToggle}
        disabled={isUnsupported || isProcessing}
        className={cn(
          'h-14 w-full text-base font-semibold transition-colors',
          isListening
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
        aria-pressed={isListening}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Procesando...
          </>
        ) : isListening ? (
          <>
            <MicOff className="mr-2 h-5 w-5" />
            Detener
          </>
        ) : (
          <>
            <Mic className="mr-2 h-5 w-5" />
            Hablar
          </>
        )}
      </Button>

      <div className="flex items-center gap-2 text-sm" aria-live="polite">
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            isListening && 'animate-pulse bg-destructive',
            isProcessing && 'animate-pulse bg-accent',
            status === 'idle' && 'bg-muted-foreground/40',
            status === 'error' && 'bg-destructive',
            isUnsupported && 'bg-muted-foreground/40'
          )}
        />
        <span className="text-muted-foreground">
          {isListening && 'Escuchando...'}
          {isProcessing && 'Procesando...'}
          {status === 'idle' && 'Listo'}
          {status === 'error' && (errorMsg || 'Error')}
          {isUnsupported && 'Tu navegador no soporta reconocimiento de voz'}
        </span>
      </div>

      {transcript && (
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transcripcion
          </p>
          <p className="mt-1 text-sm">{transcript}</p>
        </div>
      )}

      {lastIntent && (
        <div
          className={cn(
            'rounded-lg border p-3',
            lastIntent.type === 'UNKNOWN'
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-primary/40 bg-primary/10'
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Intencion
          </p>
          <p className="mt-1 text-sm font-medium">{intentLabel(lastIntent)}</p>
        </div>
      )}

      {!embedded && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium">
            Comandos disponibles
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>&quot;Enciende el motor&quot; / &quot;Apaga el motor&quot;</li>
            <li>&quot;Modo automatico&quot; / &quot;Modo manual&quot;</li>
            <li>&quot;Estado del sistema&quot; / &quot;Cual es el setpoint&quot;</li>
            <li>&quot;Clima en Cali&quot; / &quot;Que tiempo hace&quot;</li>
            <li>&quot;Ir a monitoreo&quot; / &quot;Abrir alertas&quot;</li>
          </ul>
        </details>
      )}
    </div>
  )
}
