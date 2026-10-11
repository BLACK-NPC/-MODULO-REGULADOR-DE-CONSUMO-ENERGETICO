'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  EQUIPO_MAX,
  buscarYAplicar,
  cargarRanura,
  loadEquipo,
  nuevaRanura,
  pasoLimite,
  saveEquipo,
  sincronizarRanura,
  EQUIPO_EVENT,
  type EquipoStore,
} from '@/lib/page-equipo'

type Vista = 'perfil' | 'limites' | 'calibracion' | 'lista'

const NAV: { id: Vista; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'limites', label: 'Limites' },
  { id: 'calibracion', label: 'Calibr.' },
  { id: 'lista', label: 'Lista' },
]

export function EquipoVistas({
  vista,
  onBack,
  onVista,
  lecturas,
}: {
  vista: Vista
  onBack: () => void
  onVista: (vista: Vista) => void
  lecturas: { temp: number; pot: number; velocidad: number; hayTemp: boolean }
}) {
  const [store, setStore] = useState(loadEquipo)
  const [aviso, setAviso] = useState('')
  const [calPct, setCalPct] = useState(20)
  const [calCorre, setCalCorre] = useState(false)
  const [calEstado, setCalEstado] = useState('Detenida - toca Iniciar')
  const calPctRef = useRef(20)
  const lecturasRef = useRef(lecturas)
  lecturasRef.current = lecturas

  useEffect(() => {
    const sync = () => setStore(loadEquipo())
    window.addEventListener(EQUIPO_EVENT, sync)
    return () => window.removeEventListener(EQUIPO_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!calCorre) return
    const timer = window.setInterval(() => {
      setStore((actual) => {
        const fab = actual.profile.limitFab > 0 ? actual.profile.limitFab : 100
        const lectura = lecturasRef.current
        const siguiente = calPctRef.current + 10
        if (lectura.hayTemp && lectura.temp >= actual.profile.tempCrit) {
          setCalCorre(false)
          setCalEstado('Cortada: temperatura critica')
          setAviso('Corte por temperatura')
          return actual
        }
        if (siguiente > fab) {
          setCalCorre(false)
          setCalEstado('Completada - limite aprendido')
          let rec = actual.profile.limitRec
          if (rec < actual.profile.limitCfg) {
            rec = actual.profile.limitCfg > 15 ? actual.profile.limitCfg - 15 : actual.profile.limitCfg
          }
          const next = sincronizarRanura({ ...actual, profile: { ...actual.profile, limitRec: rec } })
          return saveEquipo(next)
        }
        let rec = actual.profile.limitRec
        if (siguiente <= rec + 10 && siguiente <= actual.profile.limitCfg && siguiente > rec) {
          rec = siguiente
        }
        calPctRef.current = siguiente
        setCalPct(siguiente)
        const next = sincronizarRanura({ ...actual, profile: { ...actual.profile, limitRec: rec } })
        return saveEquipo(next)
      })
    }, 900)
    return () => window.clearInterval(timer)
  }, [calCorre])

  function commit(next: EquipoStore, mensaje = '') {
    setStore(saveEquipo(sincronizarRanura(next)))
    setAviso(mensaje)
  }

  const profile = store.profile
  const corriente = (lecturas.pot / 100) * profile.amps
  const rpmAhora = Math.round((lecturas.velocidad * profile.rpm) / 100)
  const estadoSpecs = profile.specsFound
    ? profile.verified
      ? 'encontrado en base local'
      : 'base local conservadora'
    : 'sin consultar'

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Equipo
      </button>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">
            {vista === 'perfil' ? 'PERFIL DEL EQUIPO' : vista === 'limites' ? 'LIMITES DE SEGURIDAD' : vista === 'calibracion' ? 'CALIBRACION DEL EQUIPO' : 'EQUIPOS INSTALADOS'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id !== 'calibracion') {
                    setCalCorre(false)
                    setCalEstado('Detenida - toca Iniciar')
                  }
                  onVista(item.id)
                }}
                className={cn(
                  'h-8 rounded-md border text-xs font-medium',
                  vista === item.id ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {vista === 'perfil' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">MODELO DEL EQUIPO</p>
                  <input
                    value={profile.model}
                    onChange={(event) => commit({ ...store, profile: { ...profile, model: event.target.value.slice(0, 24) } })}
                    placeholder="Escribe el modelo"
                    className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const hallado = buscarYAplicar(profile)
                      if (!hallado) {
                        commit({ ...store, profile: { ...profile, specsFound: false } }, 'No esta en la base local')
                        return
                      }
                      commit({ ...store, profile: hallado.profile }, hallado.aviso)
                    }}
                    className="w-full h-8 rounded-md bg-foreground text-xs font-medium text-background"
                  >
                    Buscar specs
                  </button>
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">ESPECIFICACIONES</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Spec texto={`${profile.watts} W`} pie="potencia" />
                    <Spec texto={`${profile.volts}V/${profile.hz}Hz`} pie="aliment." />
                    <Spec texto={`${profile.amps.toFixed(1)} A`} pie="corriente" />
                    <Spec texto={`${profile.rpm} rpm`} pie="rpm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{estadoSpecs}</p>
                </div>
              </div>
              <button type="button" onClick={() => onVista('limites')} className="w-full rounded-md border border-border px-3 py-3 text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">LIMITE</span>
                  <span className="text-sm font-medium text-foreground">{profile.limitCfg}%</span>
                </div>
                <Barra rec={profile.limitRec} cfg={profile.limitCfg} fab={profile.limitFab} />
              </button>
            </>
          ) : null}

          {vista === 'limites' ? (
            <>
              <Barra rec={profile.limitRec} cfg={profile.limitCfg} fab={profile.limitFab} />
              <div className="grid grid-cols-3 gap-2">
                <Cifra label="RECOM." valor={`${profile.limitRec}%`} />
                <Cifra label="CONFIG." valor={`${profile.limitCfg}%`} />
                <Cifra label="FABRIC." valor={`${profile.limitFab}%`} />
              </div>
              <p className="text-[11px] text-muted-foreground">velocidad maxima configurada (+ / -)</p>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => commit({ ...store, profile: pasoLimite(profile, -1) })} className="h-9 w-10 rounded-md border border-border text-lg">-</button>
                <p className="w-16 text-center text-lg font-medium text-foreground">{profile.limitCfg}%</p>
                <button type="button" onClick={() => commit({ ...store, profile: pasoLimite(profile, 1) })} className="h-9 w-10 rounded-md border border-border text-lg">+</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Fila label="Advertencia" valor={`${profile.tempWarn} C`} />
                <Fila label="Critica" valor={`${profile.tempCrit} C`} />
              </div>
              <p className="text-[11px] text-muted-foreground">El limite configurado nunca supera el del fabricante.</p>
              <button
                type="button"
                onClick={() => {
                  commit(store, 'Limite guardado')
                  onVista('perfil')
                }}
                className="w-full h-9 rounded-md bg-foreground text-sm font-medium text-background"
              >
                Guardar
              </button>
            </>
          ) : null}

          {vista === 'calibracion' ? (
            <>
              <p className="text-xs text-muted-foreground">{calEstado}</p>
              <div className="rounded-md bg-secondary/40 p-3 space-y-2">
                <p className="text-base font-medium text-foreground">{calPct}%</p>
                <p className="text-[11px] text-muted-foreground">velocidad de prueba</p>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className="h-full bg-foreground" style={{ width: `${Math.max(calPct, 1)}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      calPctRef.current = 20
                      setCalPct(20)
                      setCalCorre(true)
                      setCalEstado('calibrando...')
                      setAviso('Calibracion: motor en marcha')
                    }}
                    className="h-8 rounded-md bg-foreground text-xs font-medium text-background"
                  >
                    Iniciar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalCorre(false)
                      setCalEstado('Detenida - toca Iniciar')
                      commit(store)
                    }}
                    className="h-8 rounded-md border border-border text-xs font-medium text-foreground"
                  >
                    Detener
                  </button>
                </div>
              </div>
              <Fila label="Corriente" valor={`${corriente.toFixed(1)} A`} />
              <Fila label="Temp." valor={lecturas.hayTemp ? `${Math.round(lecturas.temp)} C` : '-- C'} />
              <Fila label="RPM" valor={String(rpmAhora)} />
            </>
          ) : null}

          {vista === 'lista' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {store.slots.map((slot, index) =>
                slot.used ? (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      const next = cargarRanura(store, index)
                      if (!next) return
                      setStore(saveEquipo(next))
                      setAviso('Perfil cargado')
                      onVista('perfil')
                    }}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left',
                      index === store.activeIndex ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground',
                    )}
                  >
                    <p className="text-[11px] opacity-70">{slot.id}</p>
                    <p className="text-sm font-medium">{slot.name}</p>
                    <p className="text-[11px] opacity-70">{slot.limitCfg}% · {slot.hoursBase} h</p>
                  </button>
                ) : (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      const creado = nuevaRanura(store)
                      if (!creado) {
                        setAviso(`Maximo ${EQUIPO_MAX} equipos`)
                        return
                      }
                      setStore(saveEquipo(creado.store))
                      setAviso(creado.aviso)
                      onVista('perfil')
                    }}
                    className="rounded-md border border-border px-3 py-6 text-sm text-muted-foreground"
                  >
                    + Vacante
                  </button>
                ),
              )}
            </div>
          ) : null}

          {aviso ? <p className="text-xs text-muted-foreground">{aviso}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Spec({ texto, pie }: { texto: string; pie: string }) {
  return (
    <div className="rounded-md border border-border px-2 py-1 text-center">
      <p className="text-sm text-foreground">{texto}</p>
      <p className="text-[10px] text-muted-foreground">{pie}</p>
    </div>
  )
}

function Barra({ rec, cfg, fab }: { rec: number; cfg: number; fab: number }) {
  const a = rec > 0 ? rec : 1
  const b = cfg > rec ? cfg - rec : 1
  const c = fab > cfg ? fab - cfg : 1
  const total = a + b + c
  return (
    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-border">
      <span style={{ width: `${(a / total) * 100}%` }} className="bg-zinc-300" />
      <span style={{ width: `${(b / total) * 100}%` }} className="bg-zinc-400" />
      <span style={{ width: `${(c / total) * 100}%` }} className="bg-zinc-500" />
    </div>
  )
}

function Cifra({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-md border border-border px-2 py-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-medium text-foreground">{valor}</p>
    </div>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{valor}</span>
    </div>
  )
}
