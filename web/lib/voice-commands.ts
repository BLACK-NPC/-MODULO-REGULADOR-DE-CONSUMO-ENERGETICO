import type { VoiceIntent } from '@/components/voice-assistant'
import type { AVCData } from '@/hooks/use-avc-data'
import {
  formatDateToday,
  formatTimeNow,
  getAlarmas,
  getConsumo,
  getConsumoActuador,
  getEstadoFirebase,
  getEstadoSistema,
  getHistorialModos,
  getRed,
  getSetpoint,
  getUptime,
  isActuatorSensor,
  isReadOnlySensor,
  type VoiceConnectorsContext,
} from '@/lib/voice-connectors'

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

export function buildVoiceConnectorsContext(
  data: AVCData,
  isDemo: boolean,
  lastHeartbeatAt: number | null,
): VoiceConnectorsContext {
  return {
    data,
    isDemo,
    lastHeartbeatAt,
    isFirebaseConnected: !isDemo,
  }
}

export function buildVoiceQueryMessage(
  intent: VoiceIntent,
  ctx: VoiceConnectorsContext,
): string | null {
  switch (intent.type) {
    case 'ALARMS_QUERY': {
      const { hayAlarmas, detalle } = getAlarmas(ctx)
      return hayAlarmas
        ? `Si, hay alarmas activas. ${detalle}`
        : 'No hay alarmas activas en este momento.'
    }
    case 'FIREBASE_STATUS': {
      const conectado = getEstadoFirebase(ctx)
      return conectado
        ? 'Si, la pagina esta conectada a Firebase y recibe datos del HMI.'
        : 'No, actualmente no hay conexion activa con Firebase.'
    }
    case 'SETPOINT_QUERY':
      return `El setpoint actual esta en ${getSetpoint(ctx.data)} grados.`
    case 'CONSUMPTION_CURRENT': {
      const c = getConsumo(ctx.data)
      return `El consumo actual es de ${c.actualWatts} vatios.`
    }
    case 'CONSUMPTION_VARIATION': {
      const c = getConsumo(ctx.data)
      return `Hoy la potencia ha variado un ${c.variacionPct}%, con un pico de ${c.picoHoy} vatios a las ${c.horaPico}, y un acumulado estimado de ${c.hoyKwh} kilovatios hora.`
    }
    case 'FAN_CONSUMPTION': {
      const c = getConsumoActuador(ctx.data, 'ventilador principal')
      return `El ventilador esta consumiendo ${c.watts} vatios, equivalentes a ${c.amperios} amperios.`
    }
    case 'WIFI_NETWORK': {
      const r = getRed(ctx.data)
      if (!r.conectado) {
        return 'El sistema no esta conectado a ninguna red en este momento.'
      }
      const rssiText = r.rssi !== null ? ` y senal de ${r.rssi} decibelios` : ''
      return `Estas conectado a la red ${r.ssid}, con ip ${r.ip}${rssiText}.`
    }
    case 'TIME_NOW':
      return `Son las ${formatTimeNow()}.`
    case 'DATE_TODAY':
      return `Hoy es ${formatDateToday()}.`
    case 'MODE_AUTO_START': {
      const h = getHistorialModos(ctx.data)
      return h.autoInicio
        ? `El modo automatico inicio a las ${h.autoInicio}.`
        : 'No tengo registro de cuando inicio el modo automatico.'
    }
    case 'MODE_AUTO_END': {
      const h = getHistorialModos(ctx.data)
      return h.autoFin
        ? `El modo automatico se desactivo a las ${h.autoFin}.`
        : 'El modo automatico sigue activo, o no tengo registro de su finalizacion.'
    }
    case 'MODE_MANUAL_START': {
      const h = getHistorialModos(ctx.data)
      return h.manualInicio
        ? `El modo manual inicio a las ${h.manualInicio}.`
        : 'No tengo registro de cuando inicio el modo manual.'
    }
    case 'MODE_CURRENT': {
      const h = getHistorialModos(ctx.data)
      return `El sistema esta actualmente en modo ${h.modoActual}.`
    }
    case 'UPTIME': {
      const u = getUptime(ctx)
      return u.desde
        ? `El HMI reporto actividad reciente hace ${u.horas} horas, ultimo dato a las ${u.desde}.`
        : 'No tengo registro del tiempo de actividad.'
    }
    case 'SYSTEM_HEALTH': {
      const e = getEstadoSistema(ctx)
      if (e.errores.length > 0) {
        return `Atencion, hay ${e.errores.length} alerta(s): ${e.errores.join(', ')}.`
      }
      const pingText = e.ultimoPing ? ` Ultimo dato ${e.ultimoPing}.` : ''
      return `Todo en orden. ${e.sensoresActivos} de ${e.sensoresTotal} sensores activos.${pingText}`
    }
    case 'SYSTEM_STATUS':
      return buildSystemStatusMessage(ctx.data)
    default:
      return null
  }
}

