import type { AVCData } from '@/hooks/use-avc-data'

export type AVCAlertState = 'APAGADO' | 'FALLA' | 'ENCENDIDO'

export interface AVCAlertItem {
  id: string
  title: string
  state: AVCAlertState
  message: string
  detail: string
}

const HEARTBEAT_STALE_MS = 25000

function hasFreshHeartbeat(lastHeartbeatAt: number | null, now: number): boolean {
  return lastHeartbeatAt !== null && now - lastHeartbeatAt <= HEARTBEAT_STALE_MS
}

function signalState(active: boolean, available: boolean): AVCAlertState {
  if (!available) {
    return 'APAGADO'
  }

  return active ? 'ENCENDIDO' : 'FALLA'
}

export function buildAVCAlerts(
  data: AVCData,
  lastHeartbeatAt: number | null,
  isDemo: boolean,
  now: number,
): AVCAlertItem[] {
  const freshHeartbeat = hasFreshHeartbeat(lastHeartbeatAt, now)
  const firebaseAvailable = !isDemo

  const temperaturaActive = freshHeartbeat && Number.isFinite(data.temperatura)
  const humedadActive = freshHeartbeat && Number.isFinite(data.humedad)
  const potenciaActive = freshHeartbeat && Number.isFinite(data.potencia)
  const movimientoActive = freshHeartbeat && data.movimiento
  const wifiActive = freshHeartbeat && data.wifi.conectado
  const firebaseActive = firebaseAvailable && freshHeartbeat

  return [
    {
      id: 'temperatura',
      title: 'TEMPERATURA',
      state: signalState(temperaturaActive, true),
      message: temperaturaActive ? 'Sensor de temperatura respondiendo.' : 'No hay lectura valida reciente del sensor de temperatura.',
      detail: `${data.temperatura.toFixed(1)} C`,
    },
    {
      id: 'humedad',
      title: 'HUMEDAD',
      state: signalState(humedadActive, true),
      message: humedadActive ? 'Sensor de humedad respondiendo.' : 'No hay lectura valida reciente del sensor de humedad.',
      detail: `${data.humedad.toFixed(1)} %`,
    },
    {
      id: 'potencia',
      title: 'POTENCIA',
      state: signalState(potenciaActive, true),
      message: potenciaActive ? 'Lectura de potencia activa.' : 'No hay lectura valida reciente del sensor de potencia.',
      detail: `${data.potencia} %`,
    },
    {
      id: 'movimiento',
      title: 'MOVIMIENTO',
      state: signalState(movimientoActive, true),
      message: movimientoActive ? 'El PIR reporta deteccion.' : 'El PIR no reporta deteccion reciente.',
      detail: data.movimiento ? 'PIR ON' : 'PIR OFF',
    },
    {
      id: 'wifi',
      title: 'WIFI',
      state: signalState(wifiActive, true),
      message: wifiActive ? 'El HMI reporta conexion WiFi.' : 'El HMI reporta WiFi desconectado o sin actualizacion reciente.',
      detail: data.wifi.ssid || 'Sin SSID',
    },
    {
      id: 'firebase',
      title: 'FIREBASE',
      state: signalState(firebaseActive, firebaseAvailable),
      message: firebaseActive
        ? 'El HMI esta publicando datos recientes en Firebase.'
        : 'No se reciben actualizaciones recientes del HMI en Firebase.',
      detail: freshHeartbeat ? 'RTDB activo' : 'RTDB sin heartbeat reciente',
    },
  ]
}
