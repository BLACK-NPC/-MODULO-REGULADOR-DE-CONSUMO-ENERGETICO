'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import type { AVCData } from '@/hooks/use-avc-data'
import { hourlySeries, type Metric } from '@/lib/voice-history'
import { cn } from '@/lib/utils'

const DIAS = [
  { idx: 1, corto: 'Lun', largo: 'Lunes' },
  { idx: 2, corto: 'Mar', largo: 'Martes' },
  { idx: 3, corto: 'Mie', largo: 'Miercoles' },
  { idx: 4, corto: 'Jue', largo: 'Jueves' },
  { idx: 5, corto: 'Vie', largo: 'Viernes' },
  { idx: 6, corto: 'Sab', largo: 'Sabado' },
  { idx: 0, corto: 'Dom', largo: 'Domingo' },
] as const

const CARPETAS: { metric: Metric; label: string; corto: string; unidad: string; path: string; color: string; rgb: string }[] = [
  { metric: 'temperatura', label: 'Temperatura', corto: 'Temp', unidad: 'C', path: 'config/guardarTemperatura', color: 'bg-[#ff3b30]', rgb: '255,59,48' },
  { metric: 'humedad', label: 'Humedad', corto: 'Hum', unidad: '%', path: 'config/guardarHumedad', color: 'bg-[#1d73ff]', rgb: '29,115,255' },
  { metric: 'potencia', label: 'Potencia', corto: 'Pot', unidad: 'W', path: 'config/guardarPotencia', color: 'bg-[#fb7900]', rgb: '251,121,0' },
]

function serie(data: AVCData, dayIdx: number, metric: Metric) {
  return hourlySeries(data, dayIdx, metric).map((value) => (value !== null && value > 0 ? value : null))
}

function diasConDato(data: AVCData, metric: Metric) {
  return DIAS.filter((dia) => serie(data, dia.idx, metric).some((value) => value !== null)).length
}

function franja(valores: (number | null)[]) {
  const horas = valores.flatMap((value, hour) => (value === null ? [] : [hour]))
  if (horas.length === 0) return null
  return { desde: horas[0], hasta: horas[horas.length - 1], n: horas.length }
}

