'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Droplets, Thermometer, Zap, PersonStanding, Mic, Sun, Moon, Bell } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { FAB_HIDDEN_CHANGE_EVENT, isFabHidden, setFabHidden } from '@/lib/fab-storage'
import type { AVCData } from '@/hooks/use-avc-data'
import type { HmiCommandResult } from '@/lib/hmi-command'

interface ConfiguracionesPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => Promise<HmiCommandResult>
}

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

export function ConfiguracionesPage({ data, onUpdate }: ConfiguracionesPageProps) {
  const [fabVisible, setFabVisible] = useState(true)
  const [brillo, setBrillo] = useState(data.sistema.brillo)
  const [beepMs, setBeepMs] = useState(data.sistema.beepMs)
  const [beepDuty, setBeepDuty] = useState(data.sistema.beepDuty)
  const [retencion, setRetencion] = useState(data.automatizacion.retencionMs)

  useEffect(() => setBrillo(data.sistema.brillo), [data.sistema.brillo])
  useEffect(() => setBeepMs(data.sistema.beepMs), [data.sistema.beepMs])
  useEffect(() => setBeepDuty(data.sistema.beepDuty), [data.sistema.beepDuty])
  useEffect(() => setRetencion(data.automatizacion.retencionMs), [data.automatizacion.retencionMs])

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configuraciones</h2>
        <p className="text-muted-foreground">Control, monitoreo y configuracion del equipo</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OptionRow
            icon={Droplets}
            color="text-blue-400"
            bgColor="bg-blue-500/20"
            label="CONTROL DE HUMEDAD"
            detail="Mantiene la humedad en el rango definido."
          >
            <Switch
              checked={data.config.sensorHumedad}
              onCheckedChange={(checked) => send('config/sensorHumedad', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <OptionRow
            icon={Thermometer}
            color="text-red-400"
            bgColor="bg-red-500/20"
            label="CONTROL DE TEMPERATURA"
            detail="Mantiene la temperatura en el rango definido."
          >
            <Switch
              checked={data.config.sensorTemperatura}
              onCheckedChange={(checked) => send('config/sensorTemperatura', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <OptionRow
            icon={Zap}
            color="text-yellow-400"
            bgColor="bg-yellow-500/20"
            label="CONTROL DE POTENCIA"
            detail="Mantiene el consumo de potencia en el rango definido."
          >
            <Switch
              checked={data.config.sensorPotencia}
              onCheckedChange={(checked) => send('config/sensorPotencia', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <OptionRow
            icon={PersonStanding}
            color="text-purple-400"
            bgColor="bg-purple-500/20"
            label="ENCENDIDO INTELIGENTE"
            detail={data.movimiento ? 'Hay presencia ahora.' : 'Sin presencia ahora.'}
          >
            <Switch
              checked={data.config.sensorMovimiento}
              onCheckedChange={(checked) => send('config/sensorMovimiento', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
            <p className="font-medium text-foreground">SENSOR TEMP. / HUM.</p>
            <p className="text-xs text-muted-foreground">Selecciona el modelo de sensor que usas.</p>
            <ChoiceRow
              labels={['DHT11', 'DHT22']}
              value={data.config.dht === 22 ? 1 : 0}
              onPick={(index) => send('config/dht', index === 1 ? 22 : 11)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
              <Label className="text-foreground">Temperatura maxima</Label>
              <p className="text-xs text-muted-foreground">Limite superior de temperatura.</p>
              <Input
                type="number"
                min={0}
                max={100}
                key={`spmax-${data.config.spMax}`}
                defaultValue={data.config.spMax}
                onBlur={(e) => send('config/spMax', Number(e.target.value))}
              />
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
              <Label className="text-foreground">Temperatura minima</Label>
              <p className="text-xs text-muted-foreground">Limite inferior de temperatura.</p>
              <Input
                type="number"
                min={0}
                max={100}
                key={`spmin-${data.config.spMin}`}
                defaultValue={data.config.spMin}
                onBlur={(e) => send('config/spMin', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
            <p className="font-medium text-foreground">Alcance de presencia</p>
            <ChoiceRow
              labels={alcanceLabels}
              value={data.automatizacion.alcance}
              onPick={(index) => send('automatizacion/alcance', index)}
            />
            <div className="flex items-center justify-between gap-4 pt-2">
              <div>
                <p className="text-sm text-foreground">Retencion</p>
                <p className="text-xs text-muted-foreground">{(retencion / 1000).toFixed(1)} s despues de detectar</p>
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
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Monitoreo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OptionRow
            icon={Droplets}
            color="text-blue-400"
            bgColor="bg-blue-500/20"
            label="REGISTRO DE HUMEDAD"
            detail="Almacena los datos en la memoria."
          >
            <Switch
              checked={data.config.guardarHumedad}
              disabled={!data.config.sensorHumedad}
              onCheckedChange={(checked) => send('config/guardarHumedad', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <OptionRow
            icon={Thermometer}
            color="text-red-400"
            bgColor="bg-red-500/20"
            label="REGISTRO DE TEMPERATURA"
            detail="Almacena los datos en la memoria."
          >
            <Switch
              checked={data.config.guardarTemperatura}
              disabled={!data.config.sensorTemperatura}
              onCheckedChange={(checked) => send('config/guardarTemperatura', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <OptionRow
            icon={Zap}
            color="text-yellow-400"
            bgColor="bg-yellow-500/20"
            label="REGISTRO DE POTENCIA"
            detail="Almacena los datos en la memoria."
          >
            <Switch
              checked={data.config.guardarPotencia}
              disabled={!data.config.sensorPotencia}
              onCheckedChange={(checked) => send('config/guardarPotencia', checked)}
              className="data-[state=checked]:bg-green-500"
            />
          </OptionRow>
          <p className="text-sm text-muted-foreground">
            La presencia no guarda historial. Solo enciende o apaga el encendido inteligente.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Configuracion</CardTitle>
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
    </div>
  )
}
