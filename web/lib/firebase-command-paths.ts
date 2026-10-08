/** Rutas RTDB para el canal app <-> HMI bajo /avc01/comandos */

export const FIREBASE_COMMAND_ROOT = 'avc01/comandos'
export const FIREBASE_COMMAND_REQUEST_PATH = `${FIREBASE_COMMAND_ROOT}/solicitud`
export const FIREBASE_COMMAND_RESPONSE_PATH = `${FIREBASE_COMMAND_ROOT}/respuesta`

/**
 * Rutas RTDB para el canal app <-> HMI bajo /avc01/comandos
 *
 * Esquema completo y campos de telemetria: ver DESARROLLO/FIREBASE_RTDB_ESQUEMA.md
 *
 * avc01/
 *   heartbeat, version, timestamp          <- HMI sube estado en vivo (onValue en PWA)
 *   temperatura, humedad, potencia, ...    <- sensores y motor
 *   wifi/, config/, historico/
 *   comandos/
 *     solicitud/   <- PWA escribe UN comando (reqId + ts + un campo)
 *     respuesta/   <- HMI responde (reqId, ok, mensaje, ts)
 *
 * sensores/        <- legacy enteros (temperatura, humedad)
 */

export function buildSolicitudPayload(
  reqId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const solicitud: Record<string, unknown> = { reqId }

  for (const [path, value] of Object.entries(fields)) {
    if (path.startsWith('config/')) {
      const configKey = path.slice('config/'.length)
      const currentConfig =
        solicitud.config && typeof solicitud.config === 'object'
          ? (solicitud.config as Record<string, unknown>)
          : {}
      solicitud.config = { ...currentConfig, [configKey]: value }
      continue
    }

    solicitud[path] = value
  }

  return solicitud
}
