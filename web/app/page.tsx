'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { HomePage } from '@/components/dashboard/home-page'
import { MonitoreoPage } from '@/components/dashboard/monitoreo-page'
import { ConfiguracionesPage } from '@/components/dashboard/configuraciones-page'
import { AlertasPage } from '@/components/dashboard/alertas-page'
import { DatosExternosPage } from '@/components/dashboard/datos-externos-page'
import { VoiceFloatingAssistant, type DashboardPage } from '@/components/voice-floating-assistant'
import type { VoiceIntent } from '@/components/voice-assistant'
import { useAVCData } from '@/hooks/use-avc-data'
import { executeVoiceIntent, PAGE_LABELS } from '@/lib/voice-commands'
import { speak } from '@/lib/speech-synthesis'
import { fetchWeatherSummary } from '@/lib/weather'
import { Loader2 } from 'lucide-react'

const DEFAULT_WEATHER_CITY = 'Cali'

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<DashboardPage>('home')
  const [voiceSectionVisible, setVoiceSectionVisible] = useState(false)
  const [commandsMenuOpen, setCommandsMenuOpen] = useState(false)
  const { data, loading, error, updateData, isDemo, lastHeartbeatAt } = useAVCData()

  const handleVoiceSectionVisibleChange = useCallback((visible: boolean) => {
    setVoiceSectionVisible(visible)
  }, [])

  const handleVoiceCommand = useCallback(async (intent: VoiceIntent): Promise<string | null> => {
    if (intent.type === 'SHOW_COMMANDS') {
      setCommandsMenuOpen(true)
      const message = 'Estos son los comandos que puedes decir.'
      speak(message)
      return message
    }

    if (intent.type === 'HIDE_COMMANDS') {
      setCommandsMenuOpen(false)
      const message = 'Menu de comandos cerrado.'
      speak(message)
      return message
    }

    if (intent.type === 'NAVIGATE') {
      setCurrentPage(intent.page)
      const label = PAGE_LABELS[intent.page] ?? intent.page
      const message = `Abriendo ${label}`
      toast.success(message)
      speak(message)
      return message
    }

    if (intent.type === 'WEATHER') {
      const city = intent.city ?? DEFAULT_WEATHER_CITY
      toast.loading(`Consultando clima en ${city}...`, { id: 'weather-voice' })
      try {
        const message = await fetchWeatherSummary(city)
        toast.success(message, { id: 'weather-voice', duration: 8000 })
        speak(message)
        return message
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No pude consultar el clima'
        toast.error(message, { id: 'weather-voice' })
        speak(message)
        return message
      }
    }

    const message = executeVoiceIntent(intent, updateData, data)
    if (message) {
      if (intent.type === 'SYSTEM_STATUS' || intent.type === 'SETPOINT_QUERY') {
        toast.info(message, { duration: 6000 })
      } else {
        toast.success(message)
      }
      speak(message)
      return message
    }

    const fallback = 'Comando no reconocido'
    toast.error(fallback)
    speak(fallback)
    return fallback
  }, [data, updateData])

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
            onUpdate={updateData}
            onVoiceSectionVisibleChange={handleVoiceSectionVisibleChange}
            onVoiceCommand={handleVoiceCommand}
          />
        )
      case 'monitoreo':
        return <MonitoreoPage data={data} onUpdate={updateData} />
      case 'configuraciones':
        return <ConfiguracionesPage data={data} onUpdate={updateData} />
      case 'alertas':
        return <AlertasPage data={data} isDemo={isDemo} lastHeartbeatAt={lastHeartbeatAt} />
      case 'datos-externos':
        return <DatosExternosPage />
      default:
        return (
          <HomePage
            data={data}
            onUpdate={updateData}
            onVoiceSectionVisibleChange={handleVoiceSectionVisibleChange}
            onVoiceCommand={handleVoiceCommand}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="lg:ml-64 bg-card border-b border-border px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">AVC-01 Dashboard</h1>
            <p className="text-xs text-muted-foreground">Sistema de Ventilacion Adaptativa</p>
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
      />

      <main className="lg:ml-64 flex-1 pb-20 lg:pb-0">
        <section className="p-4 md:p-6 lg:p-8">
          {renderPage()}
        </section>
      </main>

      <footer className="lg:ml-64 bg-card border-t border-border px-4 py-4 mt-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>AVC-01 - Adaptive Ventilation Controller | Proyecto de Grado 2024</p>
          <p>Desarrollado con Next.js + Firebase Realtime Database</p>
        </div>
      </footer>

      <VoiceFloatingAssistant
        currentPage={currentPage}
        voiceSectionVisible={voiceSectionVisible}
        commandsMenuOpen={commandsMenuOpen}
        onCommandsMenuOpenChange={setCommandsMenuOpen}
        onCommand={handleVoiceCommand}
        lang="es-CO"
      />
    </div>
  )
}
