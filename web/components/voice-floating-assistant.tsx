'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, Command, ChevronRight, CheckCircle2, Loader2, Waves } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FAB_HIDDEN_CHANGE_EVENT,
  FAB_STORAGE_KEY_POS,
  isFabHidden,
} from '@/lib/fab-storage'
import { VOICE_COMMAND_GROUPS } from '@/lib/voice-command-menu'
import { useVoiceRecognition } from '@/hooks/use-voice-recognition'
import type { VoiceIntent } from '@/components/voice-assistant'

export type DashboardPage =
  | 'home'
  | 'monitoreo'
  | 'configuraciones'
  | 'alertas'
  | 'datos-externos'

export interface VoiceFloatingAssistantProps {
  currentPage: DashboardPage
  voiceSectionVisible: boolean
  commandsMenuOpen: boolean
  onCommandsMenuOpenChange: (open: boolean) => void
  onCommand: (intent: VoiceIntent) => Promise<string | null> | string | null
  lang?: 'es-CO' | 'es-ES'
}

const DRAG_THRESHOLD = 8
const FAB_SIZE = 56
const MENU_WIDTH = 280
const GAP = 10
const MARGIN = 16

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getDefaultFabPosition() {
  return {
    x: window.innerWidth - FAB_SIZE - MARGIN,
    y: window.innerHeight - FAB_SIZE - MARGIN - 80,
  }
}

function loadFabPosition(): { x: number; y: number } | null {
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

function WaveformBars() {
  return (
    <div className="flex gap-0.5 items-end h-4">
      {[3, 5, 4, 7, 5, 6, 3].map((h, i) => (
        <div
          key={i}
          className="w-0.5 bg-emerald-400 rounded-full animate-pulse"
          style={{ height: `${h * 2}px`, animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  )
}

export function VoiceFloatingAssistant({
  currentPage,
  voiceSectionVisible,
  commandsMenuOpen,
  onCommandsMenuOpenChange,
  onCommand,
  lang = 'es-CO',
}: VoiceFloatingAssistantProps) {
  const [hidden, setHidden] = useState(false)
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    return loadFabPosition() ?? getDefaultFabPosition()
  })
  const [showReadyHint, setShowReadyHint] = useState(false)

  const dragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startFabPos = useRef({ x: 0, y: 0 })
  const totalMove = useRef(0)

  const {
    status,
    transcript,
    responseText,
    errorMsg,
    startListening,
    isListening,
    isProcessing,
  } = useVoiceRecognition({ lang, onCommand })

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

  useEffect(() => {
    if (responseText && status === 'idle') {
      setShowReadyHint(true)
      const timer = window.setTimeout(() => setShowReadyHint(false), 5000)
      return () => window.clearTimeout(timer)
    }
  }, [responseText, status])

  const shouldHide = hidden || (voiceSectionVisible && currentPage === 'home')

  const groupX = fabPos.x - (commandsMenuOpen ? MENU_WIDTH + GAP : 0)
  const groupY = fabPos.y

  useEffect(() => {
    localStorage.setItem(FAB_STORAGE_KEY_POS, JSON.stringify(fabPos))
  }, [fabPos])

  useEffect(() => {
    function onResize() {
      setFabPos((p) => ({
        x: clamp(
          p.x,
          MARGIN + (commandsMenuOpen ? MENU_WIDTH + GAP : 0),
          window.innerWidth - FAB_SIZE - MARGIN
        ),
        y: clamp(p.y, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [commandsMenuOpen])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      totalMove.current = 0
      startPointer.current = { x: e.clientX, y: e.clientY }
      startFabPos.current = { ...fabPos }
    },
    [fabPos]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging.current) return
      const dx = e.clientX - startPointer.current.x
      const dy = e.clientY - startPointer.current.y
      totalMove.current = Math.sqrt(dx * dx + dy * dy)
      setFabPos({
        x: clamp(
          startFabPos.current.x + dx,
          MARGIN + (commandsMenuOpen ? MENU_WIDTH + GAP : 0),
          window.innerWidth - FAB_SIZE - MARGIN
        ),
        y: clamp(
          startFabPos.current.y + dy,
          MARGIN,
          window.innerHeight - FAB_SIZE - MARGIN
        ),
      })
    },
    [commandsMenuOpen]
  )

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    if (totalMove.current < DRAG_THRESHOLD) {
      startListening()
    }
  }, [startListening])

  const showBubble =
    !shouldHide &&
    (isListening || isProcessing || !!transcript || !!responseText || !!errorMsg || showReadyHint)

  if (shouldHide) return null

  return (
    <>
      {showBubble && (
        <div
          className="fixed left-1/2 top-20 z-[60] w-[min(92vw,420px)] -translate-x-1/2 pointer-events-none"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-emerald-500/30 bg-gray-950/95 backdrop-blur-md shadow-xl shadow-black/40 px-4 py-3 space-y-2">
            {isListening && (
              <div className="flex items-center gap-3">
                <Waves className="h-4 w-4 text-emerald-400 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-300">Escuchando...</p>
                  {transcript && (
                    <p className="text-sm text-white/80 mt-1 truncate">{transcript}</p>
                  )}
                </div>
                <WaveformBars />
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 text-emerald-400 animate-spin shrink-0" />
                <p className="text-sm text-white/80">Procesando...</p>
              </div>
            )}

            {!isListening && !isProcessing && responseText && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-white">{responseText}</p>
              </div>
            )}

            {!isListening && !isProcessing && errorMsg && (
              <p className="text-sm text-red-400">{errorMsg}</p>
            )}

            {showReadyHint && !isListening && !isProcessing && (
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <Mic className="h-3.5 w-3.5 text-emerald-400/70" />
                <p className="text-xs text-white/50">En que mas puedo ayudarte?</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="fixed z-50 flex items-end gap-2.5"
        style={{
          left: groupX,
          top: groupY,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {commandsMenuOpen && (
          <div
            className="rounded-2xl border border-white/10 bg-gray-950/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200"
            style={{ width: MENU_WIDTH, maxHeight: 320 }}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Command className="h-4 w-4 text-emerald-400" />
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
                Comandos disponibles
              </p>
            </div>
            <div className="overflow-y-auto max-h-[260px] p-2 space-y-3">
              {VOICE_COMMAND_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="text-[10px] font-medium text-emerald-400/70 uppercase tracking-wider px-2">
                    {group.label}
                  </p>
                  <div className="rounded-xl border border-white/8 overflow-hidden divide-y divide-white/5">
                    {group.commands.map(({ cmd, desc }) => (
                      <div
                        key={cmd}
                        className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03]"
                      >
                        <ChevronRight className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-white font-medium leading-snug">{cmd}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onCommandsMenuOpenChange(false)}
              className="w-full py-2 text-[10px] text-white/30 hover:text-white/50 border-t border-white/10 transition-colors"
            >
              Cerrar menu
            </button>
          </div>
        )}

        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label={isListening ? 'Escuchando' : 'Activar asistente de voz'}
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            flexShrink: 0,
          }}
          className={cn(
            'relative flex items-center justify-center rounded-full border-none cursor-grab outline-none p-0',
            'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/40',
            'transition-transform duration-200',
            isListening && 'scale-110 ring-4 ring-emerald-400/50 ring-offset-2 ring-offset-gray-950'
          )}
        >
          <Mic size={22} className="text-white relative z-10" />
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" aria-hidden />
              <span
                className="absolute inset-[-4px] rounded-full border-2 border-emerald-400/40 animate-pulse"
                aria-hidden
              />
            </>
          )}
        </button>
      </div>
    </>
  )
}
