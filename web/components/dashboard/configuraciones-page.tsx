'use client'

import { Droplets, Thermometer, Zap, PersonStanding } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { AVCData } from '@/hooks/use-avc-data'

interface ConfiguracionesPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
}

const configItems = [
  {
    id: 'guardarHumedad',
    label: 'GUARDAR DATOS DE HUMEDAD',
    icon: Droplets,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  {
    id: 'guardarTemperatura',
    label: 'GUARDAR DATOS DE TEMPERATURA',
    icon: Thermometer,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  {
    id: 'guardarPotencia',
    label: 'GUARDAR DATOS DE POTENCIA',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  {
    id: 'guardarMovimiento',
    label: 'GUARDAR DATOS DE MOVIMIENTO',
    icon: PersonStanding,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
]

export function ConfiguracionesPage({ data, onUpdate }: ConfiguracionesPageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configuraciones</h2>
        <p className="text-muted-foreground">Administra las opciones de guardado de datos</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Opciones de Guardado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${item.bgColor} flex items-center justify-center`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <span className="font-medium text-foreground">{item.label}</span>
              </div>
              <Switch
                checked={data.config[item.id as keyof typeof data.config]}
                onCheckedChange={(checked) => onUpdate(`config/${item.id}`, checked)}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Additional Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Informacion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Activa las opciones de guardado para almacenar los datos en Firebase y poder visualizarlos 
            en la seccion de Monitoreo. Los datos se guardan automaticamente cada minuto cuando estan habilitados.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
