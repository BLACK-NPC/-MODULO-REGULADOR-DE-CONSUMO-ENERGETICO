'use client'

import { useEffect, useState } from 'react'
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

type DiaClave = (typeof DIAS)[number]['corto']
type HorasDia = { from: number; to: number }
type ReglasDatos = {
  recordDays: DiaClave[]
  dayHours: Record<DiaClave, HorasDia>
  autoDelete: { enabled: boolean; afterDays: number }
}

const CLAVE_REGLAS = 'ecopulse-datos-reglas'

function reglasBase(): ReglasDatos {
  const dayHours = Object.fromEntries(DIAS.map((dia) => [dia.corto, { from: 0, to: 23 }])) as Record<DiaClave, HorasDia>
  return { recordDays: DIAS.map((dia) => dia.corto), dayHours, autoDelete: { enabled: false, afterDays: 7 } }
}

function cargarReglas(): ReglasDatos {
  const base = reglasBase()
  if (typeof window === 'undefined') return base
  try {
    const raw = JSON.parse(window.localStorage.getItem(CLAVE_REGLAS) || '') as Partial<ReglasDatos>
    const recordDays = DIAS.map((dia) => dia.corto).filter((dia) => !Array.isArray(raw.recordDays) || raw.recordDays.includes(dia))
    const dayHours = { ...base.dayHours }
    for (const dia of DIAS) {
      const horas = raw.dayHours?.[dia.corto]
      if (!horas || !Number.isFinite(horas.from) || !Number.isFinite(horas.to)) continue
      const from = Math.max(0, Math.min(23, Math.round(horas.from)))
      const to = Math.max(from, Math.min(23, Math.round(horas.to)))
      dayHours[dia.corto] = { from, to }
    }
    const afterDays = Number(raw.autoDelete?.afterDays)
    return {
      recordDays,
      dayHours,
      autoDelete: {
        enabled: raw.autoDelete?.enabled === true,
        afterDays: Number.isFinite(afterDays) ? Math.max(1, Math.min(7, Math.round(afterDays))) : 7,
      },
    }
  } catch {
    return base
  }
}

function guardarReglas(reglas: ReglasDatos) {
  try {
    window.localStorage.setItem(CLAVE_REGLAS, JSON.stringify(reglas))
  } catch {
    /* el navegador puede negar espacio */
  }
}

function horaTxt(hora: number) {
  return `${String(hora).padStart(2, '0')}:00`
}

function franja(valores: (number | null)[]) {
  const horas = valores.flatMap((value, hour) => (value === null ? [] : [hour]))
  if (horas.length === 0) return null
  return { desde: horas[0], hasta: horas[horas.length - 1], n: horas.length }
}

function indiceHmi(corto: DiaClave) {
  return DIAS.findIndex((dia) => dia.corto === corto)
}

function reglasDesdeEquipo(reglas: NonNullable<AVCData['reglas']>): ReglasDatos {
  return {
    recordDays: DIAS.filter((_, index) => (reglas.dias & (1 << index)) !== 0).map((dia) => dia.corto),
    dayHours: Object.fromEntries(
      DIAS.map((dia, index) => [dia.corto, { from: reglas.desde[index] ?? 0, to: reglas.hasta[index] ?? 23 }]),
    ) as Record<DiaClave, HorasDia>,
    autoDelete: { enabled: reglas.auto, afterDays: reglas.autoDias },
  }
}

