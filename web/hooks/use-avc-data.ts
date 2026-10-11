'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { database, ref, onValue, set, update, isFirebaseConfigured, serverTimestamp } from '@/lib/firebase'
import {
  executeHmiCommand,
  pathToCommandFields,
  type HmiCommandResult,
} from '@/lib/hmi-command'

export interface FaultRecord {
  id: number
  signal: number
  flags: number
  start: number
  end: number
  peak: number
}

export interface AVCHistoryDay {
  dayKey?: number
  potencia: number[]
  temperatura: number[]
  humedad: number[]
}

export interface AVCData {
  heartbeat: number
  version?: number
  timestamp?: number
  temperatura: number
  humedad: number
  potencia: number
  movimiento: boolean
  velocidad: number
  estado: 'running' | 'stopped'
  modo: 'AUTOMATICO' | 'MANUAL'
  setpoint: number
  wifi: {
    ssid: string
    ip: string
    conectado: boolean
  }
  config: {
    guardarHumedad: boolean
    guardarTemperatura: boolean
    guardarPotencia: boolean
    guardarMovimiento: boolean
    sensorHumedad: boolean
    sensorTemperatura: boolean
    sensorPotencia: boolean
    sensorMovimiento: boolean
    spMin: number
    spMax: number
    dht: number
  }
  sistema: {
    brillo: number
    brilloOn: boolean
    suspension: number
    suspensionOn: boolean
    beep: boolean
    beepMs: number
    beepDuty: number
  }
  conectividad: {
    firebaseModo: number
    wifiRadio: boolean
  }
  automatizacion: {
    retencionMs: number
    alcance: number
  }
  diag: {
    fallas: number
    historial: FaultRecord[]
  }
  historico: {
    [dia: string]: AVCHistoryDay
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBoolean(value: unknown): boolean {
  return value === true
}

function normalizeHistoryDay(value: unknown): AVCHistoryDay {
  const source = value && typeof value === 'object' ? (value as Partial<AVCHistoryDay>) : {}

  return {
    dayKey: typeof source.dayKey === 'number' ? source.dayKey : undefined,
    potencia: Array.isArray(source.potencia) ? source.potencia.map((item) => toNumber(item)) : [],
    temperatura: Array.isArray(source.temperatura) ? source.temperatura.map((item) => toNumber(item)) : [],
    humedad: Array.isArray(source.humedad) ? source.humedad.map((item) => toNumber(item)) : [],
  }
}

function normalizeHistorial(value: unknown): FaultRecord[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : []
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const row = item as Record<string, unknown>
    const signal = toNumber(row.signal, -1)
    if (signal < 0 || signal > 6) {
      return []
    }
    return [{
      id: toNumber(row.id),
      signal,
      flags: toNumber(row.flags),
      start: toNumber(row.start),
      end: toNumber(row.end),
      peak: toNumber(row.peak),
    }]
  })
}

function normalizeHistorico(value: unknown): AVCData['historico'] {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.entries(value as Record<string, unknown>).reduce<AVCData['historico']>((accumulator, [day, dayData]) => {
    accumulator[day] = normalizeHistoryDay(dayData)
    return accumulator
  }, {})
}

