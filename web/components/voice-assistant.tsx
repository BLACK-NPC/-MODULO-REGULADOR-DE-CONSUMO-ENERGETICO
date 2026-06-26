'use client'

import { useState } from 'react'
import { Mic, Loader2, Volume2, CheckCircle2, Waves, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVoiceRecognition } from '@/hooks/use-voice-recognition'
import { findBestSensorMatch, matchFuzzyVoiceCommand } from '@/lib/voice-fuzzy-match'
import { SENSORES_DISPONIBLES } from '@/lib/voice-connectors'
import { VOICE_COMMAND_GROUPS } from '@/lib/voice-command-menu'

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
  | { type: 'SET_SETPOINT'; value: number; raw: string }
  | { type: 'SETPOINT_QUERY'; raw: string }
  | { type: 'SYSTEM_STATUS'; raw: string }
  | { type: 'SYSTEM_HEALTH'; raw: string }
  | { type: 'ALARMS_QUERY'; raw: string }
  | { type: 'FIREBASE_STATUS'; raw: string }
  | { type: 'SENSOR_ON'; sensor: string; raw: string }
  | { type: 'SENSOR_OFF'; sensor: string; raw: string }
  | { type: 'CONSUMPTION_CURRENT'; raw: string }
  | { type: 'CONSUMPTION_VARIATION'; raw: string }
  | { type: 'FAN_CONSUMPTION'; raw: string }
  | { type: 'WIFI_NETWORK'; raw: string }
  | { type: 'TIME_NOW'; raw: string }
  | { type: 'DATE_TODAY'; raw: string }
  | { type: 'MODE_AUTO_START'; raw: string }
  | { type: 'MODE_AUTO_END'; raw: string }
  | { type: 'MODE_MANUAL_START'; raw: string }
  | { type: 'MODE_CURRENT'; raw: string }
  | { type: 'UPTIME'; raw: string }
  | { type: 'NAVIGATE'; page: DashboardPage; raw: string }
  | { type: 'WEATHER'; city?: string; raw: string }
  | { type: 'SHOW_COMMANDS'; raw: string }
  | { type: 'HIDE_COMMANDS'; raw: string }
  | { type: 'GREET'; raw: string }
  | { type: 'HELP'; raw: string }
  | { type: 'TTS_STOP'; raw: string }
  | { type: 'TTS_FASTER'; raw: string }
  | { type: 'TTS_SLOWER'; raw: string }
  | { type: 'UNKNOWN'; raw: string }

interface VoiceAssistantProps {
  onCommand: (intent: VoiceIntent) => Promise<string | null> | string | null
  lang?: 'es-CO' | 'es-ES'
  className?: string
  embedded?: boolean
}

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
    if (city && !/(motor|sistema|modulo|setpoint|exterior|menu|comandos)/.test(city)) {
      return city
    }
  }

  return undefined
}

function extractSensorName(text: string, prefixes: string[]): string | null {
  const normalized = text.toLowerCase()
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return text.slice(prefix.length).trim()
    }
  }
  return null
}

