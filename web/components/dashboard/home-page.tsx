'use client'

import { useEffect, useRef, useState } from 'react'
import { Thermometer, Droplets, Zap, Play, Square, Mic, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VoiceAssistant } from '@/components/voice-assistant'
import type { VoiceIntent } from '@/components/voice-assistant'
import { cn } from '@/lib/utils'
import type { AVCData } from '@/hooks/use-avc-data'

const HEARTBEAT_MS = 25000

interface HomePageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
  onVoiceSectionVisibleChange?: (visible: boolean) => void
  onVoiceCommand?: (intent: VoiceIntent) => Promise<string | null> | string | null
  isDemo?: boolean
  lastHeartbeatAt?: number | null
}

export function HomePage({
  data,
  onUpdate,
  onVoiceSectionVisibleChange,
  onVoiceCommand,
  isDemo = false,
  lastHeartbeatAt = null,
}: HomePageProps) {
  const voiceSectionRef = useRef<HTMLElement>(null)
  const [now, setNow] = useState(() => Date.now())
  const lecturaViva = !isDemo && lastHeartbeatAt !== null && now - lastHeartbeatAt <= HEARTBEAT_MS

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])
  const velocidadPorcentaje = Math.min(100, Math.max(0, data.velocidad))
  const arc = 2 * Math.PI * 16
  const arcOffset = arc - (velocidadPorcentaje / 100) * arc
  const motorMarcha = lecturaViva && data.estado === 'running'
  const estadoTexto = !lecturaViva ? 'Sin lectura' : data.diag.fallas > 0 ? `${data.diag.fallas} falla(s)` : 'Listo'
  const potenciaTexto = lecturaViva && data.config.sensorPotencia ? `${data.potencia} W` : '-- W'

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">HOME</h2>
          <p className="text-muted-foreground">Lecturas, motor y marcha</p>
        </div>
      </div>

      {!lecturaViva ? (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-1">
            <p className="text-sm font-medium text-foreground">No se puede verificar la operacion</p>
            <p className="text-xs text-muted-foreground">
              {isDemo
                ? 'La página está en datos de demostración, no en el equipo.'
                : 'No llega una lectura reciente. Los números pueden ser la última guarda o un valor vacío.'}
            </p>
            <p className="text-xs text-muted-foreground">Revisar: HMI encendido, WiFi con enlace y Firebase en Leer+enviar.</p>
            <p className="text-xs text-muted-foreground">Si falla: START, STOP y el modo se envían sin confirmar que el motor los ejecutó.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <span className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-blue-600" />
            </span>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">TEMPERATURA</p>
            <p className="text-2xl font-semibold text-foreground">{lecturaViva ? `${data.temperatura} C` : '-- C'}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">SP</span>
              <Input
                type="number"
                value={data.setpoint}
                onChange={(e) => onUpdate('setpoint', Number(e.target.value))}
                className="w-16 h-7 text-center bg-secondary border-border"
              />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <span className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-sky-600" />
            </span>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">HUMEDAD</p>
            <p className="text-2xl font-semibold text-foreground">{lecturaViva ? `${data.humedad} %` : '-- %'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <span className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-600" />
            </span>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">POTENCIA</p>
            <p className="text-2xl font-semibold text-foreground">{potenciaTexto}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <span className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <User className="w-5 h-5 text-purple-500" />
            </span>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">PRESENCIA</p>
            <p className="text-2xl font-semibold text-foreground inline-flex items-center gap-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', lecturaViva && data.movimiento ? 'bg-green-500' : 'bg-muted-foreground')} />
              {lecturaViva ? (data.movimiento ? 'Si' : 'No') : '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">MOTOR</p>
              <p className="text-base font-medium text-foreground inline-flex items-center gap-2 mt-1">
                <span className={cn('w-2.5 h-2.5 rounded-full', motorMarcha ? 'bg-green-500' : 'bg-muted-foreground')} />
                {lecturaViva ? (data.estado === 'running' ? 'En marcha' : 'Parado') : '--'}
              </p>
            </div>
            <div className="border-l border-border pl-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">ESTADO</p>
              <p className={cn('text-base font-medium mt-1', data.diag.fallas > 0 && lecturaViva ? 'text-red-400' : 'text-foreground')}>
                {estadoTexto}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-secondary" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={arc}
                  strokeDashoffset={arcOffset}
                  className="text-blue-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground">
                {velocidadPorcentaje}%
              </span>
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">VELOCIDAD ACTUAL</p>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">DEL MOTOR</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr] gap-3">
        <Button
          onClick={() => onUpdate('estado', 'running')}
          disabled={data.estado === 'running'}
          className="h-12 bg-foreground text-background hover:bg-foreground/90 font-semibold disabled:opacity-50"
        >
          <Play className="w-4 h-4 mr-2" />
          START
        </Button>
        <Button
          onClick={() => onUpdate('estado', 'stopped')}
          disabled={data.estado === 'stopped'}
          variant="outline"
          className="h-12 bg-secondary border-border text-foreground font-semibold disabled:opacity-50"
        >
          <Square className="w-4 h-4 mr-2" />
          STOP
        </Button>
        <Select value={data.modo} onValueChange={(value) => onUpdate('modo', value)}>
          <SelectTrigger className="h-12 bg-card border-blue-500/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTOMATICO">AUTOMATICO</SelectItem>
            <SelectItem value="MANUAL">MANUAL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.modo === 'MANUAL' ? (
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground shrink-0">Velocidad manual</span>
          <input
            type="range"
            min="0"
            max="100"
            value={data.velocidad}
            onChange={(e) => onUpdate('velocidad', Number(e.target.value))}
            className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-foreground font-medium w-12 text-right">{data.velocidad}%</span>
        </div>
      ) : null}

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
