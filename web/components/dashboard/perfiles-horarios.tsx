'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  DAY_CHIPS,
  SMART_ON_CONFIG_MAX,
  activateProfile,
  createProfile,
  duplicateProfile,
  formatSchedule,
  loadSmartProfileStore,
  profileRows,
  saveSmartProfileStore,
  type SmartProfile,
  type SmartProfileStore,
} from '@/lib/smart-profiles'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function timeValue(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`
}

export function PerfilesHorarios({ onBack }: { onBack: () => void }) {
  const [store, setStore] = useState<SmartProfileStore>({ slots: [], activeIndex: 1 })
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [configsName, setConfigsName] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  useEffect(() => {
    setStore(loadSmartProfileStore())
  }, [])

  const slots = store.slots

  function commit(next: SmartProfile[], activeIndex = store.activeIndex) {
    setStore(saveSmartProfileStore({ slots: next, activeIndex }))
  }

  function flash(text: string) {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2200)
  }

  const editing = editIndex !== null ? slots[editIndex] : null

  function patchEdit(partial: Partial<SmartProfile>) {
    if (editIndex === null) {
      return
    }
    const next = slots.slice()
    next[editIndex] = { ...next[editIndex], ...partial }
    setStore({ ...store, slots: next })
  }

  if (editing && editIndex !== null) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            commit(slots)
            setEditIndex(null)
          }}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Perfiles y horarios
        </button>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">PERFIL: {editing.profileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm">
              <span className="text-muted-foreground">Nombre</span>
              <input
                value={editing.profileName}
                maxLength={15}
                onChange={(e) => patchEdit({ profileName: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-foreground"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Variante</span>
              <input
                value={editing.variantName}
                maxLength={15}
                onChange={(e) => patchEdit({ variantName: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-foreground"
              />
            </label>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">DIAS Y HORARIO</p>
              <div className="grid grid-cols-7 gap-1">
                {DAY_CHIPS.map((label, day) => {
                  const on = (editing.daysMask & (1 << day)) !== 0
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        let mask = editing.daysMask ^ (1 << day)
                        if (mask === 0) {
                          mask = 1 << day
                        }
                        patchEdit({ daysMask: mask })
                      }}
                      className={`h-8 rounded-md border text-xs font-bold ${on ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  desde
                  <input
                    type="time"
                    value={timeValue(editing.hourFrom, editing.minFrom)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      patchEdit({ hourFrom: h, minFrom: m })
                    }}
                    className="mt-1 w-full rounded-md bg-foreground px-2 py-2 text-background"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  hasta
                  <input
                    type="time"
                    value={timeValue(editing.hourTo, editing.minTo)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      patchEdit({ hourTo: h, minTo: m })
                    }}
                    className="mt-1 w-full rounded-md bg-foreground px-2 py-2 text-background"
                  />
                </label>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">VALORES PREDETERMINADOS</p>
              <Stepper
                label="temperatura objetivo"
                value={`${editing.setpointC} C`}
                onMinus={() => patchEdit({ setpointC: Math.max(18, editing.setpointC - 1) })}
                onPlus={() => patchEdit({ setpointC: Math.min(35, editing.setpointC + 1) })}
              />
              <div className="grid grid-cols-3 gap-2">
                {[24, 28, 32].map((temp) => (
                  <button
                    key={temp}
                    type="button"
                    onClick={() => patchEdit({ setpointC: temp })}
                    className={`h-8 rounded-md border text-xs font-medium ${editing.setpointC === temp ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'}`}
                  >
                    {temp} C
                  </button>
                ))}
              </div>
              <Stepper
                label="humedad maxima"
                value={`${editing.humidityMax} %`}
                onMinus={() => patchEdit({ humidityMax: Math.max(30, editing.humidityMax - 1) })}
                onPlus={() => patchEdit({ humidityMax: Math.min(90, editing.humidityMax + 1) })}
              />
              <div>
                <p className="text-xs text-muted-foreground mb-2">velocidad maxima</p>
                <div className="grid grid-cols-4 gap-1">
                  {[25, 50, 75, 100].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => patchEdit({ speedMax: speed })}
                      className={`h-8 rounded-md border text-xs font-medium ${editing.speedMax === speed ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'}`}
                    >
                      {speed}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <ToggleRow label="Forzar en horario" checked={editing.forceOnSchedule} onCheckedChange={(checked) => patchEdit({ forceOnSchedule: checked })} />
            <ToggleRow label="Modo silencioso" checked={editing.silentMode} onCheckedChange={(checked) => patchEdit({ silentMode: checked })} />
            <ToggleRow label="Presencia obligatoria" checked={editing.presenceRequired} onCheckedChange={(checked) => patchEdit({ presenceRequired: checked })} />
            <ToggleRow label="Ventilacion preventiva" checked={editing.preventiveVent} onCheckedChange={(checked) => patchEdit({ preventiveVent: checked })} />
            <button
              type="button"
              onClick={() => {
                setConfigsName(editing.profileName)
                setEditIndex(null)
              }}
              className="w-full h-10 rounded-md border border-foreground text-sm font-medium text-foreground"
            >
              Ver configuraciones
            </button>
            <button
              type="button"
              onClick={() => {
                commit(slots)
                flash('Guardado')
                setEditIndex(null)
              }}
              className="w-full h-10 rounded-md bg-foreground text-sm font-medium text-background"
            >
              Guardar perfil
            </button>
            {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (configsName) {
    const variants = slots
      .map((profile, index) => ({ profile, index }))
      .filter((item) => item.profile.used && item.profile.profileName === configsName)
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setConfigsName(null)} className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Perfiles y horarios
        </button>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">CONFIG: {configsName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {variants.map(({ profile, index }) => (
              <div key={index} className="rounded-md border border-border px-3 py-2 space-y-2">
                <p className="text-sm font-medium text-foreground">{profile.profileName}: {profile.variantName}</p>
                <p className="text-xs text-muted-foreground">{formatSchedule(profile)} - SP {profile.setpointC} C</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => commit(activateProfile(slots, index), index)}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium"
                  >
                    {profile.active ? 'En uso' : 'Usar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIndex(index)}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const created = duplicateProfile(slots, index)
                      if (!created) {
                        flash('Sin espacio')
                        return
                      }
                      commit(created.slots)
                      flash('Configuracion duplicada')
                    }}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (variants.length <= 1) {
                        flash('No se puede borrar la unica')
                        return
                      }
                      if (deleteIndex !== index) {
                        setDeleteIndex(index)
                        flash('Toca otra vez para eliminar')
                        return
                      }
                      const next = slots.slice()
                      next[index] = { ...next[index], used: false, active: false }
                      commit(next)
                      setDeleteIndex(null)
                      flash('Configuracion eliminada')
                    }}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  const rows = profileRows(slots)
  const activeCount = slots[store.activeIndex]?.used ? 1 : 0

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Automatizacion
      </button>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">PERFILES Y HORARIOS</CardTitle>
          <p className="text-xs text-muted-foreground">{rows.length} perfiles · {activeCount} activo</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map(({ index, profile }) => {
            const inUse = store.activeIndex === index
            return (
              <div key={profile.profileName} className={`rounded-lg border px-3 py-3 ${inUse ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'}`}>
                <p className="text-sm font-medium">{profile.profileName} - {profile.variantName}</p>
                <p className={`text-xs mt-1 ${inUse ? 'text-background/80' : 'text-muted-foreground'}`}>
                  {formatSchedule(profile)} - SP {profile.setpointC} C
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!inUse) {
                        commit(activateProfile(slots, index), index)
                      }
                    }}
                    className={`h-8 px-3 rounded-md text-xs font-medium ${inUse ? 'bg-background/20 text-background' : 'border border-border'}`}
                  >
                    {inUse ? 'En uso' : 'Usar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIndex(index)}
                    className={`h-8 px-3 rounded-md text-xs font-medium ${inUse ? 'bg-background/20 text-background' : 'border border-border'}`}
                  >
                    Editar
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => {
              if (slots.filter((item) => item.used).length >= SMART_ON_CONFIG_MAX) {
                flash('Sin espacio')
                return
              }
              const created = createProfile(slots)
              if (!created) {
                flash('Sin espacio')
                return
              }
              commit(created.slots, created.index)
              setEditIndex(created.index)
            }}
            className="w-full h-10 rounded-md bg-foreground text-sm font-medium text-background"
          >
            Nuevo perfil
          </button>
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string
  value: string
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onMinus} className="h-9 w-9 rounded-md border border-border text-lg">-</button>
        <p className="flex-1 text-center font-medium text-foreground">{value}</p>
        <button type="button" onClick={onPlus} className="h-9 w-9 rounded-md border border-border text-lg">+</button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 h-10">
      <p className="text-sm text-foreground">{label}</p>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="data-[state=checked]:bg-green-500" />
    </div>
  )
}
