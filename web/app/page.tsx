'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { HomePage } from '@/components/dashboard/home-page'
import { MonitoreoPage } from '@/components/dashboard/monitoreo-page'
import { ConfiguracionesPage } from '@/components/dashboard/configuraciones-page'
import { AlertasVistas } from '@/components/dashboard/alertas-vistas'
import { DatosExternosPage } from '@/components/dashboard/datos-externos-page'
import { AirePage } from '@/components/dashboard/aire-page'
import { VoiceFloatingAssistant, type DashboardPage } from '@/components/voice-floating-assistant'
import type { VoiceIntent } from '@/components/voice-assistant'
import { useAVCData } from '@/hooks/use-avc-data'
import {
  buildVoiceCommandFields,
  buildVoiceCommandValidationMessage,
  buildVoiceConnectorsContext,
  buildVoiceQueryMessage,
  PAGE_LABELS,
  VOICE_HELP_SUMMARY,
} from '@/lib/voice-commands'
import { type HmiCommandResult } from '@/lib/hmi-command'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { fetchWeatherSummary } from '@/lib/weather'
import { stopSpeaking, getSpeechRate, setSpeechRate, speak } from '@/lib/speech-synthesis'
import { continueDialog, runExt, type ExtCtx } from '@/lib/voice-ext-run'
import { Loader2 } from 'lucide-react'

