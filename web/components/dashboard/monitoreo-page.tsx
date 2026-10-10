'use client'

import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AVCData, AVCHistoryDay } from '@/hooks/use-avc-data'

interface MonitoreoPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
}

type Vista = 'combinado' | 'paneles' | 'detalle' | 'ahora' | 'log'
type Metrica = 'temperatura' | 'humedad' | 'potencia'

const DIAS = [
  { key: 'Lun', label: 'LUN' },
  { key: 'Mar', label: 'MAR' },
  { key: 'Mie', label: 'MIE' },
  { key: 'Jue', label: 'JUE' },
  { key: 'Vie', label: 'VIE' },
  { key: 'Sab', label: 'SAB' },
  { key: 'Dom', label: 'DOM' },
]

const COLORES = {
  temperatura: '#FF3B30',
  humedad: '#1D73FF',
  potencia: '#FB7900',
}

const METRICAS: { id: Metrica; titulo: string; unidad: string; eje: string }[] = [
  { id: 'temperatura', titulo: 'TEMP', unidad: 'C', eje: 'Temperatura' },
  { id: 'humedad', titulo: 'HUM', unidad: '%', eje: 'Humedad' },
  { id: 'potencia', titulo: 'POT', unidad: 'W', eje: 'Potencia' },
]

function diaDeHoy(): string {
  return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][new Date().getDay()]
}

function serieDelDia(dia: AVCHistoryDay | undefined) {
  const temperatura = dia?.temperatura ?? []
  const humedad = dia?.humedad ?? []
  const potencia = dia?.potencia ?? []
  const total = Math.max(temperatura.length, humedad.length, potencia.length)
  return Array.from({ length: total }, (_, index) => ({
    hora: String(index).padStart(2, '0'),
    temperatura: Number.isFinite(temperatura[index]) ? temperatura[index] : null,
    humedad: Number.isFinite(humedad[index]) ? humedad[index] : null,
    potencia: Number.isFinite(potencia[index]) ? potencia[index] : null,
  }))
}

function resumen(valores: Array<number | null>) {
  const validos = valores.filter((value): value is number => value !== null && Number.isFinite(value))
  if (validos.length === 0) {
    return null
  }
  const total = validos.reduce((sum, value) => sum + value, 0)
  return {
    min: Math.min(...validos),
    max: Math.max(...validos),
    avg: Math.round((total / validos.length) * 10) / 10,
    n: validos.length,
  }
}