export function parseIntent(transcript: string): VoiceIntent {
  const t = normalize(transcript)

  // Saludo
  if (/^(hola|hey|ok|oye|buenos dias|buenas tardes|buenas noches|buenas)$/.test(t)) {
    return { type: 'GREET', raw: transcript }
  }

  // Ayuda
  if (
    /^ayuda$/.test(t) ||
    /que puedo (decir|hacer|preguntarte)/.test(t) ||
    /como (te uso|funciona|te llamo)/.test(t)
  ) {
    return { type: 'HELP', raw: transcript }
  }

  // Control de TTS
  if (/(para|parar|detener|silencio|calla|callate)/.test(t) && /(voz|asistente|respuesta|audio)/.test(t)) {
    return { type: 'TTS_STOP', raw: transcript }
  }
  if (/(mas rapido|habla rapido|acelera|speed up)/.test(t)) {
    return { type: 'TTS_FASTER', raw: transcript }
  }
  if (/(mas lento|habla lento|despacio|slow down)/.test(t)) {
    return { type: 'TTS_SLOWER', raw: transcript }
  }

  if (
    /mostrar.*(que decir|comandos|opciones|ayuda)/.test(t) ||
    /que puedo decir/.test(t) ||
    /ver comandos/.test(t)
  ) {
    return { type: 'SHOW_COMMANDS', raw: transcript }
  }

  if (/ocultar.*(menu|comandos)|cerrar menu|cerrar comandos/.test(t)) {
    return { type: 'HIDE_COMMANDS', raw: transcript }
  }

  if (/(ir a|abrir|ve a|ir al|panel|inicio|pagina)/.test(t)) {
    if (/monitoreo/.test(t)) return { type: 'NAVIGATE', page: 'monitoreo', raw: transcript }
    if (/alerta/.test(t)) return { type: 'NAVIGATE', page: 'alertas', raw: transcript }
    if (/configuracion/.test(t)) return { type: 'NAVIGATE', page: 'configuraciones', raw: transcript }
    if (/datos externos|clima exterior|externos/.test(t)) {
      return { type: 'NAVIGATE', page: 'datos-externos', raw: transcript }
    }
    if (/inicio|principal|home|panel/.test(t)) return { type: 'NAVIGATE', page: 'home', raw: transcript }
  }

  if (/(clima|tiempo|pronostico|temperatura exterior)/.test(t) && !/(setpoint|configurad)/.test(t)) {
    return { type: 'WEATHER', city: extractCity(transcript), raw: transcript }
  }

  if (t.startsWith('encender') || t.startsWith('enciende')) {
    const spoken = extractSensorName(t, ['encender', 'enciende'])
    const sensor = findBestSensorMatch(spoken ?? t, SENSORES_DISPONIBLES)
    if (sensor) return { type: 'SENSOR_ON', sensor, raw: transcript }
  }

  if (t.startsWith('apagar') || t.startsWith('apaga')) {
    const spoken = extractSensorName(t, ['apagar', 'apaga'])
    const sensor = findBestSensorMatch(spoken ?? t, SENSORES_DISPONIBLES)
    if (sensor) return { type: 'SENSOR_OFF', sensor, raw: transcript }
  }

  if (/(enciende|encender|prende|prender|arranca|activa|inicia)/.test(t) && /(motor|ventilador|sistema|modulo)/.test(t)) {
    return { type: 'MOTOR_ON', raw: transcript }
  }

  if (/(apaga|apagar|detiene|detener|para|parar|desactiva|detente)/.test(t) && /(motor|ventilador|sistema|modulo)/.test(t)) {
    return { type: 'MOTOR_OFF', raw: transcript }
  }

  if (/modo/.test(t) && /(automatico|auto)/.test(t) && !/(inicio|empezo|entro|apago|termino|salio)/.test(t)) {
    return { type: 'MODE_AUTO', raw: transcript }
  }

  if (/modo/.test(t) && /manual/.test(t) && !/(inicio|empezo|entro)/.test(t)) {
    return { type: 'MODE_MANUAL', raw: transcript }
  }

  if (
    /(pon|ajusta|establece|configura|cambia)/.test(t) &&
    /(setpoint|temperatura configurada|temperatura en)/.test(t)
  ) {
    const value = extractNumber(t)
    if (value !== null) return { type: 'SET_SETPOINT', value, raw: transcript }
  }

  if (/(sube|subir|aumenta|aumentar|incrementa|incrementar)/.test(t) && /(setpoint|punto|temperatura|grados)/.test(t)) {
    const value = extractNumber(t)
    if (value !== null) return { type: 'SETPOINT_UP', value, raw: transcript }
  }

  if (/(baja|bajar|disminuye|disminuir|reduce|reducir)/.test(t) && /(setpoint|punto|temperatura|grados)/.test(t)) {
    const value = extractNumber(t)
    if (value !== null) return { type: 'SETPOINT_DOWN', value, raw: transcript }
  }

  if (/(cual|que).*(setpoint|punto)|setpoint actual|valor del setpoint|temperatura configurada/.test(t)) {
    return { type: 'SETPOINT_QUERY', raw: transcript }
  }

  if (/(hay|tengo|existen|muestrame|estado de las?).*alarma/.test(t)) {
    return { type: 'ALARMS_QUERY', raw: transcript }
  }

  if (/(firebase|conexion).*(conectad|activo|hay)|esta conectad.*firebase|hay conexion con firebase/.test(t)) {
    return { type: 'FIREBASE_STATUS', raw: transcript }
  }

  if (/(consumo actual|cuanto estoy consumiendo|cuanta potencia se esta usando)/.test(t)) {
    return { type: 'CONSUMPTION_CURRENT', raw: transcript }
  }

  if (/(variacion|variado|ha cambiado).*(potencia|consumo)/.test(t)) {
    return { type: 'CONSUMPTION_VARIATION', raw: transcript }
  }

  if (/(consumo|potencia).*(ventilador|motor)/.test(t) || /cuanto consume el ventilador/.test(t)) {
    return { type: 'FAN_CONSUMPTION', raw: transcript }
  }

  if (/(red wifi|wifi|conexion actual|a que red)/.test(t) && !/firebase/.test(t)) {
    return { type: 'WIFI_NETWORK', raw: transcript }
  }

  if (/^(que hora es|dime la hora|hora actual)/.test(t) || (/que hora/.test(t) && !/inicio|empezo|entro|apago/.test(t))) {
    return { type: 'TIME_NOW', raw: transcript }
  }

  if (/^(que dia es hoy|dime la fecha|fecha actual|que fecha es hoy)/.test(t)) {
    return { type: 'DATE_TODAY', raw: transcript }
  }

  if (/modo automatico/.test(t) && /(inicio|empezo|entro)/.test(t)) {
    return { type: 'MODE_AUTO_START', raw: transcript }
  }

  if (/modo automatico/.test(t) && /(apago|termino|salio|desactiv)/.test(t)) {
    return { type: 'MODE_AUTO_END', raw: transcript }
  }

  if (/modo manual/.test(t) && /(inicio|empezo|entro)/.test(t)) {
    return { type: 'MODE_MANUAL_START', raw: transcript }
  }

  if (/en que modo|que modo esta|modo automatico o manual/.test(t)) {
    return { type: 'MODE_CURRENT', raw: transcript }
  }

  if (/(tiempo lleva encendido|tiempo de actividad|desde cuando esta activo|hace cuanto se encendio)/.test(t)) {
    return { type: 'UPTIME', raw: transcript }
  }

  if (
    /(estado general|diagnostico|todo funcionando|hay algun error|como esta el sistema)/.test(t) &&
    !/(motor|ventilador)/.test(t)
  ) {
    return { type: 'SYSTEM_HEALTH', raw: transcript }
  }

  if (/(estado|status|como esta|reporte|informe)/.test(t) && /(sistema|modulo|motor|todo)/.test(t)) {
    return { type: 'SYSTEM_STATUS', raw: transcript }
  }

  if (/^estado del sistema$/.test(t) || t === 'estado') {
    return { type: 'SYSTEM_STATUS', raw: transcript }
  }

  const fuzzy = matchFuzzyVoiceCommand(t)
  if (fuzzy) {
    switch (fuzzy.id) {
      case 'ALARMS_QUERY':
        return { type: 'ALARMS_QUERY', raw: transcript }
      case 'FIREBASE_STATUS':
        return { type: 'FIREBASE_STATUS', raw: transcript }
      case 'CONSUMPTION_CURRENT':
        return { type: 'CONSUMPTION_CURRENT', raw: transcript }
      case 'CONSUMPTION_VARIATION':
        return { type: 'CONSUMPTION_VARIATION', raw: transcript }
      case 'FAN_CONSUMPTION':
        return { type: 'FAN_CONSUMPTION', raw: transcript }
      case 'WIFI_NETWORK':
        return { type: 'WIFI_NETWORK', raw: transcript }
      case 'TIME_NOW':
        return { type: 'TIME_NOW', raw: transcript }
      case 'DATE_TODAY':
        return { type: 'DATE_TODAY', raw: transcript }
      case 'MODE_AUTO_START':
        return { type: 'MODE_AUTO_START', raw: transcript }
      case 'MODE_AUTO_END':
        return { type: 'MODE_AUTO_END', raw: transcript }
      case 'MODE_MANUAL_START':
        return { type: 'MODE_MANUAL_START', raw: transcript }
      case 'MODE_CURRENT':
        return { type: 'MODE_CURRENT', raw: transcript }
      case 'UPTIME':
        return { type: 'UPTIME', raw: transcript }
      case 'SYSTEM_HEALTH':
        return { type: 'SYSTEM_HEALTH', raw: transcript }
      case 'SETPOINT_QUERY':
        return { type: 'SETPOINT_QUERY', raw: transcript }
    }
  }

  return { type: 'UNKNOWN', raw: transcript }
}