const DEFAULT_WEATHER_CITY = 'Cali'

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<DashboardPage>('home')
  const [commandsMenuOpen, setCommandsMenuOpen] = useState(false)
  const { data, loading, error, commandUpdate, sendHmiCommand, isDemo, lastHeartbeatAt } = useAVCData()

  // Contexto vivo para la biblioteca ampliada de voz (temporizadores y dialogos lo leen mas tarde).
  const extCtxRef = useRef<ExtCtx | null>(null)
  extCtxRef.current = {
    data,
    isDemo,
    lastHeartbeatAt,
    send: sendHmiCommand,
    navigateAire: () => setCurrentPage('aire'),
    openPane: (pane) => {
      setCurrentPage('configuraciones')
      // Configuraciones debe estar montada para oir el evento.
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('ecopulse-open-pane', { detail: pane })), 350)
    },
  }
  const getExtCtx = useCallback(() => extCtxRef.current as ExtCtx, [])

  const notifyHmiResult = useCallback((result: HmiCommandResult) => {
    if (!result.mensaje) return

    if (result.ok) {
      toast.success(result.mensaje)
      return
    }

    toast.error(result.mensaje, { duration: 8000 })
    void speak(result.mensaje)
  }, [])

  const handleHmiUpdate = useCallback(async (path: string, value: unknown) => {
    const result = await commandUpdate(path, value)
    notifyHmiResult(result)
    return result
  }, [commandUpdate, notifyHmiResult])

  const handleVoiceCommand = useCallback(async (intent: VoiceIntent, signal?: AbortSignal): Promise<string | null> => {
    if (signal?.aborted) return null

    // Conversacion abierta (por ejemplo, programar un perfil): la respuesta se interpreta primero ahi.
    const enDialogo = await continueDialog(intent.raw, intent.type === 'UNKNOWN', getExtCtx)
    if (enDialogo !== undefined) {
      if (signal?.aborted) return null
      if (enDialogo) toast.info(enDialogo, { duration: 8000 })
      return enDialogo
    }

    if (intent.type === 'EXT') {
      const message = await runExt(intent.cmd, getExtCtx)
      if (signal?.aborted) return null
      toast.info(message, { duration: 8000 })
      return message
    }

    if (intent.type === 'GREET') {
      return `Hola. ${APP_NAME} listo. Di "ayuda" para escuchar los comandos disponibles.`
    }

    if (intent.type === 'HELP') {
      return VOICE_HELP_SUMMARY
    }

    if (intent.type === 'TTS_STOP') {
      stopSpeaking()
      return null
    }

    if (intent.type === 'TTS_FASTER') {
      const rate = setSpeechRate(getSpeechRate() + 0.2)
      return `Velocidad ajustada a ${rate.toFixed(1)}`
    }

    if (intent.type === 'TTS_SLOWER') {
      const rate = setSpeechRate(getSpeechRate() - 0.2)
      return `Velocidad ajustada a ${rate.toFixed(1)}`
    }

    if (intent.type === 'SHOW_COMMANDS') {
      setCommandsMenuOpen(false)
      setCurrentPage('configuraciones')
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('ecopulse-open-pane', { detail: 'voz' })), 350)
      return 'Abro el centro de voz. Ahi esta la lista de comandos.'
    }

    if (intent.type === 'HIDE_COMMANDS') {
      setCommandsMenuOpen(false)
      return 'La lista de comandos esta en el centro de voz.'
    }

    if (intent.type === 'NAVIGATE') {
      setCurrentPage(intent.page)
      const label = PAGE_LABELS[intent.page] ?? intent.page
      const message = `Abriendo ${label}`
      toast.success(message)
      return message
    }

    if (intent.type === 'WEATHER') {
      const city = intent.city ?? DEFAULT_WEATHER_CITY
      toast.loading(`Consultando clima en ${city}...`, { id: 'weather-voice' })
      try {
        const message = await fetchWeatherSummary(city)
        if (signal?.aborted) return null
        toast.success(message, { id: 'weather-voice', duration: 8000 })
        return message
      } catch (err) {
        if (signal?.aborted) return null
        const message = err instanceof Error ? err.message : 'No pude consultar el clima'
        toast.error(message, { id: 'weather-voice' })
        return message
      }
    }

    const connectorsCtx = buildVoiceConnectorsContext(data, isDemo, lastHeartbeatAt)
    const queryMessage = buildVoiceQueryMessage(intent, connectorsCtx)
    if (queryMessage) {
      toast.info(queryMessage, { duration: 6000 })
      return queryMessage
    }

    const validationMessage = buildVoiceCommandValidationMessage(intent)
    if (validationMessage) {
      toast.error(validationMessage)
      return validationMessage
    }

    const commandFields = buildVoiceCommandFields(intent, data)
    if (commandFields) {
      toast.loading('Enviando comando al HMI...', { id: 'hmi-cmd' })
      const result = await sendHmiCommand(commandFields)
      if (signal?.aborted) return null
      toast.dismiss('hmi-cmd')

      if (result.ok) {
        toast.success(result.mensaje)
      } else {
        toast.error(result.mensaje, { duration: 8000 })
      }

      return result.mensaje
    }

    const fallback = 'Comando no reconocido. Di "ayuda" para ver opciones.'
    toast.error(fallback)
    return fallback
  }, [data, sendHmiCommand, isDemo, lastHeartbeatAt, getExtCtx])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground">Conectando con Firebase...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <span className="text-3xl text-red-400">!</span>
          </div>
          <h2 className="text-xl font-bold text-foreground">Error de Conexion</h2>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">
            Verifica que las variables de entorno de Firebase esten correctamente configuradas.
          </p>
        </div>
      </div>
    )
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <HomePage
            data={data}
            onUpdate={handleHmiUpdate}
            isDemo={isDemo}
            lastHeartbeatAt={lastHeartbeatAt}
          />
        )
      case 'monitoreo':
        return <MonitoreoPage data={data} onUpdate={handleHmiUpdate} />
      case 'configuraciones':
        return (
          <ConfiguracionesPage
            data={data}
            onUpdate={handleHmiUpdate}
            isDemo={isDemo}
            lastHeartbeatAt={lastHeartbeatAt}
            onNavigate={setCurrentPage}
          />
        )
      case 'alertas':
        return (
          <AlertasVistas
            data={data}
            isDemo={isDemo}
            lastHeartbeatAt={lastHeartbeatAt}
            onGo={(pane) => {
              setCurrentPage('configuraciones')
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('ecopulse-open-pane', { detail: pane })), 350)
            }}
          />
        )
      case 'datos-externos':
        return <DatosExternosPage />
      case 'aire':
        return <AirePage data={data} />
      default:
        return (
          <HomePage
            data={data}
            onUpdate={handleHmiUpdate}
            isDemo={isDemo}
            lastHeartbeatAt={lastHeartbeatAt}
          />
        )
    }
  }

  return (
    <>
      <div className="min-h-screen bg-background flex flex-col">
        <header className="lg:ml-64 bg-card border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground">{APP_NAME}</h1>
              <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
            </div>
            <div className="flex items-center gap-2">
              {isDemo ? (
                <span className="px-2 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Modo Demo
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                  Firebase Conectado
                </span>
              )}
            </div>
          </div>
        </header>

        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          wifiConnected={data.wifi.conectado}
          faultCount={data.diag.fallas}
        />

        <main className="lg:ml-64 flex-1 pb-20 lg:pb-0">
          <section className="p-4 md:p-6 lg:p-8">
            {renderPage()}
          </section>
        </main>

        <footer className="lg:ml-64 bg-card border-t border-border px-4 py-4 mt-auto shrink-0">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>{APP_NAME} | Modulo regulador de consumo energetico</p>
          </div>
        </footer>
      </div>

      <VoiceFloatingAssistant
        currentPage={currentPage}
        voiceSectionVisible={false}
        commandsMenuOpen={commandsMenuOpen}
        onCommandsMenuOpenChange={setCommandsMenuOpen}
        onCommand={handleVoiceCommand}
        lang="es-CO"
      />
    </>
  )
}
