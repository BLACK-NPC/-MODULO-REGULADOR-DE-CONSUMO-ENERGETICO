'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VoiceAssistant } from '@/components/voice-assistant'
import type { VoiceIntent } from '@/components/voice-assistant'
import type { AVCData } from '@/hooks/use-avc-data'
import type { HmiCommandResult } from '@/lib/hmi-command'

interface HomePageProps {
  data: AVCData
  hmiReachable: boolean
  isDemo: boolean
  onUpdate: (path: string, value: unknown) => Promise<HmiCommandResult>
  onVoiceSectionVisibleChange?: (visible: boolean) => void
  onVoiceCommand?: (intent: VoiceIntent) => Promise<string | null> | string | null
}

export function HomePage({
  data,
  hmiReachable,
  isDemo,
  onUpdate,
  onVoiceSectionVisibleChange,
  onVoiceCommand,
}: HomePageProps) {
  const voiceSectionRef = useRef<HTMLElement>(null)
  const velocidadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [setpointDraft, setSetpointDraft] = useState(String(data.setpoint))

  const velocidadPorcentaje = Math.min(100, Math.max(0, data.velocidad))

  useEffect(() => {
    setSetpointDraft(String(data.setpoint))
  }, [data.setpoint])

  useEffect(() => {
    if (!onVoiceSectionVisibleChange) return
    const el = voiceSectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        onVoiceSectionVisibleChange(entry.isIntersecting)
      },
      { threshold: 0.3 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onVoiceSectionVisibleChange])

  useEffect(() => {
    return () => {
      if (velocidadTimerRef.current) {
        clearTimeout(velocidadTimerRef.current)
      }
    }
  }, [])

  async function runCommand(path: string, value: unknown) {
    if (pendingPath) return
    setPendingPath(path)
    try {
      await onUpdate(path, value)
    } finally {
      setPendingPath(null)
    }
  }

  function handleVelocidadChange(value: number) {
    if (velocidadTimerRef.current) {
      clearTimeout(velocidadTimerRef.current)
    }
    velocidadTimerRef.current = setTimeout(() => {
      void runCommand('velocidad', value)
    }, 600)
  }

  async function commitSetpoint() {
    const parsed = Number(setpointDraft)
    if (!Number.isFinite(parsed) || parsed === data.setpoint) {
      setSetpointDraft(String(data.setpoint))
      return
    }
    await runCommand('setpoint', parsed)
  }

  const controlsLocked = pendingPath !== null
  const showHmiWarning = !isDemo && !hmiReachable

  const arcFilled = (velocidadPorcentaje / 100) * 300

  return (
    <div className="space-y-4">
      {showHmiWarning && (
        <p className="text-sm text-[#101828] bg-white border border-[#c3cbd6] rounded-lg px-3 py-2">
          El modulo no responde. Enciendelo y conectalo a WiFi antes de usar los controles.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#c3cbd6] rounded-lg p-4 min-h-[168px]">
          <p className="text-xs font-bold text-[#5b6472]">Temperatura °C</p>
          <p className="mt-3 text-4xl font-extrabold text-[#101828] leading-none">{data.temperatura} °C</p>
          <div className="mt-5 flex items-center gap-2 text-sm font-bold">
            <span>SP:</span>
            <Input
              type="number"
              value={setpointDraft}
              disabled={controlsLocked || pendingPath === 'setpoint'}
              onChange={(e) => setSetpointDraft(e.target.value)}
              onBlur={() => void commitSetpoint()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-14 h-8 text-center bg-[#F5F5F5] border-[#A8A8A8] text-[#101828] font-extrabold"
            />
          </div>
        </div>

        <div className="bg-white border border-[#c3cbd6] rounded-lg p-4 min-h-[168px]">
          <p className="text-xs font-bold text-[#5b6472]">Humedad</p>
          <p className="mt-3 text-4xl font-extrabold text-[#101828] leading-none">{data.humedad} %</p>
        </div>

        <div className="bg-white border border-[#c3cbd6] rounded-lg p-4 min-h-[168px] flex flex-col items-center">
          <div
            className="relative w-[132px] h-[132px] rounded-full"
            style={{
              background: `conic-gradient(from 210deg, #2F6FED 0deg ${arcFilled}deg, #e5e7eb ${arcFilled}deg 300deg, transparent 300deg 360deg)`,
              WebkitMask: 'radial-gradient(circle at center, transparent 42px, #000 43px)',
              mask: 'radial-gradient(circle at center, transparent 42px, #000 43px)',
            }}
          />
          <div className="-mt-[92px] mb-8 text-center leading-none">
            <p className="text-2xl font-extrabold text-[#101828]">{velocidadPorcentaje}%</p>
            <p className="mt-1 text-[10px] font-bold text-[#5b6472]">velocidad</p>
          </div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#5b6472]">OPERACION</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <Button
          onClick={() => void runCommand('estado', 'running')}
          disabled={data.estado === 'running' || controlsLocked}
          className="h-12 md:w-44 bg-[#101828] hover:bg-black text-white font-extrabold rounded-lg"
        >
          {pendingPath === 'estado' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          START
        </Button>
        <Button
          onClick={() => void runCommand('estado', 'stopped')}
          disabled={data.estado === 'stopped' || controlsLocked}
          className="h-12 md:w-44 bg-[#e5e7eb] hover:bg-[#d7dde5] text-[#101828] font-extrabold rounded-lg border border-[#c3cbd6]"
        >
          STOP
        </Button>
        <Select
          value={data.modo}
          disabled={controlsLocked}
          onValueChange={(value) => void runCommand('modo', value)}
        >
          <SelectTrigger className="h-12 md:w-52 bg-white border-[#c3cbd6] text-[#101828] font-extrabold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTOMATICO">AUTOMATICO</SelectItem>
            <SelectItem value="MANUAL">MANUAL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.modo === 'MANUAL' && (
        <div className="bg-white border border-[#c3cbd6] rounded-lg p-4">
          <p className="text-xs font-bold text-[#5b6472] mb-2">Velocidad manual</p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={data.velocidad}
              disabled={controlsLocked}
              onChange={(e) => handleVelocidadChange(Number(e.target.value))}
              className="flex-1 accent-[#2F6FED]"
            />
            <span className="font-extrabold w-12 text-right">{data.velocidad}%</span>
          </div>
        </div>
      )}

      <section
        id="voice-assistant-section"
        ref={voiceSectionRef}
        aria-label="Control por voz"
      >
        <Card className="bg-card border-emerald-500/30">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Control por voz</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Comandos hablados para EcoPulse. En otras pantallas usa el boton flotante.
                </p>
              </div>
            </div>
            {onVoiceCommand && (
              <VoiceAssistant onCommand={onVoiceCommand} lang="es-CO" />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
