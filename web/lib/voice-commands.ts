import type { VoiceIntent } from '@/components/voice-assistant'
import type { AVCData } from '@/hooks/use-avc-data'

export function buildSystemStatusMessage(data: AVCData): string {
  return [
    `Motor: ${data.estado === 'running' ? 'encendido' : 'apagado'}`,
    `Modo: ${data.modo}`,
    `Temperatura: ${data.temperatura}°C`,
    `Setpoint: ${data.setpoint}°C`,
    `Humedad: ${data.humedad}%`,
    `Velocidad: ${data.velocidad}%`,
  ].join(' · ')
}

export function executeVoiceIntent(
  intent: VoiceIntent,
  onUpdate: (path: string, value: unknown) => void,
  data: AVCData
): string | null {
  switch (intent.type) {
    case 'MOTOR_ON':
      onUpdate('estado', 'running')
      return 'Motor encendido'
    case 'MOTOR_OFF':
      onUpdate('estado', 'stopped')
      return 'Motor apagado'
    case 'MODE_AUTO':
      onUpdate('modo', 'AUTOMATICO')
      return 'Modo automatico activado'
    case 'MODE_MANUAL':
      onUpdate('modo', 'MANUAL')
      return 'Modo manual activado'
    case 'SETPOINT_UP':
    case 'SETPOINT_DOWN': {
      const value = Math.min(40, Math.max(0, intent.value))
      onUpdate('setpoint', value)
      return `Setpoint ajustado a ${value}°C`
    }
    case 'SETPOINT_QUERY':
      return `Setpoint actual: ${data.setpoint}°C`
    case 'SYSTEM_STATUS':
      return buildSystemStatusMessage(data)
    case 'NAVIGATE':
    case 'WEATHER':
    case 'UNKNOWN':
      return null
  }
}

export const PAGE_LABELS: Record<string, string> = {
  home: 'Panel principal',
  monitoreo: 'Monitoreo',
  configuraciones: 'Configuraciones',
  alertas: 'Alertas',
  'datos-externos': 'Datos externos',
}