export function DatosAlmacenados({
  data,
  onToggle,
  onEnviar,
}: {
  data: AVCData
  onToggle: (path: string, value: boolean) => void
  onEnviar: (fields: Record<string, unknown>) => void
}) {
  const [tab, setTab] = useState<'general' | 'carpetas' | 'mapa' | 'reglas'>('general')
  const [reglasVista, setReglasVista] = useState<'menu' | 'dias' | 'borrado'>('menu')
  const [diaEdit, setDiaEdit] = useState<DiaClave>('Lun')
  const [reglas, setReglas] = useState<ReglasDatos>(cargarReglas)
  const firmaReglas = data.reglas
    ? `${data.reglas.dias}|${data.reglas.auto}|${data.reglas.autoDias}|${data.reglas.desde.join(',')}|${data.reglas.hasta.join(',')}`
    : ''
  useEffect(() => {
    if (!data.reglas || !firmaReglas) return
    const siguiente = reglasDesdeEquipo(data.reglas)
    setReglas(siguiente)
    guardarReglas(siguiente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaReglas])
  const [carpeta, setCarpeta] = useState<Metric | null>(null)
  const [mapa, setMapa] = useState<Metric>('temperatura')
  const [celda, setCelda] = useState('')

  const activo = {
    temperatura: data.config.guardarTemperatura,
    humedad: data.config.guardarHumedad,
    potencia: data.config.guardarPotencia,
  }
  function ponerReglas(siguiente: ReglasDatos, fields: Record<string, unknown>) {
    setReglas(siguiente)
    guardarReglas(siguiente)
    onEnviar(fields)
  }

  function fijarHora(from: number, to: number) {
    ponerReglas(
      { ...reglas, dayHours: { ...reglas.dayHours, [diaEdit]: { from, to } } },
      { 'config/horaDia': indiceHmi(diaEdit), 'config/horaDesde': from, 'config/horaHasta': to },
    )
  }

  const horasEdit = reglas.dayHours[diaEdit]
  const diasIguales = DIAS.filter((dia) => reglas.dayHours[dia.corto].from === horasEdit.from && reglas.dayHours[dia.corto].to === horasEdit.to).length
  const horariosDistintos = new Set(DIAS.map((dia) => `${reglas.dayHours[dia.corto].from}-${reglas.dayHours[dia.corto].to}`)).size
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

      {tab === 'reglas' && reglasVista === 'menu' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setReglasVista('dias')} className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left">
            <span className="block text-sm font-medium text-foreground">Dias y horario</span>
            <span className="text-xs text-muted-foreground">
              {reglas.recordDays.length}/7 dias · {horariosDistintos === 1 ? 'mismo horario' : `${horariosDistintos} con horario distinto`}
            </span>
          </button>
          <button type="button" onClick={() => setReglasVista('borrado')} className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left">
            <span className="block text-sm font-medium text-foreground">Auto-borrado</span>
            <span className="text-xs text-muted-foreground">
              {reglas.autoDelete.enabled ? `Activo · borra tras ${reglas.autoDelete.afterDays} dias` : 'Desactivado'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onEnviar({ 'config/aplicarBorrado': true })}
            className="h-9 rounded-md border border-border px-3 text-xs font-medium text-foreground"
          >
            Aplicar reglas ahora
          </button>
          <div className="space-y-2 pt-1">
            {DIAS.map((dia) => {
              const partes = CARPETAS.map((item) => {
                const rango = franja(serie(data, dia.idx, item.metric))
                return rango ? `${item.corto} ${horaTxt(rango.desde)}–${horaTxt(rango.hasta)}` : null
              }).filter((item): item is string => item !== null)
              const regla = reglas.recordDays.includes(dia.corto)
                ? `${horaTxt(reglas.dayHours[dia.corto].from)}–${horaTxt(reglas.dayHours[dia.corto].to)}`
                : 'No se graba'
              return (
                <div key={dia.idx} className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-sm text-foreground">{dia.largo}</p>
                  <p className="text-xs text-muted-foreground">Regla: {regla}</p>
                  <p className="text-xs text-muted-foreground">{partes.length ? `Publicado: ${partes.join(' · ')}` : 'Sin horario publicado'}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {tab === 'reglas' && reglasVista === 'dias' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setReglasVista('menu')} className="text-xs font-medium text-foreground">Volver a reglas</button>
            <p className="text-xs text-muted-foreground">Dias y horario</p>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Dias que se graban</p>
            <div className="grid grid-cols-7 gap-1">
              {DIAS.map((dia) => {
                const on = reglas.recordDays.includes(dia.corto)
                return (
                  <button
                    key={dia.corto}
                    type="button"
                    onClick={() => {
                      const recordDays = on ? reglas.recordDays.filter((item) => item !== dia.corto) : [...reglas.recordDays, dia.corto]
                      ponerReglas(
                        { ...reglas, recordDays },
                        { 'config/grabarDia': indiceHmi(dia.corto), 'config/grabarOn': !on },
                      )
                    }}
                    className={cn('h-8 rounded-md border text-xs font-medium', on ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground')}
                  >
                    {dia.corto}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Editar horario de</p>
            <div className="grid grid-cols-7 gap-1">
              {DIAS.map((dia) => (
                <button
                  key={dia.corto}
                  type="button"
                  onClick={() => setDiaEdit(dia.corto)}
                  className={cn('h-8 rounded-md border text-xs font-medium', diaEdit === dia.corto ? 'bg-green-600 text-white border-green-600' : 'border-border text-muted-foreground')}
                >
                  {dia.corto}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">Horario de {DIAS.find((dia) => dia.corto === diaEdit)?.largo}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => fijarHora(Math.max(0, horasEdit.from - 1), horasEdit.to)} className="h-8 w-8 rounded-md border border-border text-foreground">−</button>
              <span className="min-w-12 text-center text-sm text-foreground">{horaTxt(horasEdit.from)}</span>
              <button type="button" onClick={() => fijarHora(Math.min(horasEdit.to, horasEdit.from + 1), horasEdit.to)} className="h-8 w-8 rounded-md border border-border text-foreground">+</button>
            </div>
            <span className="text-xs text-muted-foreground">a</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => fijarHora(horasEdit.from, Math.max(horasEdit.from, horasEdit.to - 1))} className="h-8 w-8 rounded-md border border-border text-foreground">−</button>
              <span className="min-w-12 text-center text-sm text-foreground">{horaTxt(horasEdit.to)}</span>
              <button type="button" onClick={() => fijarHora(horasEdit.from, Math.min(23, horasEdit.to + 1))} className="h-8 w-8 rounded-md border border-border text-foreground">+</button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const dayHours = Object.fromEntries(DIAS.map((dia) => [dia.corto, { from: horasEdit.from, to: horasEdit.to }])) as Record<DiaClave, HorasDia>
              ponerReglas(
                { ...reglas, dayHours },
                { 'config/horaTodosDesde': horasEdit.from, 'config/horaTodosHasta': horasEdit.to },
              )
            }}
            className="h-9 rounded-md border border-border px-3 text-xs font-medium text-foreground"
          >
            Aplicar a todos los dias
          </button>
          <p className="text-xs text-muted-foreground">
            {diasIguales === 7 ? 'Los 7 dias usan este mismo horario' : `${diasIguales} de 7 dias usan este horario`}
          </p>
        </div>
      ) : null}

      {tab === 'reglas' && reglasVista === 'borrado' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setReglasVista('menu')} className="text-xs font-medium text-foreground">Volver a reglas</button>
            <p className="text-xs text-muted-foreground">Auto-borrado</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={reglas.autoDelete.enabled}
              onCheckedChange={(enabled) => ponerReglas(
                { ...reglas, autoDelete: { ...reglas.autoDelete, enabled } },
                { 'config/autoBorrado': enabled, 'config/autoDias': reglas.autoDelete.afterDays },
              )}
              className="data-[state=checked]:bg-green-500"
            />
            <p className="text-sm text-foreground">{reglas.autoDelete.enabled ? 'Activo' : 'Desactivado'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">Borrar dias con mas de</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => {
                const afterDays = Math.max(1, reglas.autoDelete.afterDays - 1)
                ponerReglas(
                  { ...reglas, autoDelete: { ...reglas.autoDelete, afterDays } },
                  { 'config/autoBorrado': reglas.autoDelete.enabled, 'config/autoDias': afterDays },
                )
              }} className="h-8 w-8 rounded-md border border-border text-foreground">−</button>
              <span className="min-w-16 text-center text-sm text-foreground">{reglas.autoDelete.afterDays} dias</span>
              <button type="button" onClick={() => {
                const afterDays = Math.min(7, reglas.autoDelete.afterDays + 1)
                ponerReglas(
                  { ...reglas, autoDelete: { ...reglas.autoDelete, afterDays } },
                  { 'config/autoBorrado': reglas.autoDelete.enabled, 'config/autoDias': afterDays },
                )
              }} className="h-8 w-8 rounded-md border border-border text-foreground">+</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Aplicar reglas ahora le pide al HMI que borre los dias que ya pasaron ese plazo. Hace falta el auto-borrado activo y el firmware nuevo cargado en el equipo.
          </p>
        </div>
      ) : null}
    </div>
  )
}
