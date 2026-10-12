'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  Droplets,
  Thermometer,
  User,
  Wifi,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadServicio, saveServicio } from '@/lib/page-servicio'
import type { AVCData, FaultRecord } from '@/hooks/use-avc-data'

type Pane = 'medicion' | 'automatizacion' | 'conectividad' | 'sistema'

const NAMES = ['Temperatura', 'Humedad', 'Potencia', 'WiFi', 'Presencia', 'Nube', 'Cerebro']
const HINTS = [
  'Revisa el sensor DHT y el limite maximo.',
  'Revisa el sensor DHT y el humidificador.',
  'Revisa la carga conectada y el sensor de potencia.',
  'Revisa el router y la senal en el equipo.',
  'Revisa el radar (cerebro GPIO 13) y su cableado.',
  'Revisa internet y la conexion a Firebase.',
  'Revisa TX, RX y GND entre la pantalla y el cerebro.',
]
const GO = ['Medicion', 'Medicion', 'Medicion', 'Conectividad', 'Automatizacion', 'Conectividad', 'Sistema']
const PANES: Pane[] = ['medicion', 'medicion', 'medicion', 'conectividad', 'automatizacion', 'conectividad', 'sistema']
const ICONS = [Thermometer, Droplets, Zap, Wifi, User, Cloud, Cpu]