export function MonitoreoPage({ data, onUpdate }: MonitoreoPageProps) {
  const [selectedDay, setSelectedDay] = useState(diaDeHoy)
  const [vista, setVista] = useState<Vista>('combinado')
  const [foco, setFoco] = useState<Metrica>('temperatura')

  const puntos = useMemo(() => serieDelDia(data.historico?.[selectedDay]), [data.historico, selectedDay])
  const hayMuestras = puntos.some((punto) => punto.temperatura !== null || punto.humedad !== null || punto.potencia !== null)
  const metrica = METRICAS.find((item) => item.id === foco) ?? METRICAS[0]
  const stats = resumen(puntos.map((punto) => punto[foco]))

  const lecturas = [
    { id: 'potencia' as const, titulo: 'Potencia', valor: `${data.potencia} W`, color: COLORES.potencia },
    { id: 'temperatura' as const, titulo: 'Temperatura', valor: `${data.temperatura} C`, color: COLORES.temperatura },
    { id: 'humedad' as const, titulo: 'Humedad', valor: `${data.humedad} %`, color: COLORES.humedad },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Monitoreo</h2>
          <p className="text-muted-foreground">Misma distribucion del HMI: dias, lecturas y grafica</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={vista === 'ahora' ? 'default' : 'outline'} onClick={() => setVista('ahora')}>
            AHORA
          </Button>
          <Button type="button" variant={vista === 'log' ? 'default' : 'outline'} onClick={() => setVista('log')}>
            LOG
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {DIAS.map((dia) => (
              <button
                key={dia.key}
                type="button"
                onClick={() => setSelectedDay(dia.key)}
                className={cn(
                  'h-8 rounded-full border text-xs font-medium',
                  selectedDay === dia.key
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card text-muted-foreground border-border',
                )}
              >
                {dia.label}
              </button>
            ))}
          </div>
          {lecturas.map((lectura) => (
            <button
              key={lectura.id}
              type="button"
              onClick={() => {
                setFoco(lectura.id)
                setVista('detalle')
              }}
              className={cn(
                'w-full rounded-md border bg-card px-3 py-2 text-left',
                foco === lectura.id && vista === 'detalle' ? 'border-foreground' : 'border-border',
              )}
            >
              <p className="text-[11px] text-muted-foreground">{lectura.titulo}</p>
              <p className="text-sm font-semibold" style={{ color: lectura.color }}>{lectura.valor}</p>
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => onUpdate(`historico/${selectedDay}`, null)}
            className="w-full bg-card border-border"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Borrar {selectedDay}
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            {vista === 'ahora' ? (
              <Ahora data={data} puntos={puntos} />
            ) : vista === 'log' ? (
              <Log />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{selectedDay}</p>
                  <div className="flex gap-1">
                    {(['combinado', 'paneles', 'detalle'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setVista(item)}
                        className={cn(
                          'h-8 px-3 rounded-full border text-xs font-medium capitalize',
                          vista === item ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground',
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {!hayMuestras ? (
                  <div className="h-[280px] rounded-lg border border-border flex items-center justify-center px-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Sin muestras de {selectedDay}. No se dibuja una curva.
                    </p>
                  </div>
                ) : vista === 'paneles' ? (
                  <div className="space-y-2">
                    {METRICAS.map((item) => (
                      <div key={item.id} className="rounded-md border border-border px-3 py-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold" style={{ color: COLORES[item.id] }}>{item.titulo}</p>
                          <p className="text-xs text-foreground">
                            {puntos.at(-1)?.[item.id] ?? '--'} {item.unidad}
                          </p>
                        </div>
                        <div className="h-[72px]">
                          <Mini data={puntos} metrica={item.id} color={COLORES[item.id]} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : vista === 'detalle' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">{metrica.eje} · {selectedDay}</p>
                      <p className="text-sm font-medium" style={{ color: COLORES[foco] }}>
                        {puntos.at(-1)?.[foco] ?? '--'} {metrica.unidad}
                      </p>
                    </div>
                    <div className="h-[280px]">
                      <Mini data={puntos} metrica={foco} color={COLORES[foco]} eje />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stats
                        ? `Min ${stats.min} · max ${stats.max} · promedio ${stats.avg} ${metrica.unidad} · ${stats.n} muestras`
                        : 'Esta metrica no tiene muestras en el dia.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>C / %</span>
                      <span style={{ color: COLORES.potencia }}>W</span>
                    </div>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="#333" vertical={false} />
                          <XAxis dataKey="hora" stroke="#666" interval={3} />
                          <YAxis yAxisId="clima" stroke="#666" domain={[0, 100]} width={32} />
                          <YAxis yAxisId="watts" orientation="right" stroke={COLORES.potencia} width={36} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                          />
                          <Line yAxisId="watts" type="monotone" dataKey="potencia" name="Potencia W" stroke={COLORES.potencia} strokeWidth={2} dot={false} connectNulls={false} />
                          <Line yAxisId="clima" type="monotone" dataKey="humedad" name="Humedad %" stroke={COLORES.humedad} strokeWidth={2} dot={false} connectNulls={false} />
                          <Line yAxisId="clima" type="monotone" dataKey="temperatura" name="Temperatura C" stroke={COLORES.temperatura} strokeWidth={3} dot={false} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {METRICAS.map((item) => (
                        <span key={item.id} className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-border text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORES[item.id] }} />
                          {item.titulo}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Mini({
  data,
  metrica,
  color,
  eje = false,
}: {
  data: ReturnType<typeof serieDelDia>
  metrica: Metrica
  color: string
  eje?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#333" vertical={false} />
        <XAxis dataKey="hora" stroke="#666" interval={3} hide={!eje} />
        <YAxis stroke="#666" width={eje ? 32 : 0} hide={!eje} />
        <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} />
        <Line type="monotone" dataKey={metrica} name={metrica} stroke={color} strokeWidth={eje ? 3 : 2} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function Ahora({
  data,
  puntos,
}: {
  data: AVCData
  puntos: ReturnType<typeof serieDelDia>
}) {
  const filas = [
    { nombre: 'Temperatura', valor: `${data.temperatura} C`, anterior: puntos.at(-2)?.temperatura, actual: puntos.at(-1)?.temperatura, unidad: 'C' },
    { nombre: 'Humedad', valor: `${data.humedad} %`, anterior: puntos.at(-2)?.humedad, actual: puntos.at(-1)?.humedad, unidad: '%' },
    { nombre: 'Potencia', valor: `${data.potencia} W`, anterior: puntos.at(-2)?.potencia, actual: puntos.at(-1)?.potencia, unidad: 'W' },
    { nombre: 'Motor', valor: data.estado === 'running' ? 'En marcha' : 'Parado', anterior: null, actual: null, unidad: '' },
  ]
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">MONITOREO - AHORA</p>
      {filas.map((fila) => {
        const tendencia =
          fila.anterior === null || fila.anterior === undefined || fila.actual === null || fila.actual === undefined
            ? 'Sin dos muestras para ver la tendencia'
            : `${fila.actual - fila.anterior >= 0 ? '+' : ''}${Math.round((fila.actual - fila.anterior) * 10) / 10} ${fila.unidad}`
        return (
          <div key={fila.nombre} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm text-foreground">{fila.nombre}</p>
              <p className="text-xs text-muted-foreground">{fila.unidad ? tendencia : 'Estado actual'}</p>
            </div>
            <p className="text-sm font-medium text-foreground">{fila.valor}</p>
          </div>
        )
      })}
    </div>
  )
}

function Log() {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">DECISIONES DEL SISTEMA</p>
      <div className="grid grid-cols-[72px_1fr_1fr] gap-2 text-[11px] font-bold text-muted-foreground">
        <span>HORA</span>
        <span>QUE PASO</span>
        <span>QUE HIZO EL SISTEMA</span>
      </div>
      <p className="text-sm text-muted-foreground">
        El HMI guarda esta tabla en el equipo. Esta lectura no trae las filas, asi que no se inventan decisiones.
      </p>
    </div>
  )
}
