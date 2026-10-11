'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, Clock, Droplets, Fan, Moon, Power, Snowflake, Sun } from 'lucide-react'
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

const MODOS: { id: Modo; nombre: string; corto: string }[] = [
  { id: 'cool', nombre: 'Frio', corto: 'Frio' },
  { id: 'heat', nombre: 'Calor', corto: 'Calor' },
  { id: 'fan', nombre: 'Ventilador', corto: 'Ventilador' },
  { id: 'dry', nombre: 'Deshumidificar', corto: 'Deshumidif.' },
  { id: 'auto', nombre: 'Automatico', corto: 'Automatico' },
]

const FANS: { id: Ventilador; nombre: string; corto: string }[] = [
  { id: 'low', nombre: 'Baja', corto: 'Baja' },
  { id: 'medium', nombre: 'Media', corto: 'Media' },
  { id: 'high', nombre: 'Alta', corto: 'Alta' },
  { id: 'auto', nombre: 'Automatica', corto: 'Auto' },
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

function horaLocal() {
  const ahora = new Date()
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
}

export function AirePage({ data }: { data: AVCData }) {
  const [estado, setEstado] = useState<EstadoAire>(INICIAL)
  const [listo, setListo] = useState(false)
  const [hora, setHora] = useState('')

  useEffect(() => {
    setEstado(cargar())
    setListo(true)
  }, [])

  useEffect(() => {
    if (!listo) return
    window.localStorage.setItem(CLAVE, JSON.stringify(estado))
  }, [estado, listo])

  useEffect(() => {
    setHora(horaLocal())
    const id = window.setInterval(() => setHora(horaLocal()), 20000)
    return () => window.clearInterval(id)
  }, [])

  const puntos = useMemo(() => {
    const serie = data.historico?.[diaDeHoy()]?.temperatura ?? []
    return serie
      .map((valor, hora) => ({ hora, valor: Number(valor) }))
      .filter((punto) => Number.isFinite(punto.valor))
  }, [data.historico])

  const hayTemp = data.config.sensorTemperatura
  const actual = hayTemp ? data.temperatura : null
  const consejo = consejoDe(actual, data.humedad, data.config.sensorHumedad, estado.objetivo)
  const modoNombre = MODOS.find((item) => item.id === estado.modo)?.nombre ?? 'Frio'
  const fanNombre = FANS.find((item) => item.id === estado.ventilador)?.nombre ?? 'Media'
  const fallas = data.diag.fallas
  const conectado = data.wifi.conectado
  const fraccion = ((estado.objetivo - MIN) / (MAX - MIN)) * 100

  function poner(partial: Partial<EstadoAire>) {
    setEstado((prev) => ({ ...prev, ...partial }))
  }

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground">ECOPULSE · SALA · UNIDAD 01</p>
          <h2 className="mt-0.5 flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
            <Snowflake className="h-6 w-6 text-sky-400" />
            Aire acondicionado · Midea
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground">
            <span className={cn('h-2 w-2 rounded-full', conectado ? 'bg-sky-400' : 'bg-muted-foreground')} />
            {conectado ? 'WiFi conectado' : 'Sin enlace WiFi'}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
            {hora ? `${hora} · ` : ''}Control local
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
        <section className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-card px-4 py-5">
          <div className="flex flex-wrap justify-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold',
                estado.encendido ? 'bg-sky-500/15 text-sky-300' : 'bg-secondary text-muted-foreground',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', estado.encendido ? 'bg-sky-400' : 'bg-muted-foreground')} />
              {estado.encendido ? 'Encendido' : 'Apagado'}
            </span>
            <span className="inline-flex items-center rounded-full bg-secondary px-3.5 py-2 text-[13px] font-bold text-muted-foreground">
              Modo {modoNombre} · Ventilador {fanNombre}
            </span>
          </div>

          <div className={cn('relative aspect-square w-full max-w-[300px]', !estado.encendido && 'opacity-50')}>
            <svg
              viewBox="0 0 240 240"
              className="block h-full w-full"
              role="img"
              aria-label={`Temperatura objetivo ${estado.objetivo} grados, rango de ${MIN} a ${MAX}`}
            >
              <defs>
                <linearGradient id="aire-arco" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#0ea5e9" />
                  <stop offset="1" stopColor="#7dd3fc" />
                </linearGradient>
              </defs>
              <path d="M49.3 190.7 A100 100 0 1 1 190.7 190.7" fill="none" stroke="currentColor" className="text-border" strokeWidth="14" strokeLinecap="round" />
              <path
                d="M49.3 190.7 A100 100 0 1 1 190.7 190.7"
                pathLength={100}
                fill="none"
                stroke="url(#aire-arco)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${fraccion} 100`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pb-[6%]">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground">OBJETIVO</span>
              <span className="text-6xl font-bold leading-none text-foreground sm:text-7xl">{estado.objetivo}°</span>
              <span className="mt-1 text-[13px] text-muted-foreground">
                Sensor actual <b className="text-foreground">{actual === null ? '-- °C' : `${actual} °C`}</b>
              </span>
            </div>
          </div>

          <div className="-mt-3 flex w-full flex-wrap items-center justify-center gap-3.5">
            <Ruleta valor={estado.objetivo} onCambio={(objetivo) => poner({ objetivo })} />
            <button
              type="button"
              onClick={() => poner({ encendido: !estado.encendido })}
              className="flex h-16 max-w-52 flex-1 basis-[150px] items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-sky-500 to-sky-300 text-[15px] font-bold text-slate-950 shadow-lg shadow-sky-500/30"
            >
              <Power className="h-5 w-5" strokeWidth={2.6} />
              {estado.encendido ? 'Apagar' : 'Encender'}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-3xl border border-border bg-card p-4">
          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wider text-muted-foreground">MODO</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2">
              {MODOS.map((modo) => {
                const activo = estado.modo === modo.id && estado.encendido
                return (
                  <button
                    key={modo.id}
                    type="button"
                    aria-pressed={activo}
                    disabled={!estado.encendido}
                    onClick={() => poner({ modo: modo.id })}
                    className={cn(
                      'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-bold disabled:opacity-40',
                      activo ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-border bg-secondary text-muted-foreground',
                    )}
                  >
                    <IconoModo id={modo.id} />
                    {modo.corto}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wider text-muted-foreground">VELOCIDAD DEL VENTILADOR</p>
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-background p-1">
              {FANS.map((item) => {
                const activo = estado.ventilador === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={activo}
                    disabled={!estado.encendido}
                    onClick={() => poner({ ventilador: item.id })}
                    className={cn(
                      'h-11 rounded-xl text-[13px] font-bold disabled:opacity-40',
                      activo ? 'bg-sky-400 text-slate-950' : 'bg-transparent text-muted-foreground',
                    )}
                  >
                    {item.corto}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wider text-muted-foreground">FUNCIONES</p>
            <div className="flex flex-wrap gap-2">
              <Funcion nombre="Swing" activo={estado.swing} onClick={() => poner({ swing: !estado.swing })}>
                <ArrowUpDown className="h-4 w-4" />
              </Funcion>
              <Funcion nombre="Temporizador" activo={estado.temporizador} onClick={() => poner({ temporizador: !estado.temporizador })}>
                <Clock className="h-4 w-4" />
              </Funcion>
              <Funcion nombre="Sleep" activo={estado.sleep} onClick={() => poner({ sleep: !estado.sleep })}>
                <Moon className="h-4 w-4" />
              </Funcion>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
        <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-semibold text-foreground">Historial de temperatura</p>
            <span className="text-xs text-muted-foreground">Hoy</span>
          </div>
          <Curva puntos={puntos} objetivo={estado.objetivo} />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>00:00</span>
            <span>23:00</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-[3px] w-4 rounded-sm bg-sky-400" />
              Actual {actual === null ? '--' : `${actual} °C`}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
              Objetivo {estado.objetivo} °C
            </span>
          </div>
          <div className="rounded-2xl bg-sky-500/10 p-3 text-[13px] leading-snug text-foreground">
            <b className="text-sky-300">Consejo.</b> {consejo}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4">
          <p className="text-lg font-semibold text-foreground">Equipo y conexion</p>
          <div>
            <label htmlFor="aire-perfil" className="mb-2 block text-[11px] font-bold tracking-wider text-muted-foreground">
              PERFIL DEL EQUIPO
            </label>
            <div className="relative">
              <select
                id="aire-perfil"
                defaultValue="midea"
                className="h-12 w-full appearance-none rounded-xl border border-border bg-secondary pl-3 pr-12 text-sm font-bold text-foreground outline-none focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400/40"
              >
                <option value="midea">Midea · Coolix</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" strokeWidth={2.4} />
            </div>
          </div>
          <Fila etiqueta="Sistema" valor={fallas > 0 ? `${fallas} falla(s)` : 'En orden'} tono={fallas > 0 ? 'aviso' : 'azul'} />
          <Fila etiqueta="Receptor IR" valor="Orden guardada en la pagina" tono="normal" />
          <Fila etiqueta="Control nativo" valor="Coolix · Midea" tono="azul" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            El perfil Coolix no cubre todos los modelos de Midea. La pagina guarda la orden; el LED infrarrojo la transmite cuando la ESP32 tenga este protocolo.
          </p>
        </section>
      </div>
    </div>
  )
}

const VALORES = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i)

function Ruleta({ valor, onCambio }: { valor: number; onCambio: (valor: number) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; scroll: number; movido: boolean } | null>(null)

  function ancho() {
    return (caja.current?.clientWidth ?? 0) / 3
  }

  function indiceActual() {
    const w = ancho()
    if (!w || !caja.current) return valor - MIN
    return Math.min(VALORES.length - 1, Math.max(0, Math.round(caja.current.scrollLeft / w)))
  }

  useEffect(() => {
    const el = caja.current
    const w = ancho()
    if (!el || !w) return
    if (indiceActual() !== valor - MIN) el.scrollTo({ left: (valor - MIN) * w, behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  function alDesplazar() {
    const nuevo = MIN + indiceActual()
    if (nuevo !== valor) onCambio(nuevo)
  }

  function ir(nuevo: number) {
    const el = caja.current
    const w = ancho()
    const limitado = Math.min(MAX, Math.max(MIN, nuevo))
    if (el && w) el.scrollTo({ left: (limitado - MIN) * w, behavior: 'smooth' })
    onCambio(limitado)
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
      ir(MIN + idx + casilla - 1)
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
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={valor}
      aria-valuetext={`${valor} grados`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          ir(valor - 1)
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          ir(valor + 1)
        }
      }}
      className="relative h-16 max-w-72 flex-1 basis-[220px] overflow-hidden rounded-full border border-border bg-secondary outline-none focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400/40"
    >
      <div className="pointer-events-none absolute inset-y-2 left-1/3 w-1/3 rounded-full border border-sky-400/60 bg-sky-500/10" />
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
        {VALORES.map((n) => {
          const distancia = Math.abs(n - valor)
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
                distancia === 0 ? 'text-3xl text-sky-300' : distancia === 1 ? 'text-xl text-muted-foreground' : 'text-base text-muted-foreground/30',
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

function IconoModo({ id }: { id: Modo }) {
  if (id === 'cool') return <Snowflake className="h-6 w-6" />
  if (id === 'heat') return <Sun className="h-6 w-6" />
  if (id === 'fan') return <Fan className="h-6 w-6" />
  if (id === 'dry') return <Droplets className="h-6 w-6" />
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 16l4-9 4 9M9.5 13h5" />
    </svg>
  )
}

function Funcion({ nombre, activo, onClick, children }: { nombre: string; activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold',
        activo ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-border bg-secondary text-muted-foreground',
      )}
    >
      {children}
      {nombre}
    </button>
  )
}

function Fila({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: 'azul' | 'normal' | 'aviso' }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border py-3 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <b className={cn('text-right', tono === 'azul' && 'text-sky-300', tono === 'aviso' && 'text-amber-400', tono === 'normal' && 'text-foreground')}>{valor}</b>
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
      <div className="flex aspect-[2/1] w-full items-center justify-center rounded-xl border border-border px-4 text-center">
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
    <svg viewBox="0 0 250 125" className="block h-auto w-full" role="img" aria-label={`Temperatura de hoy frente al objetivo de ${objetivo} grados`}>
      <g stroke="currentColor" className="text-border">
        <path d="M18 10H242M18 35H242M18 60H242M18 85H242M18 110H242" />
        <path d="M18 10V110M74 10V110M130 10V110M186 10V110M242 10V110" />
      </g>
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M18 ${sp.toFixed(1)}H242`} stroke="currentColor" className="text-muted-foreground" strokeWidth="2" strokeDasharray="5 4" />
    </svg>
  )
}
