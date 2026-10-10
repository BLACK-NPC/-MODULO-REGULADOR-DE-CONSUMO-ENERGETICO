'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Droplets,
  Thermometer,
  Zap,
  Mic,
  Sun,
  Moon,
  Bell,
  FileText,
  Cpu,
  ArrowUp,
  ArrowDown,
  Lock,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Radar,
  Clock,
  Wrench,
  Activity,
  ClipboardList,
  BarChart3,
  Factory,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { FAB_HIDDEN_CHANGE_EVENT, isFabHidden, setFabHidden } from '@/lib/fab-storage'
import type { AVCData } from '@/hooks/use-avc-data'
import { PerfilesHorarios } from '@/components/dashboard/perfiles-horarios'
import { currentProfile, formatSchedule, loadSmartProfileStore, SMART_PROFILES_EVENT } from '@/lib/smart-profiles'
import type { HmiCommandResult } from '@/lib/hmi-command'

interface ConfiguracionesPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => Promise<HmiCommandResult>
}

const SP_PIN = '2011'

const sleepLabels = ['15s', '30s', '1m', '2m', '5m', '10m', 'Nunca']
const firebaseModes = ['Apagado', 'Solo leer', 'Solo enviar', 'Leer+enviar']
const alcanceLabels = ['Cerca', 'Media', 'Lejos']

