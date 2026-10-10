export const EQUIPO_KEY = 'ecopulse-equipo'
export const EQUIPO_EVENT = 'ecopulse-equipo'
export const EQUIPO_MAX = 4

export type EquipoSlot = {
  id: string
  model: string
  watts: number
  volts: number
  hz: number
  amps: number
  rpm: number
  limitRec: number
  limitCfg: number
  limitFab: number
  tempWarn: number
  tempCrit: number
}

type Store = { slots: EquipoSlot[]; activeId: string | null }

function blank(id: string): EquipoSlot {
  return {
    id,
    model: '',
    watts: 0,
    volts: 115,
    hz: 60,
    amps: 0,
    rpm: 0,
    limitRec: 75,
    limitCfg: 82,
    limitFab: 92,
    tempWarn: 50,
    tempCrit: 60,
  }
}

export function loadEquipo(): Store {
  if (typeof window === 'undefined') {
    return { slots: [], activeId: null }
  }
  try {
    const raw = window.localStorage.getItem(EQUIPO_KEY)
    if (!raw) {
      return { slots: [], activeId: null }
    }
    const parsed = JSON.parse(raw) as Store
    const slots = Array.isArray(parsed.slots) ? parsed.slots.slice(0, EQUIPO_MAX) : []
    return { slots, activeId: parsed.activeId ?? slots[0]?.id ?? null }
  } catch {
    return { slots: [], activeId: null }
  }
}

export function saveEquipo(store: Store) {
  const next = { slots: store.slots.slice(0, EQUIPO_MAX), activeId: store.activeId }
  window.localStorage.setItem(EQUIPO_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(EQUIPO_EVENT))
  return next
}

export function activeEquipo(store: Store) {
  return store.slots.find((slot) => slot.id === store.activeId) ?? store.slots[0] ?? null
}

export function createEquipo(store: Store): Store | null {
  if (store.slots.length >= EQUIPO_MAX) {
    return null
  }
  const slot = blank(`eq_${Date.now()}`)
  return { slots: [...store.slots, slot], activeId: slot.id }
}