export function DatosAlmacenados({
  data,
  onToggle,
}: {
  data: AVCData
  onToggle: (path: string, value: boolean) => void
}) {
  const [tab, setTab] = useState<'general' | 'carpetas' | 'mapa' | 'reglas'>('mapa')
  const [carpeta, setCarpeta] = useState<Metric | null>(null)
  const [mapa, setMapa] = useState<Metric>('temperatura')
  const [celda, setCelda] = useState('')

  const activo = {
    temperatura: data.config.guardarTemperatura,
    humedad: data.config.guardarHumedad,
    potencia: data.config.guardarPotencia,
  }
  const actual = CARPETAS.find((item) => item.metric === mapa) ?? CARPETAS[0]
  const grilla = DIAS.map((dia) => serie(data, dia.idx, mapa))
  const valores = grilla.flat().filter((value): value is number => value !== null)
  const minimo = valores.length ? Math.min(...valores) : null
  const maximo = valores.length ? Math.max(...valores) : null

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">DATOS ALMACENADOS</p>
        <p className="text-xs text-muted-foreground">Semana publicada por el equipo: carpetas, mapa y horario observado.</p>
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-background p-1">
        {([
          ['general', 'General'],
          ['carpetas', 'Carpetas'],
          ['mapa', 'Mapas'],
          ['reglas', 'Reglas'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn('rounded-md px-2 py-1.5 text-xs font-medium', tab === id ? 'bg-foreground text-background' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <div className="space-y-2">
          {CARPETAS.map((item) => (
            <div key={item.metric} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div>
                <p className="text-sm text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{diasConDato(data, item.metric)}/7 dias con muestras</p>
              </div>
              <Switch
                checked={activo[item.metric]}
                onCheckedChange={(checked) => onToggle(item.path, checked)}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Apagar el registro pausa las muestras nuevas. No borra lo que ya esta en la semana.</p>
        </div>
      ) : null}

      {tab === 'carpetas' ? (
        carpeta === null ? (
          <div className="space-y-2">
            {CARPETAS.map((item) => (
              <button
                key={item.metric}
                type="button"
                onClick={() => setCarpeta(item.metric)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{diasConDato(data, item.metric)}/7 dias guardados · {activo[item.metric] ? 'registro activo' : 'registro pausado'}</span>
                </span>
                <span className="text-xs text-muted-foreground">Abrir</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" onClick={() => setCarpeta(null)} className="text-xs font-medium text-foreground">
              Volver a carpetas
            </button>
            {DIAS.map((dia) => {
              const valoresDia = serie(data, dia.idx, carpeta)
              const rango = franja(valoresDia)
              const unidad = CARPETAS.find((item) => item.metric === carpeta)?.unidad ?? ''
              return (
                <div key={dia.idx} className={cn('rounded-lg border px-3 py-2', rango ? 'border-border bg-card' : 'border-dashed border-border bg-transparent')}>
                  <p className="text-sm text-foreground">{dia.largo}</p>
                  <p className="text-xs text-muted-foreground">
                    {rango
                      ? `${String(rango.desde).padStart(2, '0')}:00 a ${String(rango.hasta).padStart(2, '0')}:00 · ${rango.n} horas`
                      : 'Sin muestras'}
                    {rango ? ` · ${Math.min(...valoresDia.filter((v): v is number => v !== null))}–${Math.max(...valoresDia.filter((v): v is number => v !== null))} ${unidad}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )
      ) : null}

      {tab === 'mapa' ? (
        <div className="space-y-2">
          <div className="flex gap-1">
            {CARPETAS.map((item) => (
              <button
                key={item.metric}
                type="button"
                onClick={() => {
                  setMapa(item.metric)
                  setCelda('')
                }}
                className={cn('rounded-full px-3 py-1 text-xs font-medium', mapa === item.metric ? `${item.color} text-white` : 'border border-border text-muted-foreground')}
              >
                {item.corto}
              </button>
            ))}
          </div>
          {minimo === null || maximo === null ? (
            <p className="text-sm text-muted-foreground">Esta semana no hay muestras de {actual.label.toLowerCase()}.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Bajo {minimo} {actual.unidad}</span>
                <span>Alto {maximo} {actual.unidad}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div className="mb-1 grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-px text-[10px] text-muted-foreground">
                    <span />
                    {Array.from({ length: 24 }, (_, hour) => (
                      <span key={hour} className="text-center">{hour % 4 === 0 ? hour : ''}</span>
                    ))}
                  </div>
                  {DIAS.map((dia, row) => (
                    <div key={dia.idx} className="mb-px grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-px">
                      <span className="self-center text-[10px] text-muted-foreground">{dia.corto}</span>
                      {grilla[row].map((value, hour) => {
                        const tono = value === null || maximo === minimo ? 0.08 : 0.12 + ((value - minimo) / (maximo - minimo)) * 0.88
                        return (
                          <button
                            key={hour}
                            type="button"
                            title={value === null ? `${dia.corto} ${hour}:00 sin muestra` : `${dia.corto} ${hour}:00 · ${value} ${actual.unidad}`}
                            onClick={() => setCelda(value === null ? `${dia.largo} ${String(hour).padStart(2, '0')}:00 sin muestra` : `${dia.largo} ${String(hour).padStart(2, '0')}:00 · ${value} ${actual.unidad}`)}
                            className="h-5 rounded-[3px]"
                            style={{ background: `rgba(${actual.rgb},${tono.toFixed(2)})` }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{celda || 'Toca una hora para ver el valor.'}</p>
            </>
          )}
        </div>
      ) : null}

      {tab === 'reglas' ? (
        <div className="space-y-2">
          {DIAS.map((dia) => {
            const partes = CARPETAS.map((item) => {
              const rango = franja(serie(data, dia.idx, item.metric))
              return rango ? `${item.corto} ${String(rango.desde).padStart(2, '0')}:00–${String(rango.hasta).padStart(2, '0')}:00` : null
            }).filter((item): item is string => item !== null)
            return (
              <div key={dia.idx} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-sm text-foreground">{dia.largo}</p>
                <p className="text-xs text-muted-foreground">{partes.length ? partes.join(' · ') : 'Sin horario guardado'}</p>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">Esto es la franja que el equipo ya publico. El horario de grabacion y el auto-borrado se cambian en el HMI.</p>
        </div>
      ) : null}
    </div>
  )
}
