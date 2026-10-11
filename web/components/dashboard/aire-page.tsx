'use client'

import { useEffect, useMemo, useState } from 'react'
import { Snowflake } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AVCData } from '@/hooks/use-avc-data'

const CLAVE = 'ecopulse-aire'
const MIN = 16
const MAX = 30

type Modo = 'cool' | 'heat' | 'fan' | 'dry' | 'auto'
type Ventilador = 'low' | 'medium' | 'high' | 'auto'

type EstadoAire = {
  encendido: boolean
  objetivo: number
  modo: Modo
  ventilador: Ventilador
  swing: boolean
  temporizador: boolean
  sleep: boolean
}

const INICIAL: EstadoAire = {
  encendido: true,
  objetivo: 22,
  modo: 'cool',
  ventilador: 'medium',
  swing: false,
  temporizador: false,
  sleep: false,
}

const MODOS: { id: Modo; icono: string; nombre: string }[] = [
  { id: 'cool', icono: '❄', nombre: 'Frio' },
  { id: 'heat', icono: '☼', nombre: 'Calor' },
  { id: 'fan', icono: '✣', nombre: 'Ventilador' },
  { id: 'dry', icono: '♢', nombre: 'Deshumidificar' },
  { id: 'auto', icono: 'Ⓐ', nombre: 'Automatico' },
]

const FANS: { id: Ventilador; nombre: string }[] = [
  { id: 'low', nombre: 'Baja' },
  { id: 'medium', nombre: 'Media' },
  { id: 'high', nombre: 'Alta' },
  { id: 'auto', nombre: 'Automatica' },
]

function cargar(): EstadoAire {
  if (typeof window === 'undefined') return INICIAL
  try {
    const raw = window.localStorage.getItem(CLAVE)
    if (!raw) return INICIAL
    const parsed = JSON.parse(raw) as Partial<EstadoAire>
    const objetivo = Number(parsed.objetivo)
    return {
      ...INICIAL,
      ...parsed,
      objetivo: Number.isFinite(objetivo) ? Math.min(MAX, Math.max(MIN, objetivo)) : INICIAL.objetivo,
    }
  } catch {
    return INICIAL
  }
}

function diaDeHoy() {
  return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][new Date().getDay()]
}