function OptionRow({
  icon: Icon,
  color,
  bgColor,
  label,
  detail,
  children,
}: {
  icon: typeof Droplets
  color: string
  bgColor: string
  label: string
  detail?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-secondary/50 border border-border">
      <div className="flex items-center gap-4 min-w-0">
        <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{label}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function ChoiceRow({
  labels,
  value,
  onPick,
}: {
  labels: string[]
  value: number
  onPick: (index: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(index)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            index === value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function StatusText({ on }: { on: boolean }) {
  return (
    <span className={`text-[11px] font-bold tracking-wide ${on ? 'text-green-400' : 'text-muted-foreground'}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${on ? 'bg-green-400' : 'bg-muted-foreground'}`} />
      {on ? 'ACTIVO' : 'INACTIVO'}
    </span>
  )
}

function MedicionSwitch({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-green-500"
      />
      <StatusText on={checked && !disabled} />
    </div>
  )
}

export function ConfiguracionesPage({ data, onUpdate }: ConfiguracionesPageProps) {
  const [fabVisible, setFabVisible] = useState(true)
  const [medicionAbierta, setMedicionAbierta] = useState(false)
  const [autoAbierta, setAutoAbierta] = useState(false)
  const [autoVista, setAutoVista] = useState<'panel' | 'radar' | 'perfiles'>('panel')
  const [perfilActivo, setPerfilActivo] = useState<{ name: string; schedule: string } | null>(null)
  const [equipoAbierta, setEquipoAbierta] = useState(false)
  const [sistemaAbierta, setSistemaAbierta] = useState(false)
  const [equipoVista, setEquipoVista] = useState<'panel' | 'perfil' | 'limites' | 'calibracion' | 'lista'>('panel')
  const [servicioAbierta, setServicioAbierta] = useState(false)
  const [servicioVista, setServicioVista] = useState<
    'panel' | 'pendientes' | 'vencidas' | 'mantenimiento' | 'diagnostico' | 'cumplimiento' | 'resumen'
  >('panel')
  const [openGroups, setOpenGroups] = useState({ hum: true, temp: true, pow: true })
  const [spUnlocked, setSpUnlocked] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pendingDht, setPendingDht] = useState<11 | 22 | null>(null)
  const [brillo, setBrillo] = useState(data.sistema.brillo)
  const [beepMs, setBeepMs] = useState(data.sistema.beepMs)
  const [beepDuty, setBeepDuty] = useState(data.sistema.beepDuty)
  const [retencion, setRetencion] = useState(data.automatizacion.retencionMs)

  useEffect(() => setBrillo(data.sistema.brillo), [data.sistema.brillo])
  useEffect(() => setBeepMs(data.sistema.beepMs), [data.sistema.beepMs])
  useEffect(() => setBeepDuty(data.sistema.beepDuty), [data.sistema.beepDuty])
  useEffect(() => setRetencion(data.automatizacion.retencionMs), [data.automatizacion.retencionMs])
  useEffect(() => {
    function syncPerfil() {
      const profile = currentProfile(loadSmartProfileStore())
      setPerfilActivo(profile ? { name: `${profile.profileName} - ${profile.variantName}`, schedule: formatSchedule(profile) } : null)
    }
    syncPerfil()
    window.addEventListener(SMART_PROFILES_EVENT, syncPerfil)
    return () => window.removeEventListener(SMART_PROFILES_EVENT, syncPerfil)
  }, [])

  useEffect(() => {
    setFabVisible(!isFabHidden())
    function syncFabVisibility() {
      setFabVisible(!isFabHidden())
    }
    window.addEventListener('storage', syncFabVisibility)
    window.addEventListener(FAB_HIDDEN_CHANGE_EVENT, syncFabVisibility)
    return () => {
      window.removeEventListener('storage', syncFabVisibility)
      window.removeEventListener(FAB_HIDDEN_CHANGE_EVENT, syncFabVisibility)
    }
  }, [])

  function send(path: string, value: unknown) {
    void onUpdate(path, value)
  }

  function toggleGroup(key: 'hum' | 'temp' | 'pow') {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function requestSpChange(path: 'config/spMax' | 'config/spMin', next: number) {
    if (!spUnlocked) {
      setPinDraft('')
      setPinError(false)
      setPinOpen(true)
      return
    }
    const value = Math.min(100, Math.max(0, next))
    if (path === 'config/spMax' && value <= data.config.spMin) return
    if (path === 'config/spMin' && value >= data.config.spMax) return
    send(path, value)
  }

  function submitPin() {
    if (pinDraft === SP_PIN) {
      setSpUnlocked(true)
      setPinOpen(false)
      setPinError(false)
      setPinDraft('')
      return
    }
    setPinError(true)
    setPinDraft('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configuraciones</h2>
        <p className="text-muted-foreground">Medicion, control y configuracion del equipo</p>
      </div>

      {medicionAbierta ? (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMedicionAbierta(false)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Configuraciones
        </button>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Medicion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40">
              <Droplets className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">CONTROL DE HUMEDAD</p>
                <p className="text-xs text-muted-foreground">Mantiene la humedad en el rango definido.</p>
              </div>
              <MedicionSwitch
                checked={data.config.sensorHumedad}
                onCheckedChange={(checked) => send('config/sensorHumedad', checked)}
              />
              <button type="button" onClick={() => toggleGroup('hum')} aria-label="Abrir humedad">
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openGroups.hum ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {openGroups.hum ? (
              <div className="border-t border-border px-4 py-3 flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Registro de humedad</p>
                  <p className="text-xs text-muted-foreground">Almacena los datos en la memoria.</p>
                </div>
                <MedicionSwitch
                  checked={data.config.guardarHumedad}
                  disabled={!data.config.sensorHumedad}
                  onCheckedChange={(checked) => send('config/guardarHumedad', checked)}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40">
              <Thermometer className="w-5 h-5 text-red-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">CONTROL DE TEMPERATURA</p>
                <p className="text-xs text-muted-foreground">Mantiene la temperatura en el rango definido.</p>
              </div>
              <MedicionSwitch
                checked={data.config.sensorTemperatura}
                onCheckedChange={(checked) => send('config/sensorTemperatura', checked)}
              />
              <button type="button" onClick={() => toggleGroup('temp')} aria-label="Abrir temperatura">
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openGroups.temp ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {openGroups.temp ? (
              <div className="border-t border-border divide-y divide-border">
                <div className="px-4 py-3 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Registro de temperatura</p>
                    <p className="text-xs text-muted-foreground">Almacena los datos en la memoria.</p>
                  </div>
                  <MedicionSwitch
                    checked={data.config.guardarTemperatura}
                    disabled={!data.config.sensorTemperatura}
                    onCheckedChange={(checked) => send('config/guardarTemperatura', checked)}
                  />
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">SENSOR T/H</p>
                    <p className="text-xs text-muted-foreground">Modelo de sensor.</p>
                  </div>
                  <div className="flex gap-2">
                    {([11, 22] as const).map((model) => {
                      const on = data.config.dht === model
                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            if (model === data.config.dht) return
                            setPendingDht(model)
                          }}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold border ${
                            on
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary/50 text-muted-foreground border-border'
                          }`}
                        >
                          DHT{model}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <ArrowUp className="w-4 h-4 text-green-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Temperatura maxima</p>
                    <p className="text-xs text-muted-foreground">Limite superior.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="w-7 h-7 rounded border border-border text-foreground" onClick={() => requestSpChange('config/spMax', data.config.spMax + 1)}>+</button>
                    <span className="min-w-14 text-center text-sm font-bold text-foreground">{data.config.spMax}°C</span>
                    <button type="button" className="w-7 h-7 rounded border border-border text-foreground" onClick={() => requestSpChange('config/spMax', data.config.spMax - 1)}>−</button>
                    <button type="button" className="flex flex-col items-center text-muted-foreground" onClick={() => { setPinDraft(''); setPinError(false); setPinOpen(true) }}>
                      <Lock className="w-4 h-4" />
                      <span className="text-[9px] font-bold">{spUnlocked ? 'LIBRE' : 'BLOQUEADO'}</span>
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <ArrowDown className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Temperatura minima</p>
                    <p className="text-xs text-muted-foreground">Limite inferior.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="w-7 h-7 rounded border border-border text-foreground" onClick={() => requestSpChange('config/spMin', data.config.spMin + 1)}>+</button>
                    <span className="min-w-14 text-center text-sm font-bold text-foreground">{data.config.spMin}°C</span>
                    <button type="button" className="w-7 h-7 rounded border border-border text-foreground" onClick={() => requestSpChange('config/spMin', data.config.spMin - 1)}>−</button>
                    <button type="button" className="flex flex-col items-center text-muted-foreground" onClick={() => { setPinDraft(''); setPinError(false); setPinOpen(true) }}>
                      <Lock className="w-4 h-4" />
                      <span className="text-[9px] font-bold">{spUnlocked ? 'LIBRE' : 'BLOQUEADO'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40">
              <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">CONTROL DE POTENCIA</p>
                <p className="text-xs text-muted-foreground">Mantiene el consumo en el rango definido.</p>
              </div>
              <MedicionSwitch
                checked={data.config.sensorPotencia}
                onCheckedChange={(checked) => send('config/sensorPotencia', checked)}
              />
              <button type="button" onClick={() => toggleGroup('pow')} aria-label="Abrir potencia">
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openGroups.pow ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {openGroups.pow ? (
              <div className="border-t border-border px-4 py-3 flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Registro de potencia</p>
                  <p className="text-xs text-muted-foreground">Almacena los datos en la memoria.</p>
                </div>
                <MedicionSwitch
                  checked={data.config.guardarPotencia}
                  disabled={!data.config.sensorPotencia}
                  onCheckedChange={(checked) => send('config/guardarPotencia', checked)}
                />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
      </div>
      ) : !autoAbierta && !servicioAbierta && !equipoAbierta && !sistemaAbierta ? (
        <button
          type="button"
          onClick={() => setMedicionAbierta(true)}
          className="w-full text-left rounded-lg border border-border bg-card px-4 py-4 flex items-center gap-3 hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">MEDICION</p>
            <p className="text-xs text-muted-foreground">Humedad, temperatura, potencia</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ) : null}

      {autoAbierta && autoVista === 'panel' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setAutoAbierta(false)} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Configuraciones
          </button>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <Radar className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">ENCENDIDO INTELIGENTE</p>
                  <p className="text-xs text-muted-foreground">Radar de presencia - cerebro GPIO 13</p>
                </div>
                <MedicionSwitch
                  checked={data.config.sensorMovimiento}
                  onCheckedChange={(checked) => send('config/sensorMovimiento', checked)}
                />
              </div>
              <button
                type="button"
                onClick={() => setAutoVista('radar')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Calibracion del radar</p>
                  <p className="text-xs text-muted-foreground">Alcance, retencion y rapidez</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold tracking-wide text-muted-foreground">ACTIVO AHORA</p>
                  <span className={`text-[11px] font-bold ${data.config.sensorMovimiento && data.movimiento ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {!data.config.sensorMovimiento ? 'INACTIVO' : data.movimiento ? 'ACTIVO' : 'FUERA'}
                  </span>
                </div>
                <p className="mt-1 font-medium text-foreground">{perfilActivo ? perfilActivo.name : 'Sin perfil activo'}</p>
                <p className="text-xs text-muted-foreground">{perfilActivo ? perfilActivo.schedule : 'Abre Perfiles y horarios para configurar'}</p>
              </div>
              <button
                type="button"
                onClick={() => setAutoVista('perfiles')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Perfiles y horarios</p>
                  <p className="text-xs text-muted-foreground">Crear, editar y elegir el horario</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {autoAbierta && autoVista === 'radar' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setAutoVista('panel')} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Automatizacion
          </button>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">CALIBRACION RADAR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">PRESENCIA: {data.movimiento ? 'SI' : 'NO'}</p>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">ALCANCE (filtro HMI)</p>
                <ChoiceRow
                  labels={alcanceLabels}
                  value={data.automatizacion.alcance}
                  onPick={(index) => send('automatizacion/alcance', index)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">RETENCION (tiempo del Si)</p>
                  <p className="text-xs text-muted-foreground">{(retencion / 1000).toFixed(1)} s</p>
                </div>
                <input
                  type="range"
                  min={500}
                  max={15000}
                  step={100}
                  value={retencion}
                  onChange={(e) => setRetencion(Number(e.target.value))}
                  onPointerUp={(e) => send('automatizacion/retencionMs', Number(e.currentTarget.value))}
                  className="w-36"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">RAPIDEZ DE DETECCION</p>
                <p className="text-xs text-muted-foreground mb-2">Rapida, Normal o Estable. Se ajusta en el HMI.</p>
                <ChoiceRow labels={['Rapida', 'Normal', 'Estable']} value={1} onPick={() => undefined} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {autoAbierta && autoVista === 'perfiles' ? (
        <PerfilesHorarios onBack={() => setAutoVista('panel')} />
      ) : null}

      {servicioAbierta && servicioVista === 'panel' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setServicioAbierta(false)} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Configuraciones
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setServicioVista('pendientes')}
              className="rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-secondary/40"
            >
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">PENDIENTES</p>
              <p className="text-xs text-muted-foreground mt-1">Abrir lista</p>
            </button>
            <button
              type="button"
              onClick={() => setServicioVista('vencidas')}
              className="rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-secondary/40"
            >
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">VENCIDAS</p>
              <p className="text-xs text-muted-foreground mt-1">Abrir lista</p>
            </button>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setServicioVista('mantenimiento')}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">MANTENIMIENTO</p>
                  <p className="text-xs text-muted-foreground">Lista completa / configurar</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setServicioVista('diagnostico')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">DIAGNOSTICO DE COMPONENTES</p>
                  <p className="text-xs text-muted-foreground">Estado / pruebas</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setServicioVista('cumplimiento')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">CUMPLIMIENTO</p>
                  <p className="text-xs text-muted-foreground">Tareas completadas / comparacion</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setServicioVista('resumen')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">RESUMEN SEMANAL</p>
                  <p className="text-xs text-muted-foreground">Vista rapida / semana actual</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {servicioAbierta && servicioVista !== 'panel' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setServicioVista('panel')} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Servicio
          </button>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">
                {servicioVista === 'pendientes'
                  ? 'PENDIENTES'
                  : servicioVista === 'vencidas'
                    ? 'VENCIDAS'
                    : servicioVista === 'mantenimiento'
                      ? 'MANTENIMIENTO'
                      : servicioVista === 'diagnostico'
                        ? 'DIAGNOSTICO'
                        : servicioVista === 'cumplimiento'
                          ? 'CUMPLIMIENTO'
                          : 'RESUMEN SEMANAL'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {servicioVista === 'pendientes'
                  ? 'La lista de tareas pendientes se guarda en el HMI. Esta pagina todavia no recibe esas tareas.'
                  : servicioVista === 'vencidas'
                    ? 'La lista de tareas vencidas se guarda en el HMI. Esta pagina todavia no recibe esas tareas.'
                    : servicioVista === 'mantenimiento'
                      ? 'La lista completa, la bitacora y la configuracion de tareas se hacen en el HMI.'
                      : servicioVista === 'diagnostico'
                        ? 'Las pruebas de componentes se hacen en el HMI.'
                        : servicioVista === 'cumplimiento'
                          ? 'La comparacion de tareas completadas se calcula en el HMI. Esta pagina todavia no recibe ese historial.'
                          : 'La vista rapida de la semana se arma en el HMI. Esta pagina todavia no recibe ese resumen.'}
              </p>
              {servicioVista === 'diagnostico' ? (
                <p className="text-sm font-medium text-foreground">Fallas activas: {data.diag.fallas}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {equipoAbierta && equipoVista === 'panel' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setEquipoAbierta(false)} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Configuraciones
          </button>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">PERFIL DEL EQUIPO</CardTitle>
              <p className="text-xs text-muted-foreground">Perfil, limites, calibracion y lista</p>
            </CardHeader>
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setEquipoVista('perfil')}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <Factory className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Perfil</p>
                  <p className="text-xs text-muted-foreground">Modelo y especificaciones</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setEquipoVista('limites')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Limites</p>
                  <p className="text-xs text-muted-foreground">Recomendado, configurado y de fabrica</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setEquipoVista('calibracion')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Calibracion</p>
                  <p className="text-xs text-muted-foreground">Iniciar y detener en el equipo</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => setEquipoVista('lista')}
                className="w-full text-left border-t border-border px-4 py-3 flex items-center gap-3 hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Lista</p>
                  <p className="text-xs text-muted-foreground">Equipos guardados en el HMI</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {equipoAbierta && equipoVista !== 'panel' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setEquipoVista('panel')} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Equipo
          </button>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">
                {equipoVista === 'perfil'
                  ? 'Perfil'
                  : equipoVista === 'limites'
                    ? 'Limites'
                    : equipoVista === 'calibracion'
                      ? 'Calibracion'
                      : 'Lista'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {equipoVista === 'perfil'
                  ? 'El modelo y las especificaciones se guardan en el HMI. Esta pagina todavia no recibe ese perfil.'
                  : equipoVista === 'limites'
                    ? 'Los limites recomendado, configurado y de fabrica se ajustan en el HMI.'
                    : equipoVista === 'calibracion'
                      ? 'La calibracion se inicia y se detiene en el HMI. Esta pagina no recibe esas lecturas.'
                      : 'La lista de equipos guardados queda en el HMI. Esta pagina todavia no recibe esas fichas.'}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {sistemaAbierta ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setSistemaAbierta(false)} className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Configuraciones
          </button>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">SISTEMA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <OptionRow icon={Sun} color="text-amber-400" bgColor="bg-amber-500/20" label="BRILLO" detail={`${brillo} %`}>
                <Switch
                  checked={data.sistema.brilloOn}
                  onCheckedChange={(checked) => send('sistema/brilloOn', checked)}
                  className="data-[state=checked]:bg-green-500"
                />
              </OptionRow>
              <div className="px-4">
                <input
                  type="range"
                  min={10}
                  max={100}
                  disabled={!data.sistema.brilloOn}
                  value={brillo}
                  onChange={(e) => setBrillo(Number(e.target.value))}
                  onPointerUp={(e) => send('sistema/brillo', Number(e.currentTarget.value))}
                  className="w-full"
                />
              </div>
              <OptionRow
                icon={Moon}
                color="text-sky-400"
                bgColor="bg-sky-500/20"
                label="STANDBY"
                detail="Pantalla en reposo tras inactividad."
              >
                <Switch
                  checked={data.sistema.suspensionOn}
                  onCheckedChange={(checked) => send('sistema/suspensionOn', checked)}
                  className="data-[state=checked]:bg-green-500"
                />
              </OptionRow>
              <div className="px-1">
                <ChoiceRow
                  labels={sleepLabels}
                  value={data.sistema.suspension}
                  onPick={(index) => send('sistema/suspension', index)}
                />
              </div>
              <OptionRow icon={Bell} color="text-orange-400" bgColor="bg-orange-500/20" label="CONFIRMACION" detail="Sonido al pulsar una accion.">
                <Switch
                  checked={data.sistema.beep}
                  onCheckedChange={(checked) => send('sistema/beep', checked)}
                  className="data-[state=checked]:bg-green-500"
                />
              </OptionRow>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-foreground">Duracion · {beepMs} ms</p>
                  <input
                    type="range"
                    min={20}
                    max={120}
                    disabled={!data.sistema.beep}
                    value={beepMs}
                    onChange={(e) => setBeepMs(Number(e.target.value))}
                    onPointerUp={(e) => send('sistema/beepMs', Number(e.currentTarget.value))}
                    className="w-36"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-foreground">Dureza · {beepDuty} %</p>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    disabled={!data.sistema.beep}
                    value={beepDuty}
                    onChange={(e) => setBeepDuty(Number(e.target.value))}
                    onPointerUp={(e) => send('sistema/beepDuty', Number(e.currentTarget.value))}
                    className="w-36"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!medicionAbierta && !autoAbierta && !servicioAbierta && !equipoAbierta && !sistemaAbierta ? (
      <>
        <button
          type="button"
          onClick={() => {
            setAutoVista('panel')
            setAutoAbierta(true)
          }}
          className="w-full text-left rounded-lg border border-border bg-card px-4 py-4 flex items-center gap-3 hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">AUTOMATIZACION</p>
            <p className="text-xs text-muted-foreground">Encendido inteligente</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => {
            setServicioVista('panel')
            setServicioAbierta(true)
          }}
          className="w-full text-left rounded-lg border border-border bg-card px-4 py-4 flex items-center gap-3 hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">SERVICIO</p>
            <p className="text-xs text-muted-foreground">Mantenimiento, diagnostico</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEquipoVista('panel')
            setEquipoAbierta(true)
          }}
          className="w-full text-left rounded-lg border border-border bg-card px-4 py-4 flex items-center gap-3 hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">EQUIPO</p>
            <p className="text-xs text-muted-foreground">Perfil del equipo</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setSistemaAbierta(true)}
          className="w-full text-left rounded-lg border border-border bg-card px-4 py-4 flex items-center gap-3 hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">SISTEMA</p>
            <p className="text-xs text-muted-foreground">Brillo, suspension, confirmacion</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Configuracion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
            <p className="font-medium text-foreground">FIREBASE</p>
            <p className="text-xs text-muted-foreground">Como habla la pagina con el equipo. La red WiFi se configura en el HMI.</p>
            <ChoiceRow
              labels={firebaseModes}
              value={data.conectividad.firebaseModo}
              onPick={(index) => send('conectividad/firebaseModo', index)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Control por voz
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-secondary/50 border border-border">
            <div className="space-y-0.5">
              <Label htmlFor="fab-switch" className="text-sm font-medium text-foreground">
                Mostrar asistente flotante
              </Label>
              <p className="text-xs text-muted-foreground">
                {fabVisible
                  ? 'El boton flotante de voz es visible en todas las pantallas.'
                  : 'El boton flotante esta oculto. Activalo para volver a usarlo.'}
              </p>
            </div>
            <Switch
              id="fab-switch"
              checked={fabVisible}
              onCheckedChange={(checked) => {
                setFabVisible(checked)
                setFabHidden(!checked)
              }}
              className="data-[state=checked]:bg-green-500"
              aria-label="Mostrar asistente flotante"
            />
          </div>
        </CardContent>
      </Card>
      </>
      ) : null}

      {pendingDht !== null ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="font-medium text-foreground">Usar DHT{pendingDht}?</p>
            <p className="text-sm text-muted-foreground">Afecta temp y humedad. Se reinicia el sensor.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded-lg border border-border text-foreground" onClick={() => setPendingDht(null)}>Cancelar</button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground"
                onClick={() => {
                  send('config/dht', pendingDht)
                  setPendingDht(null)
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pinOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="font-medium text-foreground">PIN setpoints (4 digitos)</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinDraft}
              onChange={(e) => {
                setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))
                setPinError(false)
              }}
              className="w-full h-10 rounded-lg border border-border bg-secondary px-3 text-foreground"
            />
            {pinError ? <p className="text-sm text-red-400">PIN incorrecto.</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded-lg border border-border text-foreground" onClick={() => setPinOpen(false)}>Cancelar</button>
              <button type="button" className="px-3 py-2 rounded-lg bg-primary text-primary-foreground" onClick={submitPin}>Aceptar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
