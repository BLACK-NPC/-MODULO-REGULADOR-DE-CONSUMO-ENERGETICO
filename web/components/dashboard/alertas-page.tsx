'use client'

import { useState } from 'react'
import { Thermometer, Droplets, Zap, Wifi, User, Database, Cpu } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
const GO = ['Ir a Medicion', 'Ir a Medicion', 'Ir a Medicion', 'Ir a Conectividad', 'Ir a Automatizacion', 'Ir a Conectividad', 'Ir a Sistema']
const PANES: Pane[] = ['medicion', 'medicion', 'medicion', 'conectividad', 'automatizacion', 'conectividad', 'sistema']
const ICONS = [Thermometer, Droplets, Zap, Wifi, User, Database, Cpu]

interface AlertasPageProps {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
  onGo?: (pane: Pane) => void
}

function clock(epoch: number) {
  if (epoch < 1700000000) {
    return '--'
  }
  return new Date(epoch * 1000).toLocaleString()
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function duration(start: number, end: number) {
  if (start < 1700000000) {
    return '--'
  }
  const until = end === 0 ? Math.floor(Date.now() / 1000) : end
  return formatSeconds(until - start)
}

function liveValue(data: AVCData, signal: number, fresh: boolean) {
  if (!fresh) {
    return '--'
  }
  if (signal === 0) return data.config.sensorTemperatura ? `${data.temperatura} C` : 'Apagado'
  if (signal === 1) return data.config.sensorHumedad ? `${data.humedad} %` : 'Apagado'
  if (signal === 2) return data.config.sensorPotencia ? `${data.potencia} W` : 'Apagado'
  if (signal === 3) return data.wifi.conectado ? (data.wifi.ssid || 'Enlace') : 'Sin enlace'
  if (signal === 4) return data.config.sensorMovimiento ? (data.movimiento ? 'Si' : 'No') : 'Apagado'
  if (signal === 5) return 'Publicando'
  return '--'
}

export function AlertasPage({ data, isDemo, lastHeartbeatAt, onGo }: AlertasPageProps) {
  const [history, setHistory] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [okOpen, setOkOpen] = useState(false)
  const [filter, setFilter] = useState<0 | 1 | 2>(0)
  const [tasked, setTasked] = useState<number[]>([])
  const fresh = !isDemo && lastHeartbeatAt !== null && Date.now() - lastHeartbeatAt <= 25000
  const records = data.diag.historial
  const journal = records.length > 0
  const open = records.filter((row) => row.end === 0)
  const openSignals = new Set(open.map((row) => row.signal))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {history ? (
          <button type="button" onClick={() => setHistory(false)} className="text-sm font-medium text-foreground">
            Atras
          </button>
        ) : (
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', open.length === 0 ? 'bg-card border border-border text-foreground' : 'bg-foreground text-background')}>
            {journal ? (open.length === 0 ? 'Sin fallas' : `${open.length} ${open.length === 1 ? 'falla' : 'fallas'}`) : fresh ? `${data.diag.fallas} ${data.diag.fallas === 1 ? 'falla' : 'fallas'}` : 'Sin lectura'}
          </span>
        )}
        <h2 className="text-lg font-bold text-foreground">{history ? 'Historial de fallas' : 'ALERTAS'}</h2>
        {history ? <span /> : (
          <button type="button" onClick={() => setHistory(true)} className="h-8 px-3 rounded-md border border-foreground text-sm font-medium text-foreground">
            Historial
          </button>
        )}
      </div>

      {history ? (
        <History records={records} journal={journal} filter={filter} onFilter={setFilter} selected={selected} onSelect={setSelected} />
      ) : journal && open.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Equipo en orden</p>
          {NAMES.map((name, signal) => (
            <OkRow key={name} signal={signal} value={liveValue(data, signal, fresh)} />
          ))}
        </div>
      ) : journal ? (
        <div className="space-y-2">
          {open.map((row) => (
            <OpenRow
              key={row.id}
              row={row}
              selected={selected === row.id}
              tasked={tasked.includes(row.id) || (row.flags & 1) !== 0}
              onSelect={() => setSelected(selected === row.id ? null : row.id)}
              onTask={() => {
                const store = loadServicio()
                saveServicio({
                  ...store,
                  tasks: [...store.tasks, {
                    id: `t_${row.id}`,
                    name: `Falla ${NAMES[row.signal]}`.slice(0, 22),
                    type: 'Correctivo',
                    intervalDays: 7,
                    reminderDays: 3,
                    createdAt: new Date().toISOString(),
                    lastDone: null,
                  }],
                })
                setTasked((current) => [...current, row.id])
              }}
              onGo={() => onGo?.(PANES[row.signal])}
            />
          ))}
          <button type="button" onClick={() => setOkOpen((value) => !value)} className="w-full rounded-md border border-border bg-card px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{okOpen ? '▲' : '▼'}</span>
            <span className="font-medium">EN ORDEN</span>
            <span className="ml-auto text-foreground">{7 - openSignals.size}</span>
          </button>
          {okOpen ? NAMES.map((name, signal) => openSignals.has(signal) ? null : <OkRow key={name} signal={signal} value={liveValue(data, signal, fresh)} />) : null}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm text-foreground">
              {fresh && data.diag.fallas === 0 ? 'Equipo en orden' : `El equipo reporta ${data.diag.fallas} falla(s) abierta(s).`}
            </p>
            <p className="text-xs text-muted-foreground">
              El historial con hora, duracion y senal llega cuando el HMI publica el diario. Esta lectura todavia no lo trae, asi que no se inventan filas.
            </p>
            {NAMES.map((name, signal) => (
              <OkRow key={name} signal={signal} value={liveValue(data, signal, fresh)} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function OkRow({ signal, value }: { signal: number; value: string }) {
  const Icon = ICONS[signal]
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 flex items-center gap-3">
      <Icon className="w-4 h-4 text-foreground" />
      <p className="text-sm text-foreground flex-1">{NAMES[signal]}</p>
      <p className="text-sm text-foreground">{value}</p>
      <span className={cn('w-2.5 h-2.5 rounded-full', value === '--' ? 'bg-muted-foreground' : 'bg-green-500')} />
    </div>
  )
}

function OpenRow({
  row,
  selected,
  tasked,
  onSelect,
  onTask,
  onGo,
}: {
  row: FaultRecord
  selected: boolean
  tasked: boolean
  onSelect: () => void
  onTask: () => void
  onGo: () => void
}) {
  const Icon = ICONS[row.signal]
  return (
    <div className={cn('rounded-md border bg-card px-3 py-2 space-y-2', selected ? 'border-foreground' : 'border-border')}>
      <button type="button" onClick={onSelect} className="w-full text-left flex items-center gap-3">
        <Icon className="w-4 h-4 text-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{NAMES[row.signal]}</p>
          <p className="text-xs text-muted-foreground">{clock(row.start)} · {duration(row.start, 0)}</p>
        </div>
      </button>
      {selected ? (
        <>
          <p className="text-sm text-foreground">{HINTS[row.signal]}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onTask} disabled={tasked} className="flex-1 h-8 rounded-md bg-foreground text-xs font-medium text-background disabled:opacity-60">
              {tasked ? 'Tarea creada' : 'Crear tarea correctiva'}
            </button>
            <button type="button" onClick={onGo} className="flex-1 h-8 rounded-md border border-foreground text-xs font-medium text-foreground">
              {GO[row.signal]}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Registrada en el historial #{row.id}</p>
        </>
      ) : null}
    </div>
  )
}

function History({
  records,
  journal,
  filter,
  onFilter,
  selected,
  onSelect,
}: {
  records: FaultRecord[]
  journal: boolean
  filter: 0 | 1 | 2
  onFilter: (value: 0 | 1 | 2) => void
  selected: number | null
  onSelect: (id: number) => void
}) {
  const openCount = records.filter((row) => row.end === 0).length
  const done = records.filter((row) => row.end !== 0)
  const shown = filter === 1 ? records.filter((row) => row.end === 0) : filter === 2 ? done : records
  const totalSec = records.reduce((sum, row) => sum + Math.max(0, (row.end === 0 ? Math.floor(Date.now() / 1000) : row.end) - row.start), 0)
  const doneSec = done.reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0)
  const filters = [
    ['Todas', records.length],
    ['En curso', openCount],
    ['Resueltas', done.length],
  ] as const

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="FALLAS" value={String(records.length)} />
        <Kpi label="TIEMPO FUERA" value={journal ? formatSeconds(totalSec) : '--'} />
        <Kpi label="RECUP. PROM." value={done.length === 0 ? '--' : formatSeconds(Math.round(doneSec / done.length))} />
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([label, count], index) => (
          <button
            key={label}
            type="button"
            onClick={() => onFilter(index as 0 | 1 | 2)}
            className={cn('h-8 px-3 rounded-md border text-xs font-medium', filter === index ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground')}
          >
            {label} ({count})
          </button>
        ))}
      </div>
      {!journal ? (
        <p className="text-sm text-muted-foreground">El diario de fallas todavia no llega en la lectura. No se muestran filas inventadas.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay fallas en este filtro.</p>
      ) : shown.map((row) => {
        const Icon = ICONS[row.signal]
        const live = row.end === 0
        return (
          <button key={row.id} type="button" onClick={() => onSelect(row.id)} className={cn('w-full rounded-md border bg-card px-3 py-2 text-left space-y-1', selected === row.id ? 'border-foreground' : 'border-border')}>
            <div className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-foreground" />
              <p className="text-sm font-medium text-foreground flex-1">{NAMES[row.signal]}</p>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', live ? 'bg-foreground text-background' : 'bg-secondary text-foreground')}>
                {live ? `En curso - ${duration(row.start, 0)}` : duration(row.start, row.end)}
              </span>
            </div>
            {selected === row.id ? <p className="text-xs text-muted-foreground">{clock(row.start)} · {HINTS[row.signal]}</p> : null}
          </button>
        )
      })}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
