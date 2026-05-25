'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { database, ref, onValue, set, update, isFirebaseConfigured, serverTimestamp } from '@/lib/firebase'

export interface AVCHistoryDay {
  dayKey?: number
  potencia: number[]
  temperatura: number[]
  humedad: number[]
}

export interface AVCData {
  heartbeat: number
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

function normalizeHistorico(value: unknown): AVCData['historico'] {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.entries(value as Record<string, unknown>).reduce<AVCData['historico']>((accumulator, [day, dayData]) => {
    accumulator[day] = normalizeHistoryDay(dayData)
    return accumulator
  }, {})
}

function normalizeAVCData(value: unknown): AVCData {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const wifi = source.wifi && typeof source.wifi === 'object' ? (source.wifi as Record<string, unknown>) : {}
  const config = source.config && typeof source.config === 'object' ? (source.config as Record<string, unknown>) : {}
  const estado = source.estado === 'running' ? 'running' : 'stopped'
  const modo = source.modo === 'MANUAL' ? 'MANUAL' : 'AUTOMATICO'

  return {
    heartbeat: toNumber(source.heartbeat),
    temperatura: toNumber(source.temperatura),
    humedad: toNumber(source.humedad),
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
    },
    historico: normalizeHistorico(source.historico),
  }
}

function toCommandPath(path: string): string | null {
  if (path === 'estado' || path === 'modo' || path === 'velocidad' || path === 'setpoint') {
    return `comandos/${path}`
  }

  if (path.startsWith('config/')) {
    return `comandos/${path}`
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
  },
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
  },
  historico: {},
}

export function useAVCData() {
  const [data, setData] = useState<AVCData>(isFirebaseConfigured ? defaultData : demoData)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(!isFirebaseConfigured)
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null)
  const lastHeartbeatValueRef = useRef<number | null>(null)
  const lastHeartbeatAtRef = useRef<number | null>(null)

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
          const normalizedData = normalizeAVCData(snapshot.val())
          setData(normalizedData)

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
          'comandos/ts': serverTimestamp(),
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

  return { data, loading, error, updateData, updateMultiple, isDemo, lastHeartbeatAt }
}
