'use client'

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { Mic, EyeOff, Waves, Command, ChevronRight } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  FAB_HIDDEN_CHANGE_EVENT,
  FAB_STORAGE_KEY_HIDDEN,
  FAB_STORAGE_KEY_POS,
  isFabHidden,
  setFabHidden,
} from '@/lib/fab-storage'

export type DashboardPage =
  | 'home'
  | 'monitoreo'
  | 'configuraciones'
  | 'alertas'
  | 'datos-externos'

export interface VoiceFloatingAssistantProps {
  currentPage: DashboardPage
  voiceSectionVisible: boolean
  children: ReactNode
  onOpenChange?: (open: boolean) => void
}

const DRAG_THRESHOLD = 8
const FAB_SIZE = 56
const MARGIN = 16

const COMMAND_GROUPS = [
  {
    label: 'Control',
    commands: [
      { cmd: '"Enciende el motor"', desc: 'Activa el motor principal del sistema' },
      { cmd: '"Apaga el motor"', desc: 'Detiene el motor de forma segura' },
      { cmd: '"Modo automatico"', desc: 'Activa la regulacion automatica de consumo' },
      { cmd: '"Modo manual"', desc: 'Pasa a control manual del sistema' },
    ],
  },
  {
    label: 'Consultas',
    commands: [
      { cmd: '"Estado del sistema"', desc: 'Lee el estado actual del regulador' },
      { cmd: '"Cual es el setpoint"', desc: 'Informa el valor de referencia activo' },
      { cmd: '"Clima en Cali"', desc: 'Consulta el pronostico via Open-Meteo' },
    ],
  },
  {
    label: 'Navegacion',
    commands: [
      { cmd: '"Ir a monitoreo"', desc: 'Abre la pantalla de monitoreo en tiempo real' },
      { cmd: '"Abrir alertas"', desc: 'Navega a la seccion de alertas activas' },
      { cmd: '"Ir a configuraciones"', desc: 'Abre los ajustes del regulador' },
    ],
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getDefaultPosition() {
  return {
    x: window.innerWidth - FAB_SIZE - MARGIN,
    y: window.innerHeight - FAB_SIZE - MARGIN - 80,
  }
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(FAB_STORAGE_KEY_POS)
    if (!raw) return null
    const pos = JSON.parse(raw) as { x: number; y: number }
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos
  } catch {
    /* ignore */
  }
  return null
}

export function VoiceFloatingAssistant({
  currentPage,
  voiceSectionVisible,
  children,
  onOpenChange,
}: VoiceFloatingAssistantProps) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    return loadPosition() ?? getDefaultPosition()
  })

  const dragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const totalMove = useRef(0)

  useEffect(() => {
    setHidden(isFabHidden())

    function syncHidden() {
      setHidden(isFabHidden())
    }

    window.addEventListener('storage', syncHidden)
    window.addEventListener(FAB_HIDDEN_CHANGE_EVENT, syncHidden)
    return () => {
      window.removeEventListener('storage', syncHidden)
      window.removeEventListener(FAB_HIDDEN_CHANGE_EVENT, syncHidden)
    }
  }, [])

  const handleOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value)
      onOpenChange?.(value)
    },
    [onOpenChange]
  )

  const shouldHide = hidden || (voiceSectionVisible && currentPage === 'home')

  useEffect(() => {
    localStorage.setItem(FAB_STORAGE_KEY_POS, JSON.stringify(pos))
  }, [pos])

  useEffect(() => {
    function onResize() {
      setPos((p) => ({
        x: clamp(p.x, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
        y: clamp(p.y, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      totalMove.current = 0
      startPointer.current = { x: e.clientX, y: e.clientY }
      startPos.current = { ...pos }
    },
    [pos]
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - startPointer.current.x
    const dy = e.clientY - startPointer.current.y
    totalMove.current = Math.sqrt(dx * dx + dy * dy)
    setPos({
      x: clamp(startPos.current.x + dx, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
      y: clamp(startPos.current.y + dy, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    if (totalMove.current < DRAG_THRESHOLD) handleOpenChange(true)
  }, [handleOpenChange])

  const handleHide = useCallback(() => {
    setFabHidden(true)
    setHidden(true)
    handleOpenChange(false)
  }, [handleOpenChange])

  return (
    <>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Abrir asistente de voz"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          zIndex: 50,
          touchAction: 'none',
          userSelect: 'none',
          opacity: shouldHide ? 0 : 1,
          pointerEvents: shouldHide ? 'none' : 'auto',
          transition: 'opacity 0.3s ease, transform 0.2s ease',
          transform: open ? 'scale(1.08)' : 'scale(1)',
          borderRadius: '9999px',
          border: 'none',
          cursor: 'grab',
          outline: 'none',
          padding: 0,
        }}
        className={[
          'flex items-center justify-center',
          'bg-emerald-600 hover:bg-emerald-500',
          'shadow-lg shadow-emerald-900/40',
          open ? 'ring-4 ring-emerald-400/50 ring-offset-2 ring-offset-gray-950' : '',
        ].join(' ')}
      >
        <Mic size={22} className="text-white" />
        {open && (
          <span
            className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping"
            aria-hidden
          />
        )}
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-white/10 p-0 overflow-hidden"
          style={{ background: 'hsl(240 10% 6%)', maxHeight: '88dvh' }}
        >
          <SheetHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-500/30">
                  <Mic size={16} className="text-emerald-400" />
                </div>
                <div>
                  <SheetTitle className="text-white text-base leading-tight">
                    Asistente de voz
                  </SheetTitle>
                  <p className="text-xs text-emerald-400/80 mt-0.5">AVC-01 · En linea</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="text-emerald-400 border-emerald-700 bg-emerald-950/60 text-[10px] px-2"
              >
                <Waves size={10} className="mr-1" />
                Listo
              </Badge>
            </div>
          </SheetHeader>

          <Separator className="bg-white/8" />

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(88dvh - 140px)' }}>
            <div className="px-5 py-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                {children}
              </div>
            </div>

            <Separator className="bg-white/8" />

            <div className="px-5 py-4 space-y-5">
              <div className="flex items-center gap-2">
                <Command size={13} className="text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  Comandos disponibles
                </span>
              </div>

              {COMMAND_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <p className="text-[11px] font-medium text-emerald-400/70 uppercase tracking-wider px-1">
                    {group.label}
                  </p>
                  <div className="rounded-xl border border-white/8 overflow-hidden divide-y divide-white/5">
                    {group.commands.map(({ cmd, desc }) => (
                      <div
                        key={cmd}
                        className="flex items-start gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                      >
                        <ChevronRight size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium leading-snug">{cmd}</p>
                          <p className="text-xs text-white/40 mt-0.5 leading-snug">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 pb-6 pt-2">
              <button
                type="button"
                onClick={handleHide}
                className="flex items-center gap-2 text-xs text-white/30 hover:text-white/50 transition-colors py-2"
              >
                <EyeOff size={13} />
                Ocultar asistente flotante
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
