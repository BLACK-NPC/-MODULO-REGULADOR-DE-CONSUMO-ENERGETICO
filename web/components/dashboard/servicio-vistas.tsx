'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  SERVICIO_EVENT,
  SERVICIO_TYPES,
  cumplimiento,
  loadServicio,
  nextDue,
  saveServicio,
  splitTasks,
  type ServicioTask,
  type ServicioType,
} from '@/lib/page-servicio'
import type { VerificacionItem } from '@/lib/verificacion-falla'

type Vista = 'pendientes' | 'vencidas' | 'mantenimiento' | 'diagnostico' | 'cumplimiento' | 'resumen' | 'verificacion'

const titles: Record<Vista, string> = {
  pendientes: 'PENDIENTES',
  vencidas: 'VENCIDAS',
  mantenimiento: 'MANTENIMIENTO',
  diagnostico: 'DIAGNOSTICO',
  cumplimiento: 'CUMPLIMIENTO',
  resumen: 'RESUMEN SEMANAL',
  verificacion: 'VERIFICACION TRAS FALLA',
}

const veredictoTexto = {
  verificado: 'Verificado',
  revisar: 'Revisar',
  sin_dato: 'No se puede verificar',
} as const

export function ServicioVistas({
  vista,
  onBack,
  fallas,
  sensores,
  operacion,
  verificacion = [],
}: {
  vista: Vista
  onBack: () => void
  fallas: number
  sensores: { nombre: string; activo: boolean }[]
  verificacion?: VerificacionItem[]
  operacion: {
    estado: string
    modo: string
    setpoint: number
    presencia: boolean
    consumo: number
    consumoDia: number | null
    tipos: string[]
  }
}) {
  const [store, setStore] = useState(loadServicio)
  const [name, setName] = useState('')
  const [type, setType] = useState<ServicioType>('Preventivo')
  const [intervalDays, setIntervalDays] = useState(30)
  const [person, setPerson] = useState('')
  const [closingId, setClosingId] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    const sync = () => setStore(loadServicio())
    window.addEventListener(SERVICIO_EVENT, sync)
    return () => window.removeEventListener(SERVICIO_EVENT, sync)
  }, [])

  function commit(next: typeof store) {
    setStore(saveServicio(next))
  }

  function addTask() {
    const trimmed = name.trim().slice(0, 22)
    if (!trimmed) {
      setAviso('Escribe el nombre de la tarea.')
      return
    }
    const dias = Number.isFinite(intervalDays) && intervalDays >= 1 ? Math.round(intervalDays) : 30
    const task: ServicioTask = {
      id: `t_${Date.now()}`,
      name: trimmed,
      type,
      intervalDays: dias,
      reminderDays: 3,
      createdAt: new Date().toISOString(),
      lastDone: null,
    }
    setStore((current) => saveServicio({ ...current, tasks: [...current.tasks, task] }))
    setName('')
    setAviso('Tarea añadida. Queda en esta lista y en Pendientes.')
  }

  function closeTask(task: ServicioTask) {
    const who = person.trim().slice(0, 20)
    if (!who) {
      return
    }
    const now = new Date().toISOString()
    commit({
      tasks: store.tasks.map((item) => (item.id === task.id ? { ...item, lastDone: now } : item)),
      logs: [{ id: `l_${Date.now()}`, taskName: task.name, person: who, at: now }, ...store.logs].slice(0, 24),
    })
    setPerson('')
    setClosingId(null)
  }

  const { pendientes, vencidas } = splitTasks(store.tasks)
  const stats = cumplimiento(store)
  const shown = vista === 'vencidas' ? vencidas : vista === 'pendientes' ? pendientes : store.tasks

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Servicio
      </button>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">{titles[vista]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {vista === 'verificacion' ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Usa la lectura actual. Si un dato no llega, no se inventa la causa.
              </p>
              {verificacion.map((punto) => (
                <div key={punto.id} className="rounded-md border border-border px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{punto.funcion}</p>
                    <p className={`text-[11px] font-bold shrink-0 ${punto.veredicto === 'verificado' ? 'text-green-400' : punto.veredicto === 'revisar' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {veredictoTexto[punto.veredicto]}
                    </p>
                  </div>
                  <p className="text-xs text-foreground">{punto.motivo}</p>
                  <p className="text-xs text-muted-foreground">Revisar: {punto.revisar}</p>
                  <p className="text-xs text-muted-foreground">Si falla: {punto.desencadena}</p>
                </div>
              ))}
            </div>
          ) : null}

          {vista === 'diagnostico' ? (
            <>
              <p className="text-sm font-medium text-foreground">Fallas activas: {fallas}</p>
              {sensores.map((sensor) => (
                <div key={sensor.nombre} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <p className="text-sm text-foreground">{sensor.nombre}</p>
                  <p className={`text-xs font-bold ${sensor.activo ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {sensor.activo ? 'ACTIVO' : 'INACTIVO'}
                  </p>
                </div>
              ))}
            </>
          ) : null}

          {vista === 'cumplimiento' ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Esta semana" value={`${stats.actual} %`} detail={`${stats.hechas} hechas`} />
              <Stat label="Vencidas" value={String(stats.vencidas)} detail="ahora" />
            </div>
          ) : null}

          {vista === 'resumen' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Fallas" value={String(Math.max(fallas, operacion.tipos.length))} detail="activas ahora" />
                <Stat label="Consumo" value={`${operacion.consumo} %`} detail={operacion.consumoDia === null ? 'lectura actual' : `dia ${operacion.consumoDia} %`} />
              </div>
              <div className="rounded-md border border-border px-3 py-2 space-y-1">
                <p className="text-[11px] font-bold text-muted-foreground">TIPO DE FALLAS</p>
                {operacion.tipos.length === 0 ? (
                  <p className="text-sm text-foreground">Ninguna falla activa.</p>
                ) : (
                  operacion.tipos.map((tipo) => (
                    <p key={tipo} className="text-sm text-foreground">{tipo}</p>
                  ))
                )}
              </div>
              <div className="rounded-md border border-border px-3 py-2 space-y-1">
                <p className="text-[11px] font-bold text-muted-foreground">QUE ESTA OPERANDO</p>
                <p className="text-sm text-foreground">Motor {operacion.estado === 'running' ? 'encendido' : 'apagado'} · {operacion.modo}</p>
                <p className="text-sm text-foreground">Setpoint {operacion.setpoint} C · presencia {operacion.presencia ? 'SI' : 'NO'}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {operacion.tipos.length === 0
                  ? `Diagnostico: operacion normal. Consumo actual ${operacion.consumo} %.`
                  : `Diagnostico: ${operacion.tipos.length} falla(s) mientras el motor esta ${operacion.estado === 'running' ? 'encendido' : 'apagado'} y el consumo es ${operacion.consumo} %.`}
              </p>
            </>
          ) : null}

          {vista === 'mantenimiento' ? (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">NUEVA TAREA</p>
              <input
                value={name}
                maxLength={22}
                onChange={(e) => {
                  setName(e.target.value)
                  setAviso('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTask()
                  }
                }}
                placeholder="Nombre"
                className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
              />
              <div className="grid grid-cols-2 gap-1">
                {SERVICIO_TYPES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setType(item)}
                    className={`h-8 rounded-md border text-xs ${type === item ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-muted-foreground">
                Intervalo (dias)
                <input
                  type="number"
                  min={1}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={addTask}
                className="w-full h-10 rounded-md bg-foreground text-sm font-medium text-background"
              >
                Anadir tarea
              </button>
              {aviso ? <p className="text-xs text-muted-foreground">{aviso}</p> : null}
            </div>
          ) : null}

          {vista === 'pendientes' || vista === 'vencidas' || vista === 'mantenimiento' ? (
            <>
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay tareas en esta lista.</p>
              ) : (
                shown.map((task) => (
                  <div key={task.id} className="rounded-md border border-border px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{task.name}</p>
                      <p className="text-[11px] font-bold text-muted-foreground">{task.type}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cada {task.intervalDays} dias · vence {nextDue(task).toLocaleDateString()}
                    </p>
                    {closingId === task.id ? (
                      <div className="flex gap-2">
                        <input
                          value={person}
                          onChange={(e) => setPerson(e.target.value)}
                          placeholder="Quien la cierra"
                          className="min-w-0 flex-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground"
                        />
                        <button type="button" onClick={() => closeTask(task)} className="rounded-md bg-foreground px-3 text-xs font-medium text-background">
                          Cerrar
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setClosingId(task.id)} className="h-8 px-3 rounded-md border border-border text-xs font-medium text-foreground">
                        Marcar hecha
                      </button>
                    )}
                  </div>
                ))
              )}
            </>
          ) : null}

          {vista === 'mantenimiento' ? (
            <div className="space-y-1">
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">BITACORA</p>
              {store.logs.length === 0 ? <p className="text-xs text-muted-foreground">Sin cierres todavia.</p> : null}
              {store.logs.slice(0, 8).map((entry) => (
                <p key={entry.id} className="text-xs text-muted-foreground">
                  {entry.taskName} · {entry.person} · {new Date(entry.at).toLocaleString()}
                </p>
              ))}
            </div>
          ) : null}

        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="text-lg font-medium text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