function normalizeAVCData(value: unknown, lastAcceptedVersion = 0): AVCData | null {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const incomingVersion = toNumber(source.version, 0)

  if (incomingVersion > 0 && incomingVersion < lastAcceptedVersion) {
    return null
  }

  const wifi = source.wifi && typeof source.wifi === 'object' ? (source.wifi as Record<string, unknown>) : {}
  const config = source.config && typeof source.config === 'object' ? (source.config as Record<string, unknown>) : {}
  const sistema = source.sistema && typeof source.sistema === 'object' ? (source.sistema as Record<string, unknown>) : {}
  const conectividad = source.conectividad && typeof source.conectividad === 'object' ? (source.conectividad as Record<string, unknown>) : {}
  const automatizacion = source.automatizacion && typeof source.automatizacion === 'object' ? (source.automatizacion as Record<string, unknown>) : {}
  const diag = source.diag && typeof source.diag === 'object' ? (source.diag as Record<string, unknown>) : {}
  const optionalBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  const estado = source.estado === 'running' ? 'running' : 'stopped'
  const modo = source.modo === 'MANUAL' ? 'MANUAL' : 'AUTOMATICO'

  return {
    heartbeat: toNumber(source.heartbeat),
    version: incomingVersion > 0 ? incomingVersion : undefined,
    timestamp: toNumber(source.timestamp, 0) || undefined,
    temperatura: Math.round(toNumber(source.temperatura) * 10) / 10,
    humedad: Math.round(toNumber(source.humedad) * 10) / 10,
    potencia: toNumber(source.potencia),
    movimiento: toBoolean(source.movimiento),
    velocidad: toNumber(source.velocidad),
    estado,
    modo,
    setpoint: toNumber(source.setpoint, 22),
    wifi: {
      ssid: typeof wifi.ssid === 'string' ? wifi.ssid : '',
      ip: typeof wifi.ip === 'string' ? wifi.ip : '',
      conectado: toBoolean(wifi.conectado),
    },
    config: {
      guardarHumedad: toBoolean(config.guardarHumedad),
      guardarTemperatura: toBoolean(config.guardarTemperatura),
      guardarPotencia: toBoolean(config.guardarPotencia),
      guardarMovimiento: toBoolean(config.guardarMovimiento),
      sensorHumedad: optionalBool(config.sensorHumedad, true),
      sensorTemperatura: optionalBool(config.sensorTemperatura, true),
      sensorPotencia: optionalBool(config.sensorPotencia, true),
      sensorMovimiento: optionalBool(config.sensorMovimiento, true),
      spMin: toNumber(config.spMin, 0),
      spMax: toNumber(config.spMax, 100),
      dht: toNumber(config.dht, 11) === 22 ? 22 : 11,
    },
    sistema: {
      brillo: toNumber(sistema.brillo, 80),
      brilloOn: optionalBool(sistema.brilloOn, true),
      suspension: Math.min(6, Math.max(0, toNumber(sistema.suspension, 4))),
      suspensionOn: optionalBool(sistema.suspensionOn, true),
      beep: optionalBool(sistema.beep, false),
      beepMs: toNumber(sistema.beepMs, 50),
      beepDuty: toNumber(sistema.beepDuty, 60),
    },
    conectividad: {
      firebaseModo: Math.min(3, Math.max(0, toNumber(conectividad.firebaseModo, 3))),
      wifiRadio: optionalBool(conectividad.wifiRadio, true),
    },
    automatizacion: {
      retencionMs: toNumber(automatizacion.retencionMs, 2000),
      alcance: Math.min(2, Math.max(0, toNumber(automatizacion.alcance, 0))),
    },
    diag: {
      fallas: toNumber(diag.fallas, 0),
      historial: normalizeHistorial(diag.historial),
    },
    historico: normalizeHistorico(source.historico),
  }
}

function toCommandPath(path: string): string | null {
  if (path === 'estado' || path === 'modo' || path === 'velocidad' || path === 'setpoint') {
    return `comandos/solicitud/${path}`
  }

  if (
    path.startsWith('config/') ||
    path.startsWith('sistema/') ||
    path.startsWith('conectividad/') ||
    path.startsWith('automatizacion/')
  ) {
    return `comandos/solicitud/${path}`
  }

  return null
}

