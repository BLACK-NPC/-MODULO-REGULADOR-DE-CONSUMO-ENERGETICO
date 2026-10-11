import { buscarFicha, type MotorFicha } from '@/lib/motor-catalog'

export const EQUIPO_KEY = 'ecopulse-equipo'
export const EQUIPO_EVENT = 'ecopulse-equipo'
export const EQUIPO_MAX = 4

export type EquipoProfile = {
  brand: string
  model: string
  code: string
  watts: number
  volts: number
  hz: number
  rpm: number
  amps: number
  limitFab: number
  limitCfg: number
  limitRec: number
  tempWarn: number
  tempCrit: number
  specsFound: boolean
  verified: boolean
}

export type EquipoSlot = {
  used: boolean
  id: string
  name: string
  brand: string
  model: string
  code: string
  watts: number
  volts: number
  hz: number
  rpm: number
  amps: number
  limitCfg: number
  limitRec: number
  hoursBase: number
}

export type EquipoStore = {
  profile: EquipoProfile
  slots: EquipoSlot[]
  activeIndex: number
}

function perfilInicial(): EquipoProfile {
  return {
    brand: 'Fasco',
    model: 'D1092',
    code: 'D1092-115',
    watts: 75,
    volts: 115,
    hz: 60,
    rpm: 1550,
    amps: 1.6,
    limitFab: 92,
    limitCfg: 82,
    limitRec: 75,
    tempWarn: 50,
    tempCrit: 60,
    specsFound: false,
    verified: false,
  }
}

function ranurasIniciales(): EquipoSlot[] {
  return [
    { used: true, id: 'P001', name: 'Motor extraccion A', brand: 'Fasco', model: 'D1092', code: 'D1092-115', watts: 75, volts: 115, hz: 60, rpm: 1550, amps: 1.6, limitCfg: 82, limitRec: 75, hoursBase: 1240 },
    { used: true, id: 'P002', name: 'Extractor bano', brand: 'Broan', model: '97009745', code: '97009745', watts: 55, volts: 120, hz: 60, rpm: 1500, amps: 0.9, limitCfg: 85, limitRec: 70, hoursBase: 430 },
    { used: true, id: 'P003', name: 'Inyeccion cocina', brand: 'Soler & Palau', model: 'TD-500/150', code: 'TD500-150', watts: 65, volts: 230, hz: 50, rpm: 2400, amps: 0.3, limitCfg: 80, limitRec: 62, hoursBase: 2115 },
    { used: false, id: 'P004', name: '', brand: '', model: '', code: '', watts: 0, volts: 0, hz: 60, rpm: 0, amps: 0, limitCfg: 70, limitRec: 60, hoursBase: 0 },
  ]
}

function vacio(): EquipoStore {
  return { profile: perfilInicial(), slots: ranurasIniciales(), activeIndex: 0 }
}

