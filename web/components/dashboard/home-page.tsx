'use client'

import { useCallback } from 'react'
import { Thermometer, Droplets, Zap, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VoiceAssistant, type VoiceIntent } from '@/components/voice-assistant'
import { executeVoiceIntent } from '@/lib/voice-commands'
import { cn } from '@/lib/utils'
import type { AVCData } from '@/hooks/use-avc-data'

interface HomePageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
}

export function HomePage({ data, onUpdate }: HomePageProps) {
  const velocidadPorcentaje = Math.min(100, Math.max(0, data.velocidad))
  const circumference = 2 * Math.PI * 45
  const strokeDashoffset = circumference - (velocidadPorcentaje / 100) * circumference

  const handleVoiceCommand = useCallback((intent: VoiceIntent) => {
    const message = executeVoiceIntent(intent, onUpdate, data)
    if (message) {
      if (intent.type === 'SYSTEM_STATUS') {
        toast.info(message, { duration: 6000 })
      } else {
        toast.success(message)
      }
      return
    }

    toast.error('Comando no reconocido')
  }, [data, onUpdate])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Panel Principal</h2>
          <p className="text-muted-foreground">Control y monitoreo en tiempo real</p>
        </div>
        <div className={cn(
          'px-4 py-2 rounded-full text-sm font-medium',
          data.estado === 'running' 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        )}>
          {data.estado === 'running' ? 'En Operacion' : 'Detenido'}
        </div>
      </div>

      {/* Sensor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Temperatura */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Thermometer className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-muted-foreground font-medium">Temperatura</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-foreground">{data.temperatura}</span>
              <span className="text-2xl text-muted-foreground">°C</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">SP:</span>
              <Input
                type="number"
                value={data.setpoint}
                onChange={(e) => onUpdate('setpoint', Number(e.target.value))}
                className="w-20 h-8 text-center bg-secondary border-border"
              />
            </div>
          </CardContent>
        </Card>

        {/* Humedad */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-muted-foreground font-medium">Humedad</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-foreground">{data.humedad}</span>
              <span className="text-2xl text-muted-foreground">%</span>
            </div>
            <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${data.humedad}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Velocidad Gauge */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-muted-foreground font-medium">Velocidad</span>
            </div>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-secondary"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="text-cyan-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-muted-foreground">V:</span>
                  <span className="text-2xl font-bold text-foreground">{data.velocidad}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Controles de Operacion</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Start/Stop Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={() => onUpdate('estado', 'running')}
                disabled={data.estado === 'running'}
                className="flex-1 h-14 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50"
              >
                <Play className="w-5 h-5 mr-2" />
                START
              </Button>
              <Button
                onClick={() => onUpdate('estado', 'stopped')}
                disabled={data.estado === 'stopped'}
                className="flex-1 h-14 bg-gray-600 hover:bg-gray-700 text-white font-semibold disabled:opacity-50"
              >
                <Square className="w-5 h-5 mr-2" />
                STOP
              </Button>
            </div>

            {/* Mode Select */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Modo de Operacion</label>
              <Select
                value={data.modo}
                onValueChange={(value) => onUpdate('modo', value)}
              >
                <SelectTrigger className="h-14 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTOMATICO">AUTOMATICO</SelectItem>
                  <SelectItem value="MANUAL">MANUAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Manual Speed Control */}
          {data.modo === 'MANUAL' && (
            <div className="mt-4 space-y-2">
              <label className="text-sm text-muted-foreground">Velocidad Manual (0-100)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={data.velocidad}
                  onChange={(e) => onUpdate('velocidad', Number(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-foreground font-medium w-12 text-right">{data.velocidad}%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Potencia */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Potencia Actual</span>
                <p className="text-3xl font-bold text-foreground">{data.potencia} W</p>
              </div>
            </div>
            <div className={cn(
              'w-4 h-4 rounded-full',
              data.movimiento ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
            )} title={data.movimiento ? 'Movimiento detectado' : 'Sin movimiento'} />
          </div>
        </CardContent>
      </Card>

      <VoiceAssistant onCommand={handleVoiceCommand} lang="es-CO" />
    </div>
  )
}
