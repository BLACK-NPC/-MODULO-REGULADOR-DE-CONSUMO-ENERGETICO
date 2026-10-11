'use client'

import Image from 'next/image'
import { Home, Activity, Settings, AlertTriangle, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

type Page = 'home' | 'monitoreo' | 'configuraciones' | 'alertas' | 'datos-externos'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  wifiConnected: boolean
  faultCount?: number
}

const navItems = [
  { id: 'home' as Page, label: 'Home', icon: Home },
  { id: 'monitoreo' as Page, label: 'Monitoreo', icon: Activity },
  { id: 'configuraciones' as Page, label: 'Configuraciones', icon: Settings },
  { id: 'alertas' as Page, label: 'Alertas', icon: AlertTriangle },
  { id: 'datos-externos' as Page, label: 'Datos Externos', icon: Cloud },
]

export function Sidebar({ currentPage, onNavigate, wifiConnected, faultCount = 0 }: SidebarProps) {
  const fallas = Math.max(0, Math.round(faultCount))
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border h-screen fixed left-0 top-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-black shrink-0">
              <Image
                src="/icono-192.png"
                alt={APP_NAME}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">{APP_NAME}</h1>
              <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    currentPage === item.id
                      ? 'bg-primary text-primary-foreground shadow-lg'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium flex-1 text-left">{item.label}</span>
                  {item.id === 'alertas' && fallas > 0 ? (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-[11px] font-bold text-white flex items-center justify-center">
                      {fallas}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary">
            <div className={cn(
              'w-3 h-3 rounded-full',
              wifiConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            <span className="text-sm text-muted-foreground">
              {wifiConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <ul className="flex justify-around py-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all',
                  currentPage === item.id
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <span className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.id === 'alertas' && fallas > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                      {fallas}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
