'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  EQUIPO_EVENT,
  EQUIPO_MAX,
  activeEquipo,
  createEquipo,
  loadEquipo,
  saveEquipo,
  type EquipoSlot,
} from '@/lib/page-equipo'

type Vista = 'perfil' | 'limites' | 'calibracion' | 'lista'

export function EquipoVistas({
  vista,
  onBack,
  lecturas,
}: {
  vista: Vista
  onBack: () => void
  lecturas: { temp: number; hum: number; pot: number }
}) {
  const [store, setStore] = useState(loadEquipo)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const sync = () => setStore(loadEquipo())
    window.addEventListener(EQUIPO_EVENT, sync)
    return () => window.removeEventListener(EQUIPO_EVENT, sync)
  }, [])

  const current = activeEquipo(store)

  function update(partial: Partial<EquipoSlot>) {
    if (!current) {
      return
    }
    const slots = store.slots.map((slot) => (slot.id === current.id ? { ...slot, ...partial } : slot))
    setStore(saveEquipo({ ...store, slots }))
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Equipo
      </button>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">
            {vista === 'perfil' ? 'Perfil' : vista === 'limites' ? 'Limites' : vista === 'calibracion' ? 'Calibracion' : 'Lista'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!current && vista !== 'lista' ? (
            <p className="text-sm text-muted-foreground">Crea un equipo en Lista para editarlo.</p>
          ) : null}

          {vista === 'perfil' && current ? (
            <>
              <Field label="Modelo" value={current.model} onChange={(model) => update({ model: model.slice(0, 16) })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Potencia W" value={current.watts} onChange={(watts) => update({ watts })} />
                <NumberField label="Voltios" value={current.volts} onChange={(volts) => update({ volts })} />
                <NumberField label="Hz" value={current.hz} onChange={(hz) => update({ hz })} />
                <NumberField label="Amperios" value={current.amps} onChange={(amps) => update({ amps })} />
                <NumberField label="rpm" value={current.rpm} onChange={(rpm) => update({ rpm })} />
              </div>
            </>
          ) : null}

          {vista === 'limites' && current ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Recomendado %" value={current.limitRec} onChange={(limitRec) => update({ limitRec })} />
              <NumberField label="Configurado %" value={current.limitCfg} onChange={(limitCfg) => update({ limitCfg })} />
              <NumberField label="Fabrica %" value={current.limitFab} onChange={(limitFab) => update({ limitFab })} />
              <NumberField label="Advertencia C" value={current.tempWarn} onChange={(tempWarn) => update({ tempWarn })} />
              <NumberField label="Critica C" value={current.tempCrit} onChange={(tempCrit) => update({ tempCrit })} />
            </div>
          ) : null}

          {vista === 'calibracion' && current ? (
            <>
              <p className="text-sm text-muted-foreground">{running ? 'En curso' : 'Detenida'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRunning(true)} className="h-9 flex-1 rounded-md bg-foreground text-sm font-medium text-background">
                  Iniciar
                </button>
                <button type="button" onClick={() => setRunning(false)} className="h-9 flex-1 rounded-md border border-border text-sm font-medium text-foreground">
                  Detener
                </button>
              </div>
              {running ? (
                <div className="grid grid-cols-3 gap-2">
                  <Read label="Temp." value={`${lecturas.temp} C`} />
                  <Read label="Humedad" value={`${lecturas.hum} %`} />
                  <Read label="Potencia" value={`${lecturas.pot} W`} />
                </div>
              ) : null}
            </>
          ) : null}

          {vista === 'lista' ? (
            <>
              {store.slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setStore(saveEquipo({ ...store, activeId: slot.id }))}
                  className={`w-full text-left rounded-md border px-3 py-2 ${slot.id === store.activeId ? 'border-foreground bg-secondary/40' : 'border-border'}`}
                >
                  <p className="text-sm font-medium text-foreground">{slot.model || 'Sin modelo'}</p>
                  <p className="text-xs text-muted-foreground">{slot.watts} W · {slot.volts} V</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = createEquipo(store)
                  if (!next) {
                    setNotice(`Maximo ${EQUIPO_MAX} equipos`)
                    return
                  }
                  setStore(saveEquipo(next))
                  setNotice('')
                }}
                className="w-full h-9 rounded-md bg-foreground text-sm font-medium text-background"
              >
                Nuevo equipo
              </button>
              {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground" />
    </label>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
      />
    </label>
  )
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
