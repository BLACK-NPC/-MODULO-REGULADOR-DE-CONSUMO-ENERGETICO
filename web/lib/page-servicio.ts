export const SERVICIO_KEY = 'ecopulse-servicio'
export const SERVICIO_EVENT = 'ecopulse-servicio'

export const SERVICIO_TYPES = ['Preventivo', 'Correctivo', 'Predictivo', 'Inspeccion'] as const
export type ServicioType = (typeof SERVICIO_TYPES)[number]

export type ServicioTask = {
  id: string
  name: string
  type: ServicioType
  intervalDays: number
  reminderDays: number
  createdAt: string
  lastDone: string | null
}

export type ServicioLog = {
  id: string
  taskName: string
  person: string
  at: string
}

type Store = { tasks: ServicioTask[]; logs: ServicioLog[] }

function emptyStore(): Store {
  return { tasks: [], logs: [] }
}

export function loadServicio(): Store {
  if (typeof window === 'undefined') {
    return emptyStore()
  }
  try {
    const raw = window.localStorage.getItem(SERVICIO_KEY)
    if (!raw) {
      return emptyStore()
    }
    const parsed = JSON.parse(raw) as Store
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    }
  } catch {
    return emptyStore()
  }
}

export function saveServicio(store: Store) {
  window.localStorage.setItem(SERVICIO_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(SERVICIO_EVENT))
  return store
}

function dayStart(value: string | Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function nextDue(task: ServicioTask) {
  const base = dayStart(task.lastDone ?? task.createdAt)
  base.setDate(base.getDate() + task.intervalDays)
  return base
}

export function isOverdue(task: ServicioTask, now = new Date()) {
  return dayStart(now).getTime() > nextDue(task).getTime()
}

export function splitTasks(tasks: ServicioTask[], now = new Date()) {
  const pendientes: ServicioTask[] = []
  const vencidas: ServicioTask[] = []
  tasks.forEach((task) => {
    if (isOverdue(task, now)) {
      vencidas.push(task)
    } else {
      pendientes.push(task)
    }
  })
  return { pendientes, vencidas }
}

function weekStart(date: Date) {
  const start = dayStart(date)
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)
  return start
}

export function logsInWeek(logs: ServicioLog[], which: 'actual' | 'pasada', now = new Date()) {
  const start = weekStart(now)
  if (which === 'pasada') {
    start.setDate(start.getDate() - 7)
  }
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return logs.filter((entry) => {
    const at = new Date(entry.at).getTime()
    return at >= start.getTime() && at < end.getTime()
  })
}

export function cumplimiento(store: Store, now = new Date()) {
  const hechas = logsInWeek(store.logs, 'actual', now).length
  const vencidas = splitTasks(store.tasks, now).vencidas.length
  const total = hechas + vencidas
  const actual = total === 0 ? 0 : Math.round((hechas * 100) / total)
  const pasadas = logsInWeek(store.logs, 'pasada', now).length
  return { hechas, vencidas, actual, pasadas }
}