export function AirePage({ data }: { data: AVCData }) {
  const [estado, setEstado] = useState<EstadoAire>(INICIAL)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    setEstado(cargar())
    setListo(true)
  }, [])

  useEffect(() => {
    if (!listo) return
    window.localStorage.setItem(CLAVE, JSON.stringify(estado))
  }, [estado, listo])

  const puntos = useMemo(() => {
    const serie = data.historico?.[diaDeHoy()]?.temperatura ?? []
    return serie
      .map((valor, hora) => ({ hora, valor: Number(valor) }))
      .filter((punto) => Number.isFinite(punto.valor))
  }, [data.historico])

  const hayTemp = data.config.sensorTemperatura
  const actual = hayTemp ? data.temperatura : null
  const consejo = consejoDe(actual, data.humedad, data.config.sensorHumedad, estado.objetivo)
  const fan = FANS.find((item) => item.id === estado.ventilador)?.nombre ?? 'Media'

  function poner(partial: Partial<EstadoAire>) {
    setEstado((prev) => ({ ...prev, ...partial }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Snowflake className="w-6 h-6 text-sky-400" />
            AIRE ACONDICIONADO
          </h2>
          <p className="text-sm text-muted-foreground">SALA / UNIDAD 01 · MIDEA</p>
        </div>
        <p className="text-sm text-muted-foreground text-right">
          Control local
          <span className="block text-emerald-400">{data.wifi.conectado ? 'WiFi conectado' : 'Sin enlace WiFi'}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Historial de temperatura</p>
              <p className="text-xs text-muted-foreground">Ultimas 24 h</p>
            </div>
            <Curva puntos={puntos} objetivo={estado.objetivo} />
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>Temp. actual ({actual === null ? '--' : `${actual} °C`})</span>
              <span>SP ({estado.objetivo} °C)</span>
            </div>
            <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2">
              <p className="text-xs font-medium text-sky-300">Consejo</p>
              <p className="text-sm text-foreground">{consejo}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-xs font-medium text-muted-foreground">TEMPERATURA OBJETIVO</p>
            <div className="relative mx-auto w-56 h-48">
              <svg viewBox="0 0 250 210" className="w-full h-full">
                <path d="M45 175 A90 90 0 1 1 205 175" fill="none" stroke="currentColor" className="text-border" strokeWidth="12" strokeLinecap="round" />
                <path
                  d="M45 175 A90 90 0 1 1 205 175"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${((estado.objetivo - MIN) / (MAX - MIN)) * 280} 360`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pb-6">
                <p className="text-5xl font-bold text-foreground">
                  {estado.objetivo}
                  <span className="text-xl font-medium text-muted-foreground"> °C</span>
                </p>
              </div>
              <div className="absolute left-0 top-16 flex flex-col gap-2">
                <button type="button" onClick={() => poner({ objetivo: Math.min(MAX, estado.objetivo + 1) })} className="h-10 w-10 rounded-md bg-secondary text-lg text-foreground">+</button>
                <button type="button" onClick={() => poner({ objetivo: Math.max(MIN, estado.objetivo - 1) })} className="h-10 w-10 rounded-md bg-secondary text-lg text-foreground">−</button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Usa + / − para ajustar. Rango Midea {MIN}–{MAX} °C.</p>
            <p className="text-sm text-muted-foreground">
              Temperatura actual del sensor:{' '}
              <span className="font-medium text-foreground">{actual === null ? '-- °C' : `${actual} °C`}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Modo</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => poner({ encendido: !estado.encendido })}
                className={cn('min-h-16 rounded-md border text-xs font-medium', estado.encendido ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-border text-muted-foreground')}
              >
                <span className="block text-lg">⏻</span>
                {estado.encendido ? 'Encendido' : 'Apagado'}
              </button>
              {MODOS.map((modo) => (
                <button
                  key={modo.id}
                  type="button"
                  disabled={!estado.encendido}
                  onClick={() => poner({ modo: modo.id })}
                  className={cn(
                    'min-h-16 rounded-md border text-xs font-medium disabled:opacity-40',
                    estado.modo === modo.id && estado.encendido ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-border text-muted-foreground',
                  )}
                >
                  <span className="block text-lg">{modo.icono}</span>
                  {modo.nombre}
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-foreground">Velocidad del ventilador</p>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground">{fan}</span>
              <div className="flex gap-1">
                {FANS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!estado.encendido}
                    aria-label={item.nombre}
                    onClick={() => poner({ ventilador: item.id })}
                    className={cn('h-3 w-5 rounded-sm disabled:opacity-40', estado.ventilador === item.id ? 'bg-sky-400' : 'bg-border')}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Toggle nombre="Swing" icono="↕" activo={estado.swing} onClick={() => poner({ swing: !estado.swing })} />
              <Toggle nombre="Temporizador" icono="◷" activo={estado.temporizador} onClick={() => poner({ temporizador: !estado.temporizador })} />
              <Toggle nombre="Sleep" icono="☾" activo={estado.sleep} onClick={() => poner({ sleep: !estado.sleep })} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex flex-wrap items-center gap-4">
        <p className="text-sm font-medium text-emerald-300">
          {data.diag.fallas > 0 ? `${data.diag.fallas} falla(s) en el equipo` : 'Sistema en orden'}
        </p>
        <p className="text-xs text-muted-foreground">
          Receptor IR
          <span className="block text-sm text-foreground">Orden guardada en la pagina</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Control nativo
          <span className="block text-sm text-foreground">Coolix · Midea</span>
        </p>
        <p className="text-sm text-foreground ml-auto">Midea</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Midea es la marca de partida. El perfil Coolix no cubre todos los modelos de esa marca. La pagina guarda la orden; el LED infrarrojo la transmite cuando la ESP32 tenga este protocolo.
      </p>
    </div>
  )
}

function consejoDe(temp: number | null, humedad: number, hayHumedad: boolean, objetivo: number) {
  if (temp === null) return 'Sin lectura de temperatura del sensor. El objetivo se guarda igual.'
  if (hayHumedad && humedad >= 70) return 'Humedad alta. Deshumidificar baja la humedad sin enfriar de mas.'
  if (temp > objetivo + 1) return 'La sala esta por encima del objetivo. Frio la acerca.'
  if (temp < objetivo - 1) return 'La sala esta por debajo del objetivo.'
  return 'La temperatura esta cerca del objetivo.'
}

function Curva({ puntos, objetivo }: { puntos: { hora: number; valor: number }[]; objetivo: number }) {
  if (puntos.length < 2) {
    return (
      <div className="h-36 rounded-md border border-border flex items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Sin muestras de hoy. No se dibuja una curva.</p>
      </div>
    )
  }
  const min = Math.min(16, ...puntos.map((punto) => punto.valor), objetivo)
  const max = Math.max(30, ...puntos.map((punto) => punto.valor), objetivo)
  const span = max - min || 1
  const x = (hora: number) => 18 + (hora / 23) * 224
  const y = (valor: number) => 110 - ((valor - min) / span) * 100
  const d = puntos.map((punto, index) => `${index === 0 ? 'M' : 'L'}${x(punto.hora).toFixed(1)} ${y(punto.valor).toFixed(1)}`).join(' ')
  const sp = y(objetivo)
  return (
    <svg viewBox="0 0 250 125" className="h-36 w-full rounded-md border border-border">
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      <path d={`M18 ${sp} H242`} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 4" />
    </svg>
  )
}

function Toggle({ nombre, icono, activo, onClick }: { nombre: string; icono: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('min-h-14 rounded-md border text-xs font-medium', activo ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-border text-muted-foreground')}
    >
      <span className="block text-lg">{icono}</span>
      {nombre}
    </button>
  )
}
