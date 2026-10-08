import { database, ref, onValue, set, serverTimestamp } from '@/lib/firebase'
import {
  buildSolicitudPayload,
  FIREBASE_COMMAND_REQUEST_PATH,
  FIREBASE_COMMAND_RESPONSE_PATH,
} from '@/lib/firebase-command-paths'

export interface RemoteCommandResponse {
  ok: boolean
  mensaje: string
  reqId: string
}

export interface RemoteCommandResponseNode {
  reqId?: string
  ok?: boolean
  mensaje?: string
  ts?: number
}

function createReqId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export async function sendRemoteCommand(
  fields: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<RemoteCommandResponse> {
  if (!database) {
    return {
      ok: false,
      reqId: '',
      mensaje: 'Firebase no esta configurado en esta pagina.',
    }
  }

  const reqId = createReqId()

  if (Object.keys(fields).length === 0) {
    return {
      ok: false,
      reqId,
      mensaje: 'No se reconocio ningun campo de comando valido.',
    }
  }

  return new Promise<RemoteCommandResponse>((resolve) => {
    const responseRef = ref(database, FIREBASE_COMMAND_RESPONSE_PATH)
    let settled = false

    const finish = (response: RemoteCommandResponse) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      unsubscribe()
      resolve(response)
    }

    const timeoutHandle = setTimeout(() => {
      finish({
        ok: false,
        reqId,
        mensaje:
          'El HMI no respondio a tiempo. Verifica que este encendido, conectado a WiFi y vinculado a Firebase.',
      })
    }, timeoutMs)

    const unsubscribe = onValue(responseRef, (snapshot) => {
      const value = snapshot.val() as RemoteCommandResponseNode | null
      if (!value || value.reqId !== reqId) {
        return
      }

      finish({
        ok: value.ok === true,
        reqId,
        mensaje:
          typeof value.mensaje === 'string' && value.mensaje.length > 0
            ? value.mensaje
            : value.ok
              ? 'Comando ejecutado correctamente.'
              : 'El HMI no pudo ejecutar el comando.',
      })
    })

    const solicitudRef = ref(database, FIREBASE_COMMAND_REQUEST_PATH)
    set(solicitudRef, {
      ...buildSolicitudPayload(reqId, fields),
      ts: serverTimestamp(),
    }).catch(() => {
      finish({
        ok: false,
        reqId,
        mensaje: 'No se pudo publicar el comando en Firebase.',
      })
    })
  })
}
