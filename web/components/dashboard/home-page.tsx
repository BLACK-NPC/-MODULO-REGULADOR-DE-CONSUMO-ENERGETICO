'use client'

import { useEffect, useRef, useState } from 'react'
import { Thermometer, Droplets, Zap, Play, Square, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AVCData } from '@/hooks/use-avc-data'

const HEARTBEAT_MS = 25000
const RADIO_ANILLO = 94
const LARGO_ANILLO = 2 * Math.PI * RADIO_ANILLO

interface HomePageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
  isDemo?: boolean
  lastHeartbeatAt?: number | null
}

export function HomePage({
  data,
  onUpdate,
  isDemo = false,
  lastHeartbeatAt = null,
}: HomePageProps) {
  const envioObjetivo = useRef<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [objetivo, setObjetivo] = useState(data.setpoint)
  const lecturaViva = !isDemo && lastHeartbeatAt !== null && now - lastHeartbeatAt <= HEARTBEAT_MS

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    setObjetivo(data.setpoint)
  }, [data.setpoint])

  useEffect(() => {
    return () => {
      if (envioObjetivo.current !== null) window.clearTimeout(envioObjetivo.current)
    }
  }, [])
  const velocidadPorcentaje = Math.min(100, Math.max(0, data.velocidad))
  const anilloOffset = LARGO_ANILLO * (1 - velocidadPorcentaje / 100)
  const motorMarcha = lecturaViva && data.estado === 'running'
  const hayFalla = lecturaViva && data.diag.fallas > 0
  const estadoTexto = !lecturaViva ? 'Sin lectura' : data.diag.fallas > 0 ? `${data.diag.fallas} falla(s)` : 'Listo'
  const hayTemp = lecturaViva && data.config.sensorTemperatura
  const hayHum = lecturaViva && data.config.sensorHumedad
  const hayPot = lecturaViva && data.config.sensorPotencia
  const temperaturaTexto = hayTemp ? `${data.temperatura} °C` : '-- °C'
  const humedadTexto = hayHum ? `${data.humedad} %` : '-- %'
  const potenciaTexto = hayPot ? `${data.potencia} W` : '-- W'
  const manual = data.modo === 'MANUAL'

  const minObjetivo = Math.round(Math.min(data.config.spMin, data.config.spMax))
  const maxObjetivo = Math.round(Math.max(data.config.spMin, data.config.spMax))
  const diferencia = hayTemp ? Math.round((data.temperatura - objetivo) * 10) / 10 : null
  const notaTemperatura =
    diferencia === null
      ? 'Sin lectura'
      : diferencia === 0
        ? 'En el objetivo'
        : `${Math.abs(diferencia)} °C ${diferencia > 0 ? 'sobre' : 'bajo'} el objetivo`

  function cambiarObjetivo(valor: number) {
    setObjetivo(valor)
    if (envioObjetivo.current !== null) window.clearTimeout(envioObjetivo.current)
    envioObjetivo.current = window.setTimeout(() => {
      envioObjetivo.current = null
      if (valor !== data.setpoint) onUpdate('setpoint', valor)
    }, 450)
  }

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground">ECOPULSE</p>
          <h2 className="mt-0.5 text-2xl font-bold text-foreground sm:text-3xl">Control de ventilacion</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground">
          <span className={cn('h-2 w-2 rounded-full', lecturaViva ? 'bg-[#3ddc6a]' : 'bg-muted-foreground')} />
          {isDemo ? 'Demostracion' : lecturaViva ? 'En linea' : 'Sin lectura'}
        </span>
      </div>

      {!lecturaViva ? (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-1">
            <p className="text-sm font-medium text-foreground">No se puede verificar la operacion</p>
            <p className="text-xs text-muted-foreground">
              {isDemo
                ? 'La página está en datos de demostración, no en el equipo.'
                : 'No llega una lectura reciente. Los números pueden ser la última guarda o un valor vacío.'}
            </p>
            <p className="text-xs text-muted-foreground">Revisar: HMI encendido, WiFi con enlace y Firebase en Leer+enviar.</p>
            <p className="text-xs text-muted-foreground">Si falla: START, STOP y el modo se envían sin confirmar que el motor los ejecutó.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
        {/* Velocidad del motor */}
        <section className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-card px-4 py-6">
          <div className="relative aspect-square w-full max-w-[280px]">
            <svg
              viewBox="0 0 220 220"
              className="block h-full w-full"
              role="img"
              aria-label={`Velocidad del motor al ${velocidadPorcentaje} por ciento`}
            >
              <defs>
                <linearGradient id="vent-anillo" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#2EAF4A" />
                  <stop offset="1" stopColor="#7cf0a0" />
                </linearGradient>
              </defs>
              <g fill="#3ddc6a" opacity="0.1">
                <ellipse cx="110" cy="66" rx="18" ry="38" transform="rotate(20 110 110)" />
                <ellipse cx="110" cy="66" rx="18" ry="38" transform="rotate(110 110 110)" />
                <ellipse cx="110" cy="66" rx="18" ry="38" transform="rotate(200 110 110)" />
                <ellipse cx="110" cy="66" rx="18" ry="38" transform="rotate(290 110 110)" />
              </g>
              <circle cx="110" cy="110" r={RADIO_ANILLO} fill="none" stroke="currentColor" className="text-border" strokeWidth="12" />
              <circle
                cx="110"
                cy="110"
                r={RADIO_ANILLO}
                fill="none"
                stroke="url(#vent-anillo)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={LARGO_ANILLO}
                strokeDashoffset={anilloOffset}
                transform="rotate(-90 110 110)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-bold leading-none text-foreground sm:text-6xl">{velocidadPorcentaje}%</span>
              <span className="mt-1.5 text-xs text-muted-foreground">velocidad del motor</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold',
                motorMarcha ? 'bg-[#3ddc6a]/15 text-[#7cf0a0]' : 'bg-secondary text-muted-foreground',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', motorMarcha ? 'bg-[#3ddc6a]' : 'bg-muted-foreground')} />
              {lecturaViva ? (data.estado === 'running' ? 'En marcha' : 'Parado') : '--'}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full bg-secondary px-3.5 py-2 text-[13px] font-bold',
                hayFalla ? 'text-red-400' : 'text-muted-foreground',
              )}
            >
              Estado: {estadoTexto}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          {/* Modo y temperatura objetivo */}
          <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-3.5">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-background p-1">
              <button
                type="button"
                aria-pressed={!manual}
                onClick={() => onUpdate('modo', 'AUTOMATICO')}
                className={cn('h-11 rounded-xl text-sm font-bold', !manual ? 'bg-[#3ddc6a] text-[#06210f]' : 'bg-transparent text-muted-foreground')}
              >
                Automatico
              </button>
              <button
                type="button"
                aria-pressed={manual}
                onClick={() => onUpdate('modo', 'MANUAL')}
                className={cn('h-11 rounded-xl text-sm font-bold', manual ? 'bg-[#3ddc6a] text-[#06210f]' : 'bg-transparent text-muted-foreground')}
              >
                Manual
              </button>
            </div>
            <div className="flex flex-col gap-2 px-1">
              <p className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                <span>Temperatura objetivo:</span>
                <span className="inline-flex items-center rounded-full bg-[#3ddc6a] px-3 py-1 text-sm font-bold text-[#06210f]">
                  {objetivo} °C
                </span>
              </p>
              <Ruleta min={minObjetivo} max={maxObjetivo} valor={objetivo} onCambio={cambiarObjetivo} />
            </div>
            {manual ? (
              <div className="flex items-center gap-4 px-1">
                <span className="shrink-0 text-xs text-muted-foreground">Velocidad manual</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={data.velocidad}
                  onChange={(e) => onUpdate('velocidad', Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-secondary accent-[#3ddc6a]"
                />
                <span className="w-12 text-right font-medium text-foreground">{data.velocidad}%</span>
              </div>
            ) : null}
          </section>

          {/* Lecturas */}
          <div className="grid grid-cols-2 gap-2.5">
            <Lectura icono={<Thermometer className="h-[18px] w-[18px]" />} nombre="TEMPERATURA" valor={temperaturaTexto} nota={notaTemperatura} />
            <Lectura icono={<Droplets className="h-[18px] w-[18px]" />} nombre="HUMEDAD" valor={humedadTexto} nota="Relativa" />
            <Lectura icono={<Zap className="h-[18px] w-[18px]" />} nombre="POTENCIA" valor={potenciaTexto} nota="Consumo del motor" />
            <Lectura
              icono={<User className="h-[18px] w-[18px]" />}
              nombre="PRESENCIA"
              valor={lecturaViva ? (data.movimiento ? 'Si' : 'No') : '--'}
              nota={lecturaViva ? (data.movimiento ? 'Detectada' : 'Sin presencia') : 'Sin lectura'}
            />
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onUpdate('estado', 'running')}
              disabled={data.estado === 'running'}
              className="flex h-14 flex-1 basis-[90px] items-center justify-center gap-2 rounded-2xl bg-[#3ddc6a] text-[15px] font-bold text-[#06210f] disabled:opacity-50"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              START
            </button>
            <button
              type="button"
              onClick={() => onUpdate('estado', 'stopped')}
              disabled={data.estado === 'stopped'}
              className="flex h-14 flex-1 basis-[90px] items-center justify-center gap-2 rounded-2xl border border-border bg-secondary text-[15px] font-bold text-foreground disabled:opacity-50"
            >
              <Square className="h-4 w-4" fill="currentColor" />
              STOP
            </button>
            <div
              id="voice-mic-dock"
              className="h-14 w-14 flex-none overflow-hidden rounded-full outline outline-1 -outline-offset-1 outline-dashed outline-[#3ddc6a]/50 [overflow-anchor:none]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Ruleta({ min, max, valor, onCambio }: { min: number; max: number; valor: number; onCambio: (valor: number) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; scroll: number; movido: boolean } | null>(null)
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const limitado = Math.min(max, Math.max(min, valor))

  function ancho() {
    return (caja.current?.clientWidth ?? 0) / 3
  }

  function indiceActual() {
    const w = ancho()
    if (!w || !caja.current) return limitado - min
    return Math.min(valores.length - 1, Math.max(0, Math.round(caja.current.scrollLeft / w)))
  }

  useEffect(() => {
    const el = caja.current
    const w = ancho()
    if (!el || !w) return
    if (indiceActual() !== limitado - min) el.scrollTo({ left: (limitado - min) * w, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitado, min, max])

  function alDesplazar() {
    const nuevo = min + indiceActual()
    if (nuevo !== limitado) onCambio(nuevo)
  }

  function ir(nuevo: number) {
    const el = caja.current
    const w = ancho()
    const siguiente = Math.min(max, Math.max(min, nuevo))
    if (el && w) el.scrollTo({ left: (siguiente - min) * w, behavior: 'smooth' })
    onCambio(siguiente)
  }

  function alPresionar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !caja.current) return
    arrastre.current = { x: e.clientX, scroll: caja.current.scrollLeft, movido: false }
    caja.current.setPointerCapture(e.pointerId)
    caja.current.style.scrollSnapType = 'none'
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current
    if (!a || !caja.current) return
    const dx = e.clientX - a.x
    if (Math.abs(dx) > 4) a.movido = true
    caja.current.scrollLeft = a.scroll - dx
  }

  function alSoltar(e: React.PointerEvent<HTMLDivElement>) {
    const el = caja.current
    if (!arrastre.current || !el) return
    const w = ancho()
    const idx = indiceActual()
    el.style.scrollSnapType = ''
    if (!arrastre.current.movido && e.type === 'pointerup' && w) {
      const casilla = Math.floor((e.clientX - el.getBoundingClientRect().left) / w)
      ir(min + idx + casilla - 1)
    } else if (w) {
      el.scrollTo({ left: idx * w, behavior: 'smooth' })
    }
    window.setTimeout(() => {
      arrastre.current = null
    }, 0)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Temperatura objetivo"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={limitado}
      aria-valuetext={`${limitado} grados`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          ir(limitado - 1)
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          ir(limitado + 1)
        }
      }}
      className="relative h-16 w-full overflow-hidden rounded-full border border-border bg-secondary outline-none focus-visible:border-[#3ddc6a] focus-visible:ring-2 focus-visible:ring-[#3ddc6a]/40"
    >
      <div className="pointer-events-none absolute inset-y-2 left-1/3 w-1/3 rounded-full border border-[#3ddc6a]/60 bg-[#3ddc6a]/10" />
      <div
        ref={caja}
        onScroll={alDesplazar}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        className="flex h-full cursor-grab touch-pan-x snap-x snap-mandatory overflow-x-auto overscroll-x-contain select-none [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-1/3 flex-none" aria-hidden="true" />
        {valores.map((n) => {
          const distancia = Math.abs(n - limitado)
          return (
            <button
              key={n}
              type="button"
              tabIndex={-1}
              onClick={() => {
                if (!arrastre.current?.movido) ir(n)
              }}
              className={cn(
                'flex w-1/3 flex-none snap-center items-center justify-center font-bold transition-all',
                distancia === 0 ? 'text-3xl text-[#7cf0a0]' : distancia === 1 ? 'text-xl text-muted-foreground' : 'text-base text-muted-foreground/30',
              )}
            >
              {n}
            </button>
          )
        })}
        <div className="w-1/3 flex-none" aria-hidden="true" />
      </div>
    </div>
  )
}

function Lectura({ icono, nombre, valor, nota }: { icono: React.ReactNode; nombre: string; valor: string; nota: string }) {
  return (
    <article className="rounded-[18px] border border-border bg-card p-3.5">
      <div className="flex items-center gap-2 text-[11px] tracking-wider text-muted-foreground">
        <span className="text-[#3ddc6a]">{icono}</span>
        {nombre}
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-tight text-foreground">{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>
    </article>
  )
}
