'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { AVCData } from '@/hooks/use-avc-data'

interface MonitoreoPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
}

const dias = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export function MonitoreoPage({ data, onUpdate }: MonitoreoPageProps) {
  const [selectedDay, setSelectedDay] = useState('Lun')

  // Transform historical data for the chart
  const chartData = data.historico?.[selectedDay]
    ? data.historico[selectedDay].temperatura.map((temp, index) => ({
        time: index + 1,
        potencia: data.historico[selectedDay].potencia[index] || 0,
        temperatura: temp || 0,
        humedad: data.historico[selectedDay].humedad[index] || 0,
      }))
    : Array.from({ length: 5 }, (_, i) => ({
        time: i + 1,
        potencia: Math.random() * 50,
        temperatura: 20 + Math.random() * 20,
        humedad: Math.random() * 60,
      }))

  const handleBorrarDatos = () => {
    onUpdate(`historico/${selectedDay}`, null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Monitoreo</h2>
          <p className="text-muted-foreground">Historial de datos por dia</p>
        </div>
        <Button
          onClick={handleBorrarDatos}
          variant="outline"
          className="bg-card border-border hover:bg-destructive hover:text-destructive-foreground"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Borrar Datos
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-foreground">Datos del Dia: {selectedDay}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Day selector */}
            <div className="flex lg:flex-col gap-2 flex-wrap">
              {dias.map((dia) => (
                <button
                  key={dia}
                  onClick={() => setSelectedDay(dia)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition-all',
                    selectedDay === dia
                      ? 'bg-cyan-600 text-white'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  {dia}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="flex-1 h-[300px] md:h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" stroke="#666" />
                  <YAxis stroke="#666" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="potencia"
                    name="Potencia"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ fill: '#f97316', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="temperatura"
                    name="Temperatura"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="humedad"
                    name="Humedad"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Values Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Potencia Actual</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-xl font-bold text-foreground">{data.potencia} W</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Temperatura Actual</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xl font-bold text-foreground">{data.temperatura} °C</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Humedad Actual</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-xl font-bold text-foreground">{data.humedad} %</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