const demoData: AVCData = {
  heartbeat: 0,
  temperatura: 25,
  humedad: 27,
  potencia: 45,
  movimiento: true,
  velocidad: 65,
  estado: 'running',
  modo: 'AUTOMATICO',
  setpoint: 22,
  wifi: {
    ssid: 'MiCasa_5G',
    ip: '192.168.1.100',
    conectado: true,
  },
  config: {
    guardarHumedad: true,
    guardarTemperatura: true,
    guardarPotencia: false,
    guardarMovimiento: false,
    sensorHumedad: true,
    sensorTemperatura: true,
    sensorPotencia: true,
    sensorMovimiento: true,
    spMin: 0,
    spMax: 100,
    dht: 11,
  },
  sistema: { brillo: 80, brilloOn: true, suspension: 4, suspensionOn: true, beep: false, beepMs: 50, beepDuty: 60 },
  conectividad: { firebaseModo: 3, wifiRadio: true },
  automatizacion: { retencionMs: 2000, alcance: 0 },
  diag: { fallas: 0, historial: [] },
  historico: {
    Lun: { potencia: [10, 25, 37, 50, 45, 30], temperatura: [20, 22, 25, 28, 26, 24], humedad: [30, 35, 40, 38, 35, 32] },
    Mar: { potencia: [15, 30, 42, 48, 40, 25], temperatura: [21, 24, 27, 29, 27, 23], humedad: [32, 38, 42, 40, 36, 33] },
    Mie: { potencia: [12, 28, 35, 45, 38, 28], temperatura: [19, 23, 26, 28, 25, 22], humedad: [28, 33, 38, 36, 34, 30] },
    Jue: { potencia: [18, 32, 40, 52, 42, 30], temperatura: [22, 25, 28, 30, 27, 24], humedad: [34, 40, 44, 42, 38, 35] },
    Vie: { potencia: [14, 26, 38, 46, 36, 22], temperatura: [20, 23, 26, 27, 25, 22], humedad: [30, 36, 40, 38, 35, 31] },
    Sab: { potencia: [8, 18, 28, 35, 28, 15], temperatura: [18, 21, 24, 26, 24, 20], humedad: [26, 30, 34, 32, 30, 28] },
    Dom: { potencia: [5, 12, 20, 28, 22, 10], temperatura: [17, 20, 22, 24, 22, 19], humedad: [24, 28, 32, 30, 28, 26] },
  },
}

const defaultData: AVCData = {
  heartbeat: 0,
  temperatura: 0,
  humedad: 0,
  potencia: 0,
  movimiento: false,
  velocidad: 0,
  estado: 'stopped',
  modo: 'AUTOMATICO',
  setpoint: 22,
  wifi: {
    ssid: '',
    ip: '',
    conectado: false,
  },
  config: {
    guardarHumedad: false,
    guardarTemperatura: false,
    guardarPotencia: false,
    guardarMovimiento: false,
    sensorHumedad: true,
    sensorTemperatura: true,
    sensorPotencia: true,
    sensorMovimiento: true,
    spMin: 0,
    spMax: 100,
    dht: 11,
  },
  sistema: { brillo: 80, brilloOn: true, suspension: 4, suspensionOn: true, beep: false, beepMs: 50, beepDuty: 60 },
  conectividad: { firebaseModo: 3, wifiRadio: true },
  automatizacion: { retencionMs: 2000, alcance: 0 },
  diag: { fallas: 0, historial: [] },
  historico: {},
}

function keepAbsentKeys<T extends Record<string, unknown>>(
  previous: T,
  incoming: T,
  rawParent: unknown,
  keys: (keyof T)[],
): T {
  const raw = rawParent && typeof rawParent === 'object' ? (rawParent as Record<string, unknown>) : {}
  const merged = { ...incoming }
  for (const key of keys) {
    if (!(String(key) in raw)) {
      merged[key] = previous[key]
    }
  }
  return merged
}

function applyCommandPath(data: AVCData, path: string, value: unknown): AVCData {
  const slash = path.indexOf('/')
  if (slash < 0) {
    return { ...data, [path]: value }
  }
  const group = path.slice(0, slash) as keyof AVCData
  const key = path.slice(slash + 1)
  const parent = data[group]
  if (!parent || typeof parent !== 'object') {
    return data
  }
  return { ...data, [group]: { ...parent, [key]: value } }
}

