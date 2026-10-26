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
const ICONO = ['#ff8a4c', '#4cc9f0', '#ffd23f', '#2ee6a6', '#f472b6', '#a78bfa', '#7ddc1f']

type Nivel = 'ok' | 'aviso' | 'peligro' | 'sin_dato'

const LUZ: Record<Nivel, { linea: string; texto: string }> = {
  ok: { linea: 'rgba(125,220,31,.9)', texto: '#7ddc1f' },
  aviso: { linea: 'rgba(240,180,41,.9)', texto: '#f0b429' },
  peligro: { linea: 'rgba(255,90,79,.9)', texto: '#ff5a4f' },
  sin_dato: { linea: 'rgba(125,220,31,.35)', texto: '#9aa39d' },
}

function nivelConteo(cantidad: number): Nivel {
  if (cantidad <= 0) return 'ok'
  if (cantidad <= 2) return 'aviso'
  return 'peligro'
}

function nivelTiempo(segundos: number | null): Nivel {
  if (segundos === null) return 'sin_dato'
  if (segundos < 15 * 60) return 'ok'
  if (segundos < 2 * 3600) return 'aviso'
  return 'peligro'
}

function tinta(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function Franja({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-4 right-4 top-0 h-[2px] rounded-full"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
    />
  )
}

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

function comportamiento(data: AVCData, signal: number, fresh: boolean, bad: Set<number>) {
  if (bad.has(signal)) {
    return { nivel: 'peligro' as const, titulo: 'Falla', detalle: HINTS[signal] }
  }
  if (!fresh) {
    return { nivel: 'sin_dato' as const, titulo: 'Sin lectura', detalle: 'No se puede confirmar' }
  }
  if (signal === 0) {
    if (!data.config.sensorTemperatura) return { nivel: 'aviso' as const, titulo: 'Apagado', detalle: 'Sensor desactivado' }
    if (data.temperatura < 0 || data.temperatura > 55) return { nivel: 'aviso' as const, titulo: 'Dato raro', detalle: `${data.temperatura} °C` }
    return { nivel: 'ok' as const, titulo: 'Funcionando', detalle: `${data.temperatura} °C` }
  }
  if (signal === 1) {
    if (!data.config.sensorHumedad) return { nivel: 'aviso' as const, titulo: 'Apagado', detalle: 'Sensor desactivado' }
    if (data.humedad < 0 || data.humedad > 100) return { nivel: 'peligro' as const, titulo: 'Dato imposible', detalle: `${Math.round(data.humedad)} %` }
    return { nivel: 'ok' as const, titulo: 'Funcionando', detalle: `${Math.round(data.humedad)} %` }
  }
  if (signal === 2) {
    if (!data.config.sensorPotencia) return { nivel: 'aviso' as const, titulo: 'Apagado', detalle: 'Sensor desactivado' }
    if (data.potencia < 0) return { nivel: 'aviso' as const, titulo: 'Dato raro', detalle: `${data.potencia} W` }
    return { nivel: 'ok' as const, titulo: 'Funcionando', detalle: `${data.potencia} W` }
  }
  if (signal === 3) {
    if (!data.conectividad.wifiRadio) return { nivel: 'aviso' as const, titulo: 'Radio apagada', detalle: 'El WiFi del equipo esta apagado' }
    if (!data.wifi.conectado) return { nivel: 'peligro' as const, titulo: 'Sin enlace', detalle: 'No hay red' }
    return { nivel: 'ok' as const, titulo: 'Enlazado', detalle: data.wifi.ssid || 'Con red' }
  }
  if (signal === 4) {
    if (!data.config.sensorMovimiento) return { nivel: 'aviso' as const, titulo: 'Apagado', detalle: 'Sensor desactivado' }
    return { nivel: 'ok' as const, titulo: 'Funcionando', detalle: data.movimiento ? 'Hay presencia' : 'Sin presencia ahora' }
  }
  if (signal === 5) {
    const modo = data.conectividad.firebaseModo
    if (modo === 0) return { nivel: 'aviso' as const, titulo: 'Apagado', detalle: 'Firebase no esta activo' }
    if (modo === 1) return { nivel: 'aviso' as const, titulo: 'Solo lee', detalle: 'No esta enviando el estado' }
    if (modo === 2) return { nivel: 'ok' as const, titulo: 'Enviando', detalle: 'Publica, no recibe ordenes' }
    return { nivel: 'ok' as const, titulo: 'Publicando', detalle: 'Lectura y envio activos' }
  }
  if (data.diag.cerebroOnline) {
    return {
      nivel: 'ok' as const,
      titulo: 'En linea',
      detalle: data.diag.cerebroMotion ? 'Radar: presencia' : 'Enlace OK, sin presencia',
    }
  }
  return {
    nivel: 'peligro' as const,
    titulo: 'Sin enlace',
    detalle: 'Revisa TX/RX/GND (HMI 11/12 ↔ cerebro 16/17). No uses pines del tactil 8/4/3/38.',
  }
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
  const piezas = NAMES.map((_, signal) => comportamiento(data, signal, fresh, bad))
  const peligros = piezas.filter((pieza) => pieza.nivel === 'peligro').length
  const avisos = piezas.filter((pieza) => pieza.nivel === 'aviso').length
  const sanos = piezas.filter((pieza) => pieza.nivel === 'ok').length

  const hero = !fresh && peligros === 0
    ? {
        tone: 'off' as const,
        title: 'Sin lectura reciente',
        text: 'No se puede confirmar el comportamiento. Revisa que el HMI este encendido, el WiFi con enlace y Firebase en Leer+enviar.',
      }
    : peligros > 0
      ? {
          tone: 'bad' as const,
          title: `${peligros} ${peligros === 1 ? 'componente en peligro' : 'componentes en peligro'}`,
          text: `${sanos} funcionan bien${avisos ? ` y ${avisos} no estan al 100%` : ''}.`,
        }
      : fresh && data.diag.fallas > 0
        ? {
            tone: 'bad' as const,
            title: `${data.diag.fallas} ${data.diag.fallas === 1 ? 'falla sin detalle' : 'fallas sin detalle'}`,
            text: 'El equipo las reporta, pero todavia no dice que componente es.',
          }
        : avisos > 0
        ? {
            tone: 'warn' as const,
            title: `${avisos} ${avisos === 1 ? 'componente no esta al 100%' : 'componentes no estan al 100%'}`,
            text: 'Siguen presentes, pero hay uno apagado o con una lectura rara.',
          }
        : { tone: 'ok' as const, title: 'Todo en orden', text: 'Los 7 componentes funcionan con normalidad.' }

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

  const heroLuz = hero.tone === 'ok' ? '#7ddc1f' : hero.tone === 'bad' ? '#ff5a4f' : '#f0b429'
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
        className="relative flex items-center gap-4 overflow-hidden rounded-2xl border p-5"
        style={{
          borderColor: tinta(heroLuz, 0.28),
          background: `radial-gradient(520px 220px at 0% 0%, ${tinta(heroLuz, 0.13)}, transparent 70%), #0d100e`,
        }}
      >
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{
            color: heroLuz,
            background: tinta(heroLuz, 0.1),
            boxShadow: `0 0 0 10px ${tinta(heroLuz, 0.06)}, 0 0 0 22px ${tinta(heroLuz, 0.03)}`,
          }}
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
              <span className="text-xs text-muted-foreground">
                {!fresh && peligros === 0 ? 'Sin lectura' : `${sanos} bien · ${avisos} aviso · ${peligros} peligro`}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
              {NAMES.map((name, signal) => {
                const Icon = ICONS[signal]
                const pieza = piezas[signal]
                const luz = LUZ[pieza.nivel]
                const icono = ICONO[signal]
                return (
                  <div key={name} className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-card p-3.5">
                    <Franja color={luz.linea} />
                    <div className="flex items-center justify-between">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-[14px] border"
                        style={{ color: icono, background: tinta(icono, 0.1), borderColor: tinta(icono, 0.28) }}
                      >
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="w-2 h-2 rounded-full" style={{ background: luz.texto }} />
                    </div>
                    <b className="text-xl font-semibold" style={{ color: luz.texto }}>{pieza.titulo}</b>
                    <span className="text-xs text-muted-foreground">{name}</span>
                    <span className="text-xs text-muted-foreground">{pieza.detalle}</span>
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
              <Kpi label="Fallas" value={String(records.length)} nivel={nivelConteo(records.length)} />
              <Kpi label="Tiempo fuera" value={journal ? formatSeconds(totalSec) : '--'} nivel={journal ? nivelTiempo(totalSec) : 'sin_dato'} />
              <Kpi
                label="Recuperacion"
                value={done.length === 0 ? '--' : formatSeconds(Math.round(doneSec / done.length))}
                nivel={done.length === 0 ? (open.length > 0 ? 'peligro' : 'sin_dato') : nivelTiempo(Math.round(doneSec / done.length))}
              />
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

function Kpi({ label, value, nivel }: { label: string; value: string; nivel: Nivel }) {
  const luz = LUZ[nivel]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card p-3">
      <Franja color={luz.linea} />
      <small className="block text-[11px] text-muted-foreground">{label}</small>
      <b className="text-lg font-semibold" style={{ color: luz.texto }}>{value}</b>
    </div>
  )
}