function clock(epoch: number) {
  if (epoch < 1700000000) return '--'
  return new Date(epoch * 1000).toLocaleString()
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`
}

function duration(start: number, end: number) {
  if (start < 1700000000) return '--'
  const until = end === 0 ? Math.floor(Date.now() / 1000) : end
  return formatSeconds(until - start)
}

function liveValue(data: AVCData, signal: number, fresh: boolean) {
  if (!fresh) return '--'
  if (signal === 0) return data.config.sensorTemperatura ? `${data.temperatura} °C` : 'Apagado'
  if (signal === 1) return data.config.sensorHumedad ? `${data.humedad} %` : 'Apagado'
  if (signal === 2) return data.config.sensorPotencia ? `${data.potencia} W` : 'Apagado'
  if (signal === 3) return data.wifi.conectado ? data.wifi.ssid || 'Enlace' : 'Sin enlace'
  if (signal === 4) return data.config.sensorMovimiento ? (data.movimiento ? 'Si' : 'No') : 'Apagado'
  if (signal === 5) return 'Publicando'
  return '--'
}

export function AlertasVistas({
  data,
  isDemo,
  lastHeartbeatAt,
  onBack,
  onGo,
}: {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
  onBack?: () => void
  onGo: (pane: Pane) => void
}) {
  const [tab, setTab] = useState<'res' | 'his'>('res')
  const [selected, setSelected] = useState<number | null>(null)
  const [histSel, setHistSel] = useState<number | null>(null)
  const [filter, setFilter] = useState<0 | 1 | 2>(0)
  const [tasked, setTasked] = useState<number[]>([])

  const fresh = !isDemo && lastHeartbeatAt !== null && Date.now() - lastHeartbeatAt <= 25000
  const records = data.diag.historial
  const journal = records.length > 0
  const open = records.filter((row) => row.end === 0)
  const done = records.filter((row) => row.end !== 0)
  const bad = new Set(open.map((row) => row.signal))
  const noReading = !journal && !fresh
  const failCount = journal ? open.length : fresh ? data.diag.fallas : 0

  const hero = noReading
    ? {
        tone: 'off' as const,
        title: 'Sin lectura reciente',
        text: 'No se puede confirmar el estado. Revisa que el HMI este encendido, el WiFi con enlace y Firebase en Leer+enviar.',
      }
    : failCount > 0
      ? {
          tone: 'bad' as const,
          title: `${failCount} ${failCount === 1 ? 'falla activa' : 'fallas activas'}`,
          text: journal
            ? `${7 - bad.size} de 7 senales funcionan con normalidad.`
            : 'El equipo reporta fallas abiertas. El detalle llega cuando el HMI publica el diario.',
        }
      : { tone: 'ok' as const, title: 'Todo en orden', text: 'Las 7 senales funcionan con normalidad.' }

  const shown = filter === 1 ? open : filter === 2 ? done : records
  const totalSec = records.reduce(
    (sum, row) => sum + Math.max(0, (row.end === 0 ? Math.floor(Date.now() / 1000) : row.end) - row.start),
    0,
  )
  const doneSec = done.reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0)

  function createTask(row: FaultRecord) {
    const store = loadServicio()
    saveServicio({
      ...store,
      tasks: [
        ...store.tasks,
        {
          id: `t_${row.id}`,
          name: `Falla ${NAMES[row.signal]}`.slice(0, 22),
          type: 'Correctivo',
          intervalDays: 7,
          reminderDays: 3,
          createdAt: new Date().toISOString(),
          lastDone: null,
        },
      ],
    })
    setTasked((current) => [...current, row.id])
  }

  const HeroIcon = hero.tone === 'ok' ? Check : AlertTriangle

  return (
    <div className="space-y-4">
      {onBack ? (
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Configuraciones
        </button>
      ) : (
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Alertas</h1>
      )}

      <div
        role="status"
        className={cn(
          'flex items-center gap-4 rounded-2xl border p-5',
          hero.tone === 'ok' && 'border-green-400/35 bg-gradient-to-br from-green-500/20 to-card',
          hero.tone === 'bad' && 'border-red-400/40 bg-gradient-to-br from-red-400/20 to-card',
          hero.tone === 'off' && 'border-border bg-card',
        )}
      >
        <span
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center shrink-0',
            hero.tone === 'ok' && 'bg-green-400/20 text-green-400',
            hero.tone === 'bad' && 'bg-red-400/20 text-red-400',
            hero.tone === 'off' && 'bg-secondary text-muted-foreground',
          )}
        >
          <HeroIcon className="w-7 h-7" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-foreground">{hero.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{hero.text}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border lg:hidden">
        {([['res', 'Resumen'], ['his', 'Historial']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'h-11 rounded-lg text-sm font-bold',
              tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">
        <div className={cn('space-y-4 min-w-0', tab !== 'res' && 'hidden lg:block')}>
          {open.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-foreground">Requieren atencion</h3>
                <span className="text-xs text-muted-foreground">Toca para ver que hacer</span>
              </div>
              {open.map((row) => {
                const Icon = ICONS[row.signal]
                const isOpen = selected === row.id
                const isTasked = tasked.includes(row.id) || (row.flags & 1) !== 0
                return (
                  <div key={row.id} className="rounded-2xl border border-red-400/40 bg-secondary/50 overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setSelected(isOpen ? null : row.id)}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      <span className="w-10 h-10 rounded-xl bg-red-400/15 text-red-400 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-foreground">{NAMES[row.signal]}</span>
                        <span className="block text-xs text-muted-foreground">
                          Desde {clock(row.start)} · {duration(row.start, 0)}
                        </span>
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {isOpen ? (
                      <div className="px-3 pb-3 space-y-2">
                        <p className="text-sm text-foreground">{HINTS[row.signal]}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isTasked}
                            onClick={() => createTask(row)}
                            className="flex-1 basis-36 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
                          >
                            {isTasked ? 'Tarea creada' : 'Crear tarea correctiva'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onGo(PANES[row.signal])}
                            className="flex-1 basis-36 h-11 rounded-xl border border-border bg-secondary text-sm font-bold text-foreground"
                          >
                            Ir a {GO[row.signal]}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Registrada en el historial #{row.id}</p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-foreground">Senales del equipo</h3>
              <span className="text-xs text-muted-foreground">{noReading ? 'Sin datos' : `${7 - bad.size} de 7 en orden`}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
              {NAMES.map((name, signal) => {
                const Icon = ICONS[signal]
                const isBad = bad.has(signal)
                const value = liveValue(data, signal, fresh)
                return (
                  <div
                    key={name}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-2xl border p-3.5',
                      isBad ? 'border-red-400/50 bg-red-400/10' : 'border-border bg-secondary/50',
                    )}
                  >
                    <div className={cn('flex items-center justify-between', isBad ? 'text-red-400' : 'text-muted-foreground')}>
                      <Icon className="w-5 h-5" />
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          isBad ? 'bg-red-400' : value === '--' ? 'bg-muted-foreground' : 'bg-green-400',
                        )}
                      />
                    </div>
                    <b className="text-xl font-semibold text-foreground">{value}</b>
                    <span className="text-xs text-muted-foreground">
                      {name}
                      {isBad ? ' · Falla' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className={cn('space-y-4 min-w-0', tab !== 'his' && 'hidden lg:block')}>
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Historial de fallas</h3>
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Fallas" value={String(records.length)} />
              <Kpi label="Tiempo fuera" value={journal ? formatSeconds(totalSec) : '--'} />
              <Kpi label="Recuperacion" value={done.length === 0 ? '--' : formatSeconds(Math.round(doneSec / done.length))} />
            </div>
            <div className="flex flex-wrap gap-2">
              {([['Todas', records.length], ['En curso', open.length], ['Resueltas', done.length]] as const).map(([label, count], index) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={filter === index}
                  onClick={() => setFilter(index as 0 | 1 | 2)}
                  className={cn(
                    'h-9 px-3.5 rounded-full border text-[13px] font-bold',
                    filter === index ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground',
                  )}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
            {!journal ? (
              <p className="text-sm text-muted-foreground">
                El diario de fallas todavia no llega en la lectura. No se muestran filas inventadas.
              </p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fallas en este filtro.</p>
            ) : (
              <ul className="ml-1 pl-4 border-l-2 border-border space-y-2.5">
                {shown.map((row) => {
                  const live = row.end === 0
                  const isOpen = histSel === row.id
                  return (
                    <li key={row.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[23px] top-4 w-3 h-3 rounded-full border-2 border-card',
                          live ? 'bg-red-400' : 'bg-green-400',
                        )}
                      />
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setHistSel(isOpen ? null : row.id)}
                        className="w-full text-left rounded-xl bg-secondary/50 p-3 flex flex-col gap-1"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <b className="text-foreground">{NAMES[row.signal]}</b>
                          <span
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap',
                              live ? 'bg-red-400/20 text-red-400' : 'bg-border text-foreground',
                            )}
                          >
                            {live ? `En curso · ${duration(row.start, 0)}` : duration(row.start, row.end)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">{clock(row.start)}</span>
                        {isOpen ? <span className="text-xs text-foreground mt-1">{HINTS[row.signal]}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <small className="block text-[11px] text-muted-foreground">{label}</small>
      <b className="text-lg font-semibold text-foreground">{value}</b>
    </div>
  )
}
