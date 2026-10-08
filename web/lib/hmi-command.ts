import { sendRemoteCommand, type RemoteCommandResponse } from '@/lib/firebase-remote-command'

export const HMI_ONLINE_MS = 25000

export interface HmiCommandResult {
  ok: boolean
  mensaje: string
  reqId?: string
}

export type HmiConnectionState = 'demo' | 'online' | 'offline' | 'no-wifi'

export function isRemoteCommandPath(path: string): boolean {
  return (
    path === 'estado' ||
    path === 'modo' ||
    path === 'velocidad' ||
    path === 'setpoint' ||
    path.startsWith('config/') ||
    path.startsWith('sistema/') ||
    path.startsWith('conectividad/') ||
    path.startsWith('automatizacion/')
  )
}

export function pathToCommandFields(path: string, value: unknown): Record<string, unknown> | null {
  if (!isRemoteCommandPath(path)) {
    return null
  }
  return { [path]: value }
}

export function getHmiConnectionState(
  isDemo: boolean,
  lastHeartbeatAt: number | null,
  hmiWifiConnected: boolean,
): HmiConnectionState {
  if (isDemo) {
    return 'demo'
  }

  if (!hmiWifiConnected) {
    return 'no-wifi'
  }

  if (lastHeartbeatAt === null || Date.now() - lastHeartbeatAt >= HMI_ONLINE_MS) {
    return 'offline'
  }

  return 'online'
}

export function buildHmiUnavailableMessage(state: HmiConnectionState): string {
  switch (state) {
    case 'no-wifi':
      return 'El HMI no tiene WiFi activa. Conectalo a una red antes de controlar el modulo.'
    case 'offline':
      return 'EcoPulse no detecta el HMI. Verifica que este encendido y vinculado a Firebase.'
    default:
      return 'No se pudo contactar al HMI en este momento.'
  }
}

export function buildHmiTimeoutMessage(): string {
  return 'Algo salio mal: el HMI no respondio. Puede estar apagado, sin red o ocupado procesando otra tarea.'
}

export function buildHmiSuccessMessage(path: string, value: unknown): string {
  switch (path) {
    case 'estado':
      return value === 'running' ? 'Motor encendido correctamente.' : 'Motor apagado correctamente.'
    case 'modo':
      return value === 'MANUAL' ? 'Modo manual activado.' : 'Modo automatico activado.'
    case 'velocidad':
      return `Velocidad ajustada a ${value} por ciento.`
    case 'setpoint':
      return `Setpoint configurado en ${value} grados.`
    default:
      if (path.startsWith('config/')) {
        return value ? 'Registro de datos activado.' : 'Registro de datos desactivado.'
      }
      return 'Comando aplicado correctamente.'
  }
}

export function buildDemoSuccessMessage(path: string, value: unknown): string {
  return `${buildHmiSuccessMessage(path, value)} (modo demo)`
}

interface ExecuteHmiCommandOptions {
  fields: Record<string, unknown>
  isDemo: boolean
  lastHeartbeatAt: number | null
  hmiWifiConnected: boolean
  onDemoApply?: (fields: Record<string, unknown>) => Promise<void>
  timeoutMs?: number
}

export async function executeHmiCommand(options: ExecuteHmiCommandOptions): Promise<HmiCommandResult> {
  const { fields, isDemo, lastHeartbeatAt, hmiWifiConnected, onDemoApply, timeoutMs } = options

  if (Object.keys(fields).length === 0) {
    return {
      ok: false,
      mensaje: 'No se reconocio ningun comando valido para el HMI.',
    }
  }

  if (isDemo) {
    if (onDemoApply) {
      await onDemoApply(fields)
    }

    const [path, value] = Object.entries(fields)[0] ?? []
    return {
      ok: true,
      mensaje: path ? buildDemoSuccessMessage(path, value) : 'Comando aplicado en modo demo.',
    }
  }

  const connectionState = getHmiConnectionState(isDemo, lastHeartbeatAt, hmiWifiConnected)
  if (connectionState !== 'online') {
    return {
      ok: false,
      mensaje: buildHmiUnavailableMessage(connectionState),
    }
  }

  let response: RemoteCommandResponse
  try {
    response = await sendRemoteCommand(fields, timeoutMs)
  } catch {
    return {
      ok: false,
      mensaje: buildHmiTimeoutMessage(),
    }
  }

  if (!response.ok && response.mensaje.includes('no respondio a tiempo')) {
    return {
      ok: false,
      mensaje: buildHmiTimeoutMessage(),
      reqId: response.reqId,
    }
  }

  return {
    ok: response.ok,
    mensaje: response.mensaje,
    reqId: response.reqId,
  }
}
