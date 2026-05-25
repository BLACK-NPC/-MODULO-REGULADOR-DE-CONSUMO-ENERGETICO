'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Bell, Thermometer, Droplets, Zap, PersonStanding, Wifi, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buildAVCAlerts, type AVCAlertItem, type AVCAlertState } from '@/lib/avc-alerts'
import type { AVCData } from '@/hooks/use-avc-data'

interface AlertasPageProps {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
}

const stateStyles: Record<AVCAlertState, {
  icon: typeof CheckCircle
  badge: string
  bg: string
  border: string
  iconColor: string
}> = {
  ENCENDIDO: {
    icon: CheckCircle,
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    iconColor: 'text-green-400',
  },
  FALLA: {
    icon: XCircle,
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    iconColor: 'text-red-400',
  },
  APAGADO: {
    icon: AlertTriangle,
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    iconColor: 'text-yellow-400',
  },
}

const itemIcons: Record<string, typeof Thermometer> = {
  temperatura: Thermometer,
  humedad: Droplets,
  potencia: Zap,
  movimiento: PersonStanding,
  wifi: Wifi,
  firebase: Database,
}

function relativeHeartbeat(lastHeartbeatAt: number | null, now: number): string {
  if (lastHeartbeatAt === null) {
    return 'Sin heartbeat recibido'
  }

  const seconds = Math.max(0, Math.floor((now - lastHeartbeatAt) / 1000))
  if (seconds < 60) {
    return `Hace ${seconds}s`
  }

  return `Hace ${Math.floor(seconds / 60)} min`
}

export function AlertasPage({ data, isDemo, lastHeartbeatAt }: AlertasPageProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const alerts = useMemo(() => buildAVCAlerts(data, lastHeartbeatAt, isDemo, now), [data, isDemo, lastHeartbeatAt, now])
  const stats = useMemo(
    () => ({
      ENCENDIDO: alerts.filter((alert) => alert.state === 'ENCENDIDO').length,
      FALLA: alerts.filter((alert) => alert.state === 'FALLA').length,
      APAGADO: alerts.filter((alert) => alert.state === 'APAGADO').length,
    }),
    [alerts],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Alertas</h2>
          <p className="text-muted-foreground">Estado actual de fallas siguiendo la logica del HMI</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Heartbeat HMI</p>
          <p>{relativeHeartbeat(lastHeartbeatAt, now)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['ENCENDIDO', 'FALLA', 'APAGADO'] as const).map((state) => {
          const style = stateStyles[state]
          return (
            <Card key={state} className={cn('bg-card border-border', style.border)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', style.bg)}>
                  <style.icon className={cn('w-5 h-5', style.iconColor)} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats[state]}</p>
                  <p className="text-xs text-muted-foreground">{state}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Estado de sensores y conectividad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert: AVCAlertItem) => {
            const style = stateStyles[alert.state]
            const ItemIcon = itemIcons[alert.id]
            return (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border',
                  style.bg,
                  style.border
                )}
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', style.bg)}>
                  <ItemIcon className={cn('w-5 h-5', style.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-foreground">{alert.title}</h4>
                    <span className={cn('text-xs border px-2 py-1 rounded-full shrink-0', style.badge)}>
                      {alert.state}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">{alert.detail}</p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
