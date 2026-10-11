import type { AVCData } from '@/hooks/use-avc-data'
import { DAY_KEYS, type HourRange } from '@/lib/voice-nlu'

export type Metric = 'potencia' | 'temperatura' | 'humedad'

export interface Segment {
  dayIdx: number
  from: number
  to: number
}

export interface Stat {
  /** Horas con dato. */
  n: number
  avg: number
  max: number
  maxH: number
  min: number
  minH: number
  /** Suma de los promedios por hora: en potencia equivale a vatios-hora. */
  sum: number
  maxDayIdx: number
  minDayIdx: number
}

export const METRIC_LABEL: Record<Metric, string> = {
  potencia: 'consumo',
  temperatura: 'temperatura',
  humedad: 'humedad',
}

export function dayKeyOf(idx: number): string {
  return DAY_KEYS[((idx % 7) + 7) % 7]
}

/**
 * Serie de 24 horas de un dia de la semana. null = sin muestra.
 * El HMI publica 24 promedios por hora; si llegan menos (demo), se reparten en el dia.
 * En temperatura y humedad el 0 es "sin muestra". En el dia de hoy las horas que
 * faltan por llegar no cuentan.
 */
export function hourlySeries(data: AVCData, dayIdx: number, metric: Metric, now = new Date()): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: 24 }, () => null)
  const raw = data.historico[dayKeyOf(dayIdx)]?.[metric] ?? []
  if (raw.length === 0) return out
  raw.forEach((value, i) => {
    const hour = raw.length === 24 ? i : Math.min(23, Math.floor((i * 24) / raw.length))
    if (hour < 24 && Number.isFinite(value)) out[hour] = value
  })
  if (metric !== 'potencia') {
    for (let h = 0; h < 24; h += 1) {
      if (out[h] === 0) out[h] = null
    }
  }
  if (dayIdx === now.getDay()) {
    for (let h = now.getHours() + 1; h < 24; h += 1) out[h] = null
  }
  return out
}

/** Divide un rango que cruza la medianoche en dos tramos (dia pedido y dia siguiente). */
export function segmentsFor(dayIdx: number, range: HourRange | null): Segment[] {
  if (!range) return [{ dayIdx, from: 0, to: 24 }]
  if (range.to <= 24) return [{ dayIdx, from: range.from, to: range.to }]
  return [
    { dayIdx, from: range.from, to: 24 },
    { dayIdx: (dayIdx + 1) % 7, from: 0, to: range.to - 24 },
  ]
}

export function weekSegments(): Segment[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayIdx: i, from: 0, to: 24 }))
}

export function statSegments(data: AVCData, metric: Metric, segments: Segment[], now = new Date()): Stat | null {
  let n = 0
  let sum = 0
  let max = -Infinity
  let maxH = 0
  let maxDayIdx = 0
  let min = Infinity
  let minH = 0
  let minDayIdx = 0
  for (const seg of segments) {
    const series = hourlySeries(data, seg.dayIdx, metric, now)
    for (let h = Math.max(0, seg.from); h < Math.min(24, seg.to); h += 1) {
      const value = series[h]
      if (value === null) continue
      n += 1
      sum += value
      if (value > max) {
        max = value
        maxH = h
        maxDayIdx = seg.dayIdx
      }
      // En potencia el 0 es "apagado": el minimo util es el menor consumo con carga.
      const countsForMin = metric !== 'potencia' || value > 0
      if (countsForMin && value < min) {
        min = value
        minH = h
        minDayIdx = seg.dayIdx
      }
    }
  }
  if (n === 0) return null
  return {
    n,
    avg: sum / n,
    max,
    maxH,
    min: min === Infinity ? 0 : min,
    minH,
    sum,
    maxDayIdx,
    minDayIdx,
  }
}

/** Kilovatios hora estimados: cada muestra es el promedio de una hora. */
export function kwh(stat: Stat): number {
  return stat.sum / 1000
}

export function loggingOn(data: AVCData, metric: Metric): boolean {
  if (metric === 'potencia') return data.config.guardarPotencia
  if (metric === 'temperatura') return data.config.guardarTemperatura
  return data.config.guardarHumedad
}

export function sensorOn(data: AVCData, metric: Metric): boolean {
  if (metric === 'potencia') return data.config.sensorPotencia
  if (metric === 'temperatura') return data.config.sensorTemperatura
  return data.config.sensorHumedad
}

/** Fecha real del ultimo dia de la semana pedido (hoy incluido). */
export function dateOfWeekday(idx: number, now = new Date()): Date {
  const back = (now.getDay() - idx + 7) % 7
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - back)
  return d
}
