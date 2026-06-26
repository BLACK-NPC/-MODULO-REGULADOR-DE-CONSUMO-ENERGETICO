import type { AVCData } from '@/hooks/use-avc-data'
import { buildAVCAlerts } from '@/lib/avc-alerts'

export const SENSORES_DISPONIBLES = [
  'motor',
  'ventilador principal',
  'ventilador',
  'sistema',
  'modulo',
  'sensor de temperatura',
  'sensor de humedad',
] as const

export type SensorName = (typeof SENSORES_DISPONIBLES)[number]

const HISTORICO_DAY_KEYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const

export interface VoiceConnectorsContext {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
  isFirebaseConnected: boolean
}

function historicoDayKey(offsetDays = 0): string {
  const index = (new Date().getDay() + offsetDays + 7) % 7
  return HISTORICO_DAY_KEYS[index]
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function formatHeartbeatAge(lastHeartbeatAt: number | null, now: number): string | null {
  if (lastHeartbeatAt === null) return null
  const minutes = Math.floor((now - lastHeartbeatAt) / 60000)
  if (minutes < 1) return 'hace unos segundos'
  if (minutes < 60) return `hace ${minutes} minutos`
  const hours = Math.floor(minutes / 60)
  return `hace ${hours} hora${hours === 1 ? '' : 's'}`
}

export function getAlarmas(ctx: VoiceConnectorsContext): { hayAlarmas: boolean; detalle: string } {
  const alerts = buildAVCAlerts(ctx.data, ctx.lastHeartbeatAt, ctx.isDemo, Date.now())
  const activeIssues = alerts.filter((alert) => alert.state === 'FALLA' || alert.state === 'APAGADO')

  if (activeIssues.length === 0) {
    return { hayAlarmas: false, detalle: '' }
  }

  const detalle = activeIssues
    .map((alert) => `${alert.title}: ${alert.message}`)
    .join(' ')

  return { hayAlarmas: true, detalle }
}

export function getEstadoFirebase(ctx: VoiceConnectorsContext): boolean {
  if (ctx.isDemo) return false
  if (!ctx.isFirebaseConnected) return false
  if (ctx.lastHeartbeatAt === null) return false
  return Date.now() - ctx.lastHeartbeatAt <= 25000
}

export function getSetpoint(data: AVCData): number {
  return data.setpoint
}

export function getConsumo(data: AVCData) {
  const todayKey = historicoDayKey(0)
  const yesterdayKey = historicoDayKey(-1)
  const todaySamples = data.historico[todayKey]?.potencia ?? []
  const yesterdaySamples = data.historico[yesterdayKey]?.potencia ?? []

  const todayAvg = average(todaySamples)
  const yesterdayAvg = average(yesterdaySamples)
  const variacionPct =
    yesterdayAvg > 0 ? Math.round(((todayAvg - yesterdayAvg) / yesterdayAvg) * 100) : 0

  let picoHoy = 0
  let picoIdx = 0
  todaySamples.forEach((value, index) => {
    if (value > picoHoy) {
      picoHoy = value
      picoIdx = index
    }
  })

  const horaBase = 6 + picoIdx * 2
  const horaPico = `${String(horaBase).padStart(2, '0')}:00`
  const hoyKwh = Math.round((todaySamples.reduce((sum, value) => sum + value, 0) / 1000) * 10) / 10

  return {
    actualWatts: data.potencia,
    hoyKwh,
    variacionPct,
    picoHoy,
    horaPico,
  }
}

export function getConsumoActuador(data: AVCData, nombre: string) {
  const isFan = /ventilador|motor|sistema|modulo/i.test(nombre)
  const watts = isFan && data.estado === 'running' ? data.potencia : 0
  const amperios = watts > 0 ? Math.round((watts / 110) * 100) / 100 : 0

  return { watts, amperios }
}

export function getRed(data: AVCData) {
  return {
    ssid: data.wifi.ssid || 'Desconocido',
    ip: data.wifi.ip || '0.0.0.0',
    rssi: null as number | null,
    conectado: data.wifi.conectado,
  }
}

export function getHistorialModos(data: AVCData) {
  const modoActual = data.modo === 'AUTOMATICO' ? 'automatico' : 'manual'

  return {
    autoInicio: null as string | null,
    autoFin: null as string | null,
    manualInicio: null as string | null,
    manualFin: null as string | null,
    modoActual,
  }
}

export function getUptime(ctx: VoiceConnectorsContext) {
  const { lastHeartbeatAt } = ctx
  if (lastHeartbeatAt === null) {
    return { desde: null as string | null, horas: 0 }
  }

  const elapsedMs = Date.now() - lastHeartbeatAt
  const horas = Math.round((elapsedMs / 3600000) * 10) / 10
  const desde = new Date(lastHeartbeatAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return { desde, horas }
}

export function getEstadoSistema(ctx: VoiceConnectorsContext) {
  const alerts = buildAVCAlerts(ctx.data, ctx.lastHeartbeatAt, ctx.isDemo, Date.now())
  const sensoresActivos = alerts.filter((alert) => alert.state === 'ENCENDIDO').length
  const errores = alerts
    .filter((alert) => alert.state === 'FALLA' || alert.state === 'APAGADO')
    .map((alert) => alert.title)

  const ultimoPing = formatHeartbeatAge(ctx.lastHeartbeatAt, Date.now())

  return {
    sensoresActivos,
    sensoresTotal: alerts.length,
    ultimoPing,
    errores,
  }
}

export function isActuatorSensor(sensor: string): boolean {
  return /motor|ventilador|sistema|modulo/i.test(sensor)
}

export function isReadOnlySensor(sensor: string): boolean {
  return /sensor de temperatura|sensor de humedad|sensor\s*[123]/i.test(sensor)
}

export function formatTimeNow(): string {
  return formatTime(new Date())
}

export function formatDateToday(): string {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
