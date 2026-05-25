'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { HomePage } from '@/components/dashboard/home-page'
import { MonitoreoPage } from '@/components/dashboard/monitoreo-page'
import { ConfiguracionesPage } from '@/components/dashboard/configuraciones-page'
import { AlertasPage } from '@/components/dashboard/alertas-page'
import { DatosExternosPage } from '@/components/dashboard/datos-externos-page'
import { useAVCData } from '@/hooks/use-avc-data'
import { Loader2 } from 'lucide-react'

type Page = 'home' | 'monitoreo' | 'configuraciones' | 'alertas' | 'datos-externos'

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const { data, loading, error, updateData, isDemo, lastHeartbeatAt } = useAVCData()

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
        return <HomePage data={data} onUpdate={updateData} />
      case 'monitoreo':
        return <MonitoreoPage data={data} onUpdate={updateData} />
      case 'configuraciones':
        return <ConfiguracionesPage data={data} onUpdate={updateData} />
      case 'alertas':
        return <AlertasPage data={data} isDemo={isDemo} lastHeartbeatAt={lastHeartbeatAt} />
      case 'datos-externos':
        return <DatosExternosPage />
      default:
        return <HomePage data={data} onUpdate={updateData} />
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header Principal */}
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
      
      {/* Main Content */}
      <main className="lg:ml-64 flex-1 pb-20 lg:pb-0">
        <section className="p-4 md:p-6 lg:p-8">
          {renderPage()}
        </section>
      </main>

      {/* Footer Global */}
      <footer className="lg:ml-64 bg-card border-t border-border px-4 py-4 mt-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>AVC-01 - Adaptive Ventilation Controller | Proyecto de Grado 2024</p>
          <p>Desarrollado con Next.js + Firebase Realtime Database</p>
        </div>
      </footer>
    </div>
  )
}