function numero(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizar(raw: unknown): EquipoStore {
  const base = vacio()
  if (!raw || typeof raw !== 'object') return base
  const parsed = raw as { profile?: Partial<EquipoProfile>; slots?: Partial<EquipoSlot>[]; activeIndex?: number; activeId?: string }
  if (parsed.profile) {
    base.profile = { ...base.profile, ...parsed.profile }
  }
  if (Array.isArray(parsed.slots) && parsed.slots.length > 0 && parsed.slots[0] && 'used' in parsed.slots[0]) {
    base.slots = ranurasIniciales().map((slot, index) => {
      const incoming = parsed.slots?.[index]
      if (!incoming) return slot
      return {
        ...slot,
        ...incoming,
        used: Boolean(incoming.used),
        watts: numero(incoming.watts, slot.watts),
        volts: numero(incoming.volts, slot.volts),
        hz: numero(incoming.hz, slot.hz),
        rpm: numero(incoming.rpm, slot.rpm),
        amps: numero(incoming.amps, slot.amps),
        limitCfg: numero(incoming.limitCfg, slot.limitCfg),
        limitRec: numero(incoming.limitRec, slot.limitRec),
        hoursBase: numero(incoming.hoursBase, slot.hoursBase),
      }
    })
  } else if (Array.isArray(parsed.slots) && parsed.slots.length > 0) {
    const viejo = parsed.slots[0] as Partial<EquipoProfile> & { model?: string; watts?: number }
    base.profile = {
      ...base.profile,
      model: viejo.model ?? base.profile.model,
      watts: numero(viejo.watts, base.profile.watts),
      volts: numero(viejo.volts, base.profile.volts),
      hz: numero(viejo.hz, base.profile.hz),
      rpm: numero(viejo.rpm, base.profile.rpm),
      amps: numero(viejo.amps, base.profile.amps),
      limitRec: numero(viejo.limitRec, base.profile.limitRec),
      limitCfg: numero(viejo.limitCfg, base.profile.limitCfg),
      limitFab: numero(viejo.limitFab, base.profile.limitFab),
      tempWarn: numero(viejo.tempWarn, base.profile.tempWarn),
      tempCrit: numero(viejo.tempCrit, base.profile.tempCrit),
    }
  }
  const active = numero(parsed.activeIndex, 0)
  base.activeIndex = active >= 0 && active < EQUIPO_MAX ? active : 0
  return base
}

export function loadEquipo(): EquipoStore {
  if (typeof window === 'undefined') return vacio()
  try {
    const raw = window.localStorage.getItem(EQUIPO_KEY)
    if (!raw) return vacio()
    return normalizar(JSON.parse(raw))
  } catch {
    return vacio()
  }
}

export function saveEquipo(store: EquipoStore) {
  window.localStorage.setItem(EQUIPO_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(EQUIPO_EVENT))
  return store
}

export function activeEquipo(store: EquipoStore) {
  return { amps: store.profile.amps }
}

export function aplicarFicha(profile: EquipoProfile, ficha: MotorFicha): EquipoProfile {
  const limitFab = ficha.verified ? 100 : 92
  let limitCfg = profile.limitCfg
  if (limitCfg > limitFab) limitCfg = limitFab
  if (limitCfg === 0) limitCfg = limitFab > 10 ? limitFab - 10 : limitFab
  let limitRec = profile.limitRec
  if (limitRec > limitCfg) limitRec = limitCfg
  return {
    ...profile,
    brand: ficha.brand,
    model: ficha.model,
    code: ficha.code,
    watts: ficha.watts,
    volts: ficha.volts,
    hz: ficha.hz,
    rpm: ficha.rpm,
    amps: ficha.amps,
    verified: ficha.verified,
    specsFound: true,
    limitFab,
    limitCfg,
    limitRec,
    tempWarn: ficha.tempMax > 10 ? ficha.tempMax - 10 : ficha.tempMax,
    tempCrit: ficha.tempMax,
  }
}

export function buscarYAplicar(profile: EquipoProfile): { profile: EquipoProfile; aviso: string } | null {
  const ficha = buscarFicha(profile.model)
  if (!ficha) return null
  const next = aplicarFicha(profile, ficha)
  return { profile: next, aviso: next.verified ? 'Ficha de base' : 'Base local conservadora' }
}

export function pasoLimite(profile: EquipoProfile, dir: number): EquipoProfile {
  let next = profile.limitCfg + dir
  if (next < 0) next = 0
  if (next > profile.limitFab) next = profile.limitFab
  let rec = profile.limitRec
  if (rec > next) rec = next
  return { ...profile, limitCfg: next, limitRec: rec }
}

export function sincronizarRanura(store: EquipoStore): EquipoStore {
  const index = store.activeIndex
  const slot = store.slots[index]
  if (!slot?.used) return store
  const profile = store.profile
  const slots = store.slots.map((item, i) =>
    i === index
      ? {
          ...item,
          brand: profile.brand,
          model: profile.model,
          code: profile.code,
          watts: profile.watts,
          volts: profile.volts,
          hz: profile.hz,
          rpm: profile.rpm,
          amps: profile.amps,
          limitCfg: profile.limitCfg,
          limitRec: profile.limitRec,
        }
      : item,
  )
  return { ...store, slots }
}

export function cargarRanura(store: EquipoStore, index: number): EquipoStore | null {
  const slot = store.slots[index]
  if (!slot?.used) return null
  const slots = store.slots.map((item, i) => ({ ...item, used: item.used }))
  return {
    ...store,
    activeIndex: index,
    slots,
    profile: {
      brand: slot.brand,
      model: slot.model,
      code: slot.code,
      watts: slot.watts,
      volts: slot.volts,
      hz: slot.hz,
      rpm: slot.rpm,
      amps: slot.amps,
      limitCfg: slot.limitCfg,
      limitRec: slot.limitRec,
      limitFab: 100,
      tempWarn: 65,
      tempCrit: 80,
      specsFound: true,
      verified: true,
    },
  }
}

export function nuevaRanura(store: EquipoStore): { store: EquipoStore; aviso: string } | null {
  const index = store.slots.findIndex((slot) => !slot.used)
  if (index < 0) return null
  const slots = store.slots.map((slot, i) =>
    i === index
      ? {
          ...slot,
          used: true,
          id: `P${String(index + 1).padStart(3, '0')}`,
          name: 'Equipo nuevo',
          brand: '-',
          model: '-',
          code: '-',
          watts: 0,
          volts: 0,
          hz: 60,
          rpm: 0,
          amps: 0,
          limitCfg: 70,
          limitRec: 60,
          hoursBase: 0,
        }
      : slot,
  )
  const next = cargarRanura({ ...store, slots }, index)
  return next ? { store: next, aviso: 'Equipo anadido' } : null
}
