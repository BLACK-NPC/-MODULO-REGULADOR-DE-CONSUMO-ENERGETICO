export const SMART_PROFILES_KEY = 'ecopulse-perfiles'
export const SMART_PROFILES_EVENT = 'ecopulse-perfiles'
export const SMART_ON_CONFIG_MAX = 12
export const SMART_ON_DAYS_LV = 0x1f
export const SMART_ON_DAYS_SD = 0x60

export type SmartProfile = {
  used: boolean
  profileName: string
  variantName: string
  daysMask: number
  hourFrom: number
  minFrom: number
  hourTo: number
  minTo: number
  setpointC: number
  humidityMax: number
  speedMax: number
  presenceRequired: boolean
  silentMode: boolean
  preventiveVent: boolean
  forceOnSchedule: boolean
  active: boolean
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function seed(): SmartProfile[] {
  const row = (
    profileName: string,
    variantName: string,
    daysMask: number,
    hourFrom: number,
    hourTo: number,
    minTo: number,
    setpointC: number,
    humidityMax: number,
    speedMax: number,
    presenceRequired: boolean,
    silentMode: boolean,
    preventiveVent: boolean,
    active: boolean,
  ): SmartProfile => ({
    used: true,
    profileName,
    variantName,
    daysMask,
    hourFrom,
    minFrom: 0,
    hourTo,
    minTo,
    setpointC,
    humidityMax,
    speedMax,
    presenceRequired,
    silentMode,
    preventiveVent,
    forceOnSchedule: false,
    active,
  })
  const slots: SmartProfile[] = [
    row('Oficina', 'estandar', SMART_ON_DAYS_LV, 7, 17, 0, 26, 65, 80, true, false, false, true),
    row('Hogar', 'estandar', SMART_ON_DAYS_LV, 17, 22, 0, 28, 70, 100, true, false, true, true),
    row('Hogar', 'invierno', SMART_ON_DAYS_LV, 16, 21, 0, 26, 65, 90, true, false, true, false),
    row('Hogar', 'finde', SMART_ON_DAYS_SD, 0, 23, 59, 27, 70, 90, true, false, true, false),
    row('Dormir', 'estandar', SMART_ON_DAYS_LV, 22, 7, 0, 25, 60, 40, false, true, false, true),
    row('Casa', 'estandar', 1 << 5, 0, 23, 59, 27, 70, 90, true, false, true, true),
    row('Vacaciones', 'estandar', 1 << 6, 0, 23, 59, 29, 75, 60, true, false, false, true),
  ]
  while (slots.length < SMART_ON_CONFIG_MAX) {
    slots.push(emptySlot())
  }
  return slots
}

function emptySlot(): SmartProfile {
  return {
    used: false,
    profileName: '',
    variantName: '',
    daysMask: SMART_ON_DAYS_LV,
    hourFrom: 7,
    minFrom: 0,
    hourTo: 18,
    minTo: 0,
    setpointC: 26,
    humidityMax: 65,
    speedMax: 80,
    presenceRequired: true,
    silentMode: false,
    preventiveVent: false,
    forceOnSchedule: false,
    active: false,
  }
}

function clampProfile(raw: Partial<SmartProfile>): SmartProfile {
  const base = emptySlot()
  return {
    ...base,
    ...raw,
    used: Boolean(raw.used),
    profileName: String(raw.profileName ?? '').slice(0, 15),
    variantName: String(raw.variantName ?? '').slice(0, 15),
    daysMask: Number(raw.daysMask ?? base.daysMask) & 0x7f,
    hourFrom: Math.min(23, Math.max(0, Number(raw.hourFrom ?? 7))),
    minFrom: Math.min(59, Math.max(0, Number(raw.minFrom ?? 0))),
    hourTo: Math.min(23, Math.max(0, Number(raw.hourTo ?? 18))),
    minTo: Math.min(59, Math.max(0, Number(raw.minTo ?? 0))),
    setpointC: Math.min(35, Math.max(18, Number(raw.setpointC ?? 26))),
    humidityMax: Math.min(90, Math.max(30, Number(raw.humidityMax ?? 65))),
    speedMax: [25, 50, 75, 100].includes(Number(raw.speedMax)) ? Number(raw.speedMax) : 80,
    presenceRequired: raw.presenceRequired !== false,
    silentMode: Boolean(raw.silentMode),
    preventiveVent: Boolean(raw.preventiveVent),
    forceOnSchedule: Boolean(raw.forceOnSchedule),
    active: Boolean(raw.active),
  }
}

export type SmartProfileStore = {
  slots: SmartProfile[]
  activeIndex: number
}

function normalizeStore(slots: SmartProfile[], activeIndex: number): SmartProfileStore {
  const next = slots.slice(0, SMART_ON_CONFIG_MAX).map((item) => clampProfile(item))
  while (next.length < SMART_ON_CONFIG_MAX) {
    next.push(emptySlot())
  }
  const index = next[activeIndex]?.used ? activeIndex : next.findIndex((item) => item.used)
  return { slots: next, activeIndex: index < 0 ? 0 : index }
}

export function loadSmartProfileStore(): SmartProfileStore {
  const fallback = normalizeStore(seed(), 1)
  if (typeof window === 'undefined') {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(SMART_PROFILES_KEY)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as { slots?: Partial<SmartProfile>[]; activeIndex?: number } | Partial<SmartProfile>[]
    const list = Array.isArray(parsed) ? parsed : parsed.slots
    const activeIndex = Array.isArray(parsed) ? 1 : Number(parsed.activeIndex ?? 1)
    if (!Array.isArray(list) || list.length === 0) {
      return fallback
    }
    return normalizeStore(list.map((item) => clampProfile(item)), activeIndex)
  } catch {
    return fallback
  }
}

export function saveSmartProfileStore(store: SmartProfileStore) {
  const next = normalizeStore(store.slots, store.activeIndex)
  window.localStorage.setItem(SMART_PROFILES_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(SMART_PROFILES_EVENT))
  return next
}

export function formatSchedule(profile: SmartProfile): string {
  let days = '--'
  if (profile.daysMask === SMART_ON_DAYS_LV) {
    days = 'L-V'
  } else if (profile.daysMask === 0x7f) {
    days = 'L-D'
  } else if (profile.daysMask === SMART_ON_DAYS_SD) {
    days = 'S-D'
  } else {
    const parts: string[] = []
    for (let d = 0; d < 7; d += 1) {
      if ((profile.daysMask & (1 << d)) !== 0) {
        parts.push(DAY_LABELS[d])
      }
    }
    days = parts.length > 0 ? parts.join('-') : '--'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${days} - ${pad(profile.hourFrom)}:${pad(profile.minFrom)}-${pad(profile.hourTo)}:${pad(profile.minTo)}`
}

export function profileRows(slots: SmartProfile[]) {
  const seen = new Set<string>()
  const rows: { index: number; profile: SmartProfile }[] = []
  slots.forEach((profile, index) => {
    if (!profile.used || seen.has(profile.profileName)) {
      return
    }
    seen.add(profile.profileName)
    const activeIndex = slots.findIndex((item) => item.used && item.profileName === profile.profileName && item.active)
    const showIndex = activeIndex >= 0 ? activeIndex : index
    rows.push({ index: showIndex, profile: slots[showIndex] })
  })
  return rows
}

export function activeProfile(slots: SmartProfile[]): SmartProfile | null {
  const rows = profileRows(slots)
  const current = rows.find((row) => slots.some((item, index) => item.used && item.profileName === row.profile.profileName && item.active && index === row.index))
  return current?.profile ?? rows[0]?.profile ?? null
}

export function activateProfile(slots: SmartProfile[], index: number): SmartProfile[] {
  const name = slots[index]?.profileName
  if (!name) {
    return slots
  }
  return slots.map((item, i) => {
    if (!item.used || item.profileName !== name) {
      return item
    }
    return { ...item, active: i === index }
  })
}

export function currentProfile(store: SmartProfileStore): SmartProfile | null {
  const profile = store.slots[store.activeIndex]
  return profile?.used ? profile : null
}

export function createProfile(slots: SmartProfile[]): { slots: SmartProfile[]; index: number } | null {
  const index = slots.findIndex((item) => !item.used)
  if (index < 0) {
    return null
  }
  let name = ''
  for (let n = 1; n < 40; n += 1) {
    const candidate = n === 1 ? 'Perfil' : `Perfil${n}`
    if (!slots.some((item) => item.used && item.profileName === candidate)) {
      name = candidate
      break
    }
  }
  if (!name) {
    return null
  }
  const next = slots.slice()
  next[index] = {
    ...emptySlot(),
    used: true,
    profileName: name,
    variantName: 'estandar',
    active: true,
  }
  return { slots: next, index }
}

export function duplicateProfile(slots: SmartProfile[], index: number): { slots: SmartProfile[]; index: number } | null {
  const src = slots[index]
  if (!src?.used) {
    return null
  }
  const dst = slots.findIndex((item) => !item.used)
  if (dst < 0) {
    return null
  }
  let variant = `${src.variantName}2`.slice(0, 15)
  let n = 2
  while (slots.some((item) => item.used && item.profileName === src.profileName && item.variantName === variant)) {
    n += 1
    variant = `${src.variantName}${n}`.slice(0, 15)
  }
  const next = slots.slice()
  next[dst] = { ...src, variantName: variant, active: false }
  return { slots: next, index: dst }
}

export const DAY_CHIPS = DAY_LABELS
