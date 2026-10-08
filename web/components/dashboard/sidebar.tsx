'use client'

import { Home, Activity, Settings, AlertTriangle, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'

type Page = 'home' | 'monitoreo' | 'configuraciones' | 'alertas' | 'datos-externos'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  wifiConnected: boolean
}

const navItems = [
  { id: 'home' as Page, label: 'Inicio', icon: Home },
  { id: 'monitoreo' as Page, label: 'Monitoreo', icon: Activity },
  { id: 'configuraciones' as Page, label: 'Config', icon: Settings },
  { id: 'alertas' as Page, label: 'Alertas', icon: AlertTriangle },
  { id: 'datos-externos' as Page, label: 'Clima', icon: Cloud },
]

const titles: Record<Page, string> = {
  home: 'HOME',
  monitoreo: 'MONITOREO',
  configuraciones: 'CONFIGURACIONES',
  alertas: 'ALERTAS',
  'datos-externos': 'CLIMA',
}

export function Sidebar({ currentPage, onNavigate, wifiConnected }: SidebarProps) {
  const clock = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#d7dde5]">
      <div className="flex items-center gap-2 px-3 h-14">
        <nav className="flex items-center gap-1.5">
          {navItems.map((item) => {
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.label}
                className={cn(
                  'h-9 w-9 rounded-md border flex items-center justify-center',
                  active
                    ? 'bg-[#101828] text-white border-[#101828]'
                    : 'bg-[#f7f8fa] text-[#5b6472] border-[#d7dde5]'
                )}
              >
                <item.icon className="w-4 h-4" />
              </button>
            )
          })}
        </nav>
        <h1 className="flex-1 text-center text-sm font-extrabold tracking-wide text-[#101828]">
          {titles[currentPage]}
        </h1>
        <div className="flex items-center gap-2 min-w-[88px] justify-end">
          <span className={cn('w-2.5 h-2.5 rounded-full', wifiConnected ? 'bg-[#22a35a]' : 'bg-[#D50000]')} />
          <span className="text-xs font-bold text-[#5b6472]">{clock}</span>
        </div>
      </div>
    </header>
  )
}