export function buildVoiceCommandFields(
  intent: VoiceIntent,
  data: AVCData,
): Record<string, unknown> | null {
  switch (intent.type) {
    case 'MOTOR_ON':
      return { estado: 'running' }
    case 'MOTOR_OFF':
      return { estado: 'stopped' }
    case 'SENSOR_ON': {
      if (isReadOnlySensor(intent.sensor)) {
        return null
      }
      if (!isActuatorSensor(intent.sensor)) {
        return null
      }
      return { estado: 'running' }
    }
    case 'SENSOR_OFF': {
      if (isReadOnlySensor(intent.sensor)) {
        return null
      }
      if (!isActuatorSensor(intent.sensor)) {
        return null
      }
      return { estado: 'stopped' }
    }
    case 'MODE_AUTO':
      return { modo: 'AUTOMATICO' }
    case 'MODE_MANUAL':
      return { modo: 'MANUAL' }
    case 'SET_SETPOINT':
    case 'SETPOINT_UP':
    case 'SETPOINT_DOWN': {
      const value = Math.min(40, Math.max(0, intent.value))
      return { setpoint: value }
    }
    default:
      return null
  }
}

export function buildVoiceCommandValidationMessage(intent: VoiceIntent): string | null {
  switch (intent.type) {
    case 'SENSOR_ON':
      if (isReadOnlySensor(intent.sensor)) {
        return `${intent.sensor} es solo lectura, no se puede encender.`
      }
      if (!isActuatorSensor(intent.sensor)) {
        return `No reconozco el actuador ${intent.sensor}.`
      }
      return null
    case 'SENSOR_OFF':
      if (isReadOnlySensor(intent.sensor)) {
        return `${intent.sensor} es solo lectura, no se puede apagar.`
      }
      if (!isActuatorSensor(intent.sensor)) {
        return `No reconozco el actuador ${intent.sensor}.`
      }
      return null
    default:
      return null
  }
}

export function isVoiceActionIntent(intent: VoiceIntent): boolean {
  return buildVoiceCommandFields(intent, {} as AVCData) !== null
}

export function buildVoiceActionAckMessage(
  intent: VoiceIntent,
  fields: Record<string, unknown>,
): string {
  switch (intent.type) {
    case 'MOTOR_ON':
      return 'Motor encendido (modo demo).'
    case 'MOTOR_OFF':
      return 'Motor apagado (modo demo).'
    case 'SENSOR_ON':
      return `Listo, encendi ${intent.sensor} (modo demo).`
    case 'SENSOR_OFF':
      return `Listo, apague ${intent.sensor} (modo demo).`
    case 'MODE_AUTO':
      return 'Modo automatico activado (modo demo).'
    case 'MODE_MANUAL':
      return 'Modo manual activado (modo demo).'
    case 'SET_SETPOINT':
    case 'SETPOINT_UP':
    case 'SETPOINT_DOWN':
      return `Setpoint ajustado a ${fields.setpoint} grados (modo demo).`
    default:
      return 'Comando aplicado en modo demo.'
  }
}

export const PAGE_LABELS: Record<string, string> = {
  home: 'Panel principal',
  monitoreo: 'Monitoreo',
  configuraciones: 'Configuraciones',
  alertas: 'Alertas',
  'datos-externos': 'Datos externos',
}

export const VOICE_HELP_SUMMARY =
  'Puedes decir: hay alarmas, estado de Firebase, enciende el motor, pon el setpoint en 24, consumo actual, a que red estoy conectado, que hora es, clima en Cali, ir a monitoreo, y mas.'