export function useAVCData() {
  const [data, setData] = useState<AVCData>(isFirebaseConfigured ? defaultData : demoData)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(!isFirebaseConfigured)
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null)
  const lastHeartbeatValueRef = useRef<number | null>(null)
  const lastHeartbeatAtRef = useRef<number | null>(null)
  const lastAcceptedVersionRef = useRef(0)

  useEffect(() => {
    if (!isFirebaseConfigured || !database) {
      setIsDemo(true)
      setLoading(false)
      return
    }

    const avcRef = ref(database, 'avc01')
    
    const unsubscribe = onValue(
      avcRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const normalizedData = normalizeAVCData(snapshot.val(), lastAcceptedVersionRef.current)
          if (!normalizedData) {
            return
          }

          if (normalizedData.version && normalizedData.version > lastAcceptedVersionRef.current) {
            lastAcceptedVersionRef.current = normalizedData.version
          }

          const raw = snapshot.val() as Record<string, unknown>
          setData((prev) => ({
            ...normalizedData,
            config: keepAbsentKeys(prev.config, normalizedData.config, raw.config, [
              'sensorHumedad',
              'sensorTemperatura',
              'sensorPotencia',
              'sensorMovimiento',
              'spMin',
              'spMax',
              'dht',
            ]),
            sistema: keepAbsentKeys(prev.sistema, normalizedData.sistema, raw.sistema, [
              'brillo',
              'brilloOn',
              'suspension',
              'suspensionOn',
              'beep',
              'beepMs',
              'beepDuty',
            ]),
            conectividad: keepAbsentKeys(
              prev.conectividad,
              normalizedData.conectividad,
              raw.conectividad,
              ['firebaseModo', 'wifiRadio'],
            ),
            automatizacion: keepAbsentKeys(
              prev.automatizacion,
              normalizedData.automatizacion,
              raw.automatizacion,
              ['retencionMs', 'alcance'],
            ),
            diag: keepAbsentKeys(prev.diag, normalizedData.diag, raw.diag, ['fallas', 'historial']),
          }))

          if (lastHeartbeatValueRef.current !== normalizedData.heartbeat || lastHeartbeatAtRef.current === null) {
            const now = Date.now()
            lastHeartbeatValueRef.current = normalizedData.heartbeat
            lastHeartbeatAtRef.current = now
            setLastHeartbeatAt(now)
          }
        } else {
          setData(defaultData)
        }
        setError(null)
        setIsDemo(false)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const updateData = useCallback(async (path: string, value: unknown) => {
    if (isDemo) {
      // In demo mode, update local state
      setData(prev => {
        const keys = path.split('/')
        const newData = { ...prev }
        let current: Record<string, unknown> = newData
        for (let i = 0; i < keys.length - 1; i++) {
          current[keys[i]] = { ...(current[keys[i]] as Record<string, unknown>) }
          current = current[keys[i]] as Record<string, unknown>
        }
        current[keys[keys.length - 1]] = value
        return newData as AVCData
      })
      return
    }

    if (!database) return

    try {
      const commandPath = toCommandPath(path)

      if (commandPath) {
        const avcRef = ref(database, 'avc01')
        await update(avcRef, {
          [commandPath]: value,
          'comandos/solicitud/ts': serverTimestamp(),
        })
        return
      }

      const dataRef = ref(database, `avc01/${path}`)
      await set(dataRef, value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating data')
    }
  }, [isDemo])

  const updateMultiple = useCallback(async (updates: Record<string, unknown>) => {
    if (isDemo) {
      setData(prev => ({ ...prev, ...updates }))
      return
    }

    if (!database) return

    try {
      const avcRef = ref(database, 'avc01')
      await update(avcRef, updates)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating data')
    }
  }, [isDemo])

  const applyDemoFields = useCallback(async (fields: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(fields)) {
      await updateData(path, value)
    }
  }, [updateData])

  const sendHmiCommand = useCallback(async (fields: Record<string, unknown>): Promise<HmiCommandResult> => {
    return executeHmiCommand({
      fields,
      isDemo,
      lastHeartbeatAt,
      hmiWifiConnected: data.wifi.conectado,
      onDemoApply: applyDemoFields,
    })
  }, [isDemo, lastHeartbeatAt, data.wifi.conectado, applyDemoFields])

  const commandUpdate = useCallback(async (path: string, value: unknown): Promise<HmiCommandResult> => {
    const fields = pathToCommandFields(path, value)
    if (!fields) {
      await updateData(path, value)
      return { ok: true, mensaje: '' }
    }
    let previousValue: unknown
    setData((prev) => {
      const slash = path.indexOf('/')
      if (slash < 0) {
        previousValue = prev[path as keyof AVCData]
      } else {
        const parent = prev[path.slice(0, slash) as keyof AVCData]
        previousValue =
          parent && typeof parent === 'object'
            ? (parent as Record<string, unknown>)[path.slice(slash + 1)]
            : undefined
      }
      return applyCommandPath(prev, path, value)
    })
    const result = await sendHmiCommand(fields)
    if (!result.ok) {
      setData((prev) => applyCommandPath(prev, path, previousValue))
    }
    return result
  }, [sendHmiCommand, updateData])

  return {
    data,
    loading,
    error,
    updateData,
    updateMultiple,
    sendHmiCommand,
    commandUpdate,
    isDemo,
    lastHeartbeatAt,
  }
}