export function VoiceAssistant({ onCommand, lang = 'es-CO', className, embedded = false }: VoiceAssistantProps) {
  const [commandsOpen, setCommandsOpen] = useState(false)
  const {
    status,
    transcript,
    responseText,
    errorMsg,
    startListening,
    isListening,
    isProcessing,
    isUnsupported,
  } = useVoiceRecognition({ lang, onCommand })

  return (
    <div
      className={cn(
        'flex flex-col gap-4 text-card-foreground',
        embedded ? 'p-0' : 'rounded-xl border border-border bg-card p-5',
        className
      )}
      role="region"
      aria-label="Control por voz"
    >
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
            <Volume2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Control por voz</h3>
            <p className="text-xs text-muted-foreground">Comandos hablados para el sistema EcoPulse</p>
          </div>
        </div>
      )}

      <Button
        onClick={startListening}
        disabled={isUnsupported || isProcessing}
        className={cn(
          'h-14 w-full text-base font-semibold transition-colors',
          isListening
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
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
            <Waves className="mr-2 h-5 w-5 animate-pulse" />
            Escuchando...
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
            isListening && 'animate-pulse bg-emerald-500',
            isProcessing && 'animate-pulse bg-accent',
            status === 'idle' && 'bg-muted-foreground/40',
            status === 'error' && 'bg-destructive',
            isUnsupported && 'bg-muted-foreground/40'
          )}
        />
        <span className="text-muted-foreground">
          {isListening && 'Escuchando...'}
          {isProcessing && 'Procesando...'}
          {status === 'idle' && !responseText && 'Listo'}
          {status === 'error' && (errorMsg || 'Error')}
          {isUnsupported && 'Tu navegador no soporta reconocimiento de voz'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setCommandsOpen((open) => !open)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-expanded={commandsOpen}
        aria-controls="voice-commands-panel"
      >
        {commandsOpen ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Ocultar comandos
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            Ver comandos disponibles
          </>
        )}
      </button>

      {commandsOpen && (
        <div
          id="voice-commands-panel"
          className="max-h-72 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3 space-y-3"
        >
          {VOICE_COMMAND_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/80 px-1">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.commands.map(({ cmd, desc }) => (
                  <div
                    key={cmd}
                    className="rounded-md border border-border/60 bg-card/60 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-foreground">{cmd}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {transcript && (
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu voz</p>
          <p className="mt-1 text-sm">{transcript}</p>
        </div>
      )}

      {responseText && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-sm">{responseText}</p>
          </div>
        </div>
      )}
    </div>
  )
}
