'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FAB_HIDDEN_CHANGE_EVENT, isFabHidden, setFabHidden } from '@/lib/fab-storage'
import type { AVCData } from '@/hooks/use-avc-data'
import type { HmiCommandResult } from '@/lib/hmi-command'

type Pane =
  | 'hub'
  | 'medicion'
  | 'automatizacion'
  | 'servicio'
  | 'equipo'
  | 'sistema'
  | 'conectividad'

type ServicioVista = 'menu' | 'mantenimiento' | 'diagnostico' | 'cumplimiento' | 'resumen'
type EquipoVista = 'perfil' | 'limites' | 'calibracion' | 'lista'
type SistemaVista = 'pantalla' | 'datos'

interface ConfiguracionesPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => Promise<HmiCommandResult>
  onSend: (fields: Record<string, unknown>) => Promise<HmiCommandResult>
}

const hubItems: { id: Pane; title: string; sub: string }[] = [
  { id: 'medicion', title: 'MEDICION', sub: 'Humedad, temperatura, potencia' },
  { id: 'automatizacion', title: 'AUTOMATIZACION', sub: 'Encendido inteligente' },
  { id: 'servicio', title: 'SERVICIO', sub: 'Mantenimiento, diagnostico' },
  { id: 'equipo', title: 'EQUIPO', sub: 'Perfil del equipo' },
  { id: 'sistema', title: 'SISTEMA', sub: 'Brillo, suspension, confirmacion' },
  { id: 'conectividad', title: 'CONECTIVIDAD', sub: 'Wifi, Firebase' },
]

const sleepLabels = ['15s', '30s', '1m', '2m', '5m', '10m', 'Nunca']
const firebaseModes = [
  { label: 'Apagado', hint: 'Sin enlace a la nube' },
  { label: 'Solo leer', hint: 'Recibe; no publica' },
  { label: 'Solo enviar', hint: 'Publica; no escucha' },
  { label: 'Leer+enviar', hint: 'Bidireccional' },
]
const alcanceLabels = ['Cerca', 'Media', 'Lejos']
const rapidezLabels = ['Rapida', 'Normal', 'Estable']

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white border border-[#c3cbd6] rounded-lg px-4">{children}</div>
}

function Row({
  title,
  detail,
  children,
}: {
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[#d7dde5] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-[#101828]">{title}</p>
        {detail ? <p className="text-xs text-[#5b6472]">{detail}</p> : null}
      </div>
      {children}
    </div>
  )
}

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 flex items-center gap-2 text-sm font-bold text-[#101828]">
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  )
}

function Chips({
  labels,
  value,
  disabled,
  onPick,
}: {
  labels: string[]
  value: number
  disabled?: boolean
  onPick: (index: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, index) => {
        const on = index === value
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onPick(index)}
            className={`h-7 px-2 rounded text-[11px] font-bold border ${
              on
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white text-[#111111] border-[#1A1A1A]'
            } disabled:opacity-40`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function NavRow({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <div className="bg-white border border-[#c3cbd6] rounded-lg px-4 py-3 hover:border-[#101828]">
        <p className="text-sm font-extrabold text-[#101828]">{title}</p>
        <p className="text-xs text-[#5b6472]">{detail}</p>
      </div>
    </button>
  )
}

function LocalNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-[#5b6472] bg-[#F3F4F6] border border-[#d7dde5] rounded-lg px-3 py-2">
      {children}
    </p>
  )
}

export function ConfiguracionesPage({ data, onUpdate, onSend }: ConfiguracionesPageProps) {
  const [pane, setPane] = useState<Pane>('hub')
  const [servicio, setServicio] = useState<ServicioVista>('menu')
  const [equipo, setEquipo] = useState<EquipoVista>('perfil')
  const [sistemaVista, setSistemaVista] = useState<SistemaVista>('pantalla')
  const [ssid, setSsid] = useState(data.wifi.ssid)
  const [clave, setClave] = useState('')
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

  if (pane === 'hub') {
    return (
      <div className="space-y-2 max-w-xl">
        {hubItems.map((item) => (
          <NavRow key={item.id} title={item.title} detail={item.sub} onClick={() => setPane(item.id)} />
        ))}
        <Card>
          <Row title="Asistente de voz" detail="Solo en esta pagina">
            <Switch
              checked={fabVisible}
              onCheckedChange={(checked) => {
                setFabVisible(checked)
                setFabHidden(!checked)
              }}
            />
          </Row>
        </Card>
      </div>
    )
  }

  if (pane === 'medicion') {
    const groups = [
      {
        title: 'CONTROL DE HUMEDAD',
        detail: 'Mantiene la humedad en el rango definido.',
        sensor: 'sensorHumedad' as const,
        save: 'guardarHumedad' as const,
        saveLabel: 'Registro de humedad',
      },
      {
        title: 'CONTROL DE TEMPERATURA',
        detail: 'Mantiene la temperatura en el rango definido.',
        sensor: 'sensorTemperatura' as const,
        save: 'guardarTemperatura' as const,
        saveLabel: 'Registro de temperatura',
      },
      {
        title: 'CONTROL DE POTENCIA',
        detail: 'Mantiene el consumo de potencia en el rango definido.',
        sensor: 'sensorPotencia' as const,
        save: 'guardarPotencia' as const,
        saveLabel: 'Registro de potencia',
      },
    ]
    return (
      <div className="space-y-3 max-w-xl">
        <Back label="Configuraciones" onClick={() => setPane('hub')} />
        {groups.map((group) => (
          <Card key={group.sensor}>
            <Row title={group.title} detail={group.detail}>
              <Switch
                checked={data.config[group.sensor]}
                onCheckedChange={(checked) => send(`config/${group.sensor}`, checked)}
              />
            </Row>
            <Row title={group.saveLabel} detail="Almacena los datos en la memoria.">
              <Switch
                checked={data.config[group.save]}
                disabled={!data.config[group.sensor]}
                onCheckedChange={(checked) => send(`config/${group.save}`, checked)}
              />
            </Row>
            {group.sensor === 'sensorTemperatura' ? (
              <>
                <Row title="SENSOR TEMP. / HUM." detail="Selecciona el modelo de sensor que usas.">
                  <Chips
                    labels={['DHT11', 'DHT22']}
                    value={data.config.dht === 22 ? 1 : 0}
                    onPick={(index) => send('config/dht', index === 1 ? 22 : 11)}
                  />
                </Row>
                <Row title="Temperatura maxima" detail="Limite superior de temperatura.">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={data.config.spMax}
                    key={`spmax-${data.config.spMax}`}
                    onBlur={(e) => send('config/spMax', Number(e.target.value))}
                    className="w-20 h-8 text-center bg-[#F5F5F5] border-[#A8A8A8]"
                  />
                </Row>
                <Row title="Temperatura minima" detail="Limite inferior de temperatura.">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={data.config.spMin}
                    key={`spmin-${data.config.spMin}`}
                    onBlur={(e) => send('config/spMin', Number(e.target.value))}
                    className="w-20 h-8 text-center bg-[#F5F5F5] border-[#A8A8A8]"
                  />
                </Row>
              </>
            ) : null}
          </Card>
        ))}
      </div>
    )
  }

  if (pane === 'automatizacion') {
    return (
      <div className="space-y-3 max-w-xl">
        <Back label="Configuraciones" onClick={() => setPane('hub')} />
        <Card>
          <Row title="ENCENDIDO INTELIGENTE" detail={data.config.sensorMovimiento ? 'ACTIVO' : 'INACTIVO'}>
            <Switch
              checked={data.config.sensorMovimiento}
              onCheckedChange={(checked) => send('config/sensorMovimiento', checked)}
            />
          </Row>
          <Row title="ACTIVO AHORA" detail={data.movimiento ? 'Hay presencia' : 'Sin presencia'} />
          <div className="py-3 border-b border-[#d7dde5]">
            <p className="text-sm font-extrabold text-[#101828]">Perfiles y horarios</p>
            <p className="text-xs text-[#5b6472] mb-2">Abre Perfiles y horarios para configurar</p>
            <LocalNote>
              Los perfiles y horarios se guardan en el HMI. Esta pagina todavia no los edita.
            </LocalNote>
          </div>
          <div className="py-3 border-b border-[#d7dde5]">
            <p className="text-sm font-extrabold text-[#101828]">CALIBRACION RADAR</p>
            <p className="text-xs text-[#5b6472] mb-2">
              PRESENCIA: {data.movimiento ? 'SI' : 'NO'}
            </p>
            <p className="text-[11px] font-bold text-[#5b6472] mb-1">ALCANCE (filtro HMI)</p>
            <Chips
              labels={alcanceLabels}
              value={data.automatizacion.alcance}
              onPick={(index) => send('automatizacion/alcance', index)}
            />
          </div>
          <Row title="RETENCION (tiempo del Si)" detail={`${(retencion / 1000).toFixed(1)} s`}>
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
          </Row>
          <div className="py-3">
            <p className="text-sm font-extrabold text-[#101828]">RAPIDEZ DE DETECCION</p>
            <p className="text-xs text-[#5b6472] mb-2">Rapida, Normal o Estable. Se ajusta en el HMI.</p>
            <Chips labels={rapidezLabels} value={1} disabled onPick={() => undefined} />
          </div>
        </Card>
      </div>
    )
  }

  if (pane === 'servicio') {
    if (servicio === 'menu') {
      return (
        <div className="space-y-2 max-w-xl">
          <Back label="Configuraciones" onClick={() => setPane('hub')} />
          <NavRow title="MANTENIMIENTO" detail="Lista completa / configurar" onClick={() => setServicio('mantenimiento')} />
          <NavRow title="DIAGNOSTICO DE COMPONENTES" detail="Estado / pruebas" onClick={() => setServicio('diagnostico')} />
          <NavRow title="CUMPLIMIENTO" detail="Tareas completadas / comparacion" onClick={() => setServicio('cumplimiento')} />
          <NavRow title="RESUMEN SEMANAL" detail="Vista rapida / semana actual" onClick={() => setServicio('resumen')} />
        </div>
      )
    }
    const titles: Record<Exclude<ServicioVista, 'menu'>, { title: string; body: string }> = {
      mantenimiento: {
        title: 'MANTENIMIENTO',
        body: 'Pendientes, vencidas y nueva tarea se llevan en el HMI. La pagina no tiene esa lista.',
      },
      diagnostico: {
        title: 'DIAGNOSTICO',
        body: `${data.diag.fallas} fallas abiertas. El detalle de cada componente esta en Alertas y en el HMI.`,
      },
      cumplimiento: {
        title: 'CUMPLIMIENTO',
        body: 'La comparacion de tareas completadas esta en el HMI.',
      },
      resumen: {
        title: 'RESUMEN SEMANAL',
        body: 'La vista de la semana actual esta en el HMI. El historial de sensores esta en Monitoreo.',
      },
    }
    const view = titles[servicio]
    return (
      <div className="space-y-3 max-w-xl">
        <Back label="Servicio" onClick={() => setServicio('menu')} />
        <Card>
          <div className="py-3">
            <p className="text-sm font-extrabold text-[#101828]">{view.title}</p>
            <p className="text-xs text-[#5b6472] mt-1">{view.body}</p>
          </div>
        </Card>
      </div>
    )
  }

  if (pane === 'equipo') {
    const tabs: { id: EquipoVista; label: string }[] = [
      { id: 'perfil', label: 'Perfil' },
      { id: 'limites', label: 'Limites' },
      { id: 'calibracion', label: 'Calibr.' },
      { id: 'lista', label: 'Lista' },
    ]
    return (
      <div className="space-y-3 max-w-xl">
        <Back label="Configuraciones" onClick={() => setPane('hub')} />
        <Chips
          labels={tabs.map((tab) => tab.label)}
          value={tabs.findIndex((tab) => tab.id === equipo)}
          onPick={(index) => setEquipo(tabs[index].id)}
        />
        <Card>
          {equipo === 'perfil' ? (
            <div className="py-3 space-y-2 text-sm">
              <p className="text-[11px] font-bold text-[#5b6472]">MODELO DEL EQUIPO</p>
              <p className="font-extrabold text-[#101828]">AVC-01 / EcoPulse</p>
              <p><span className="text-[#5b6472]">Motor: </span>{data.estado === 'running' ? 'En operacion' : 'Detenido'}</p>
              <p><span className="text-[#5b6472]">Modo: </span>{data.modo === 'MANUAL' ? 'Manual' : 'Automatico'}</p>
              <p><span className="text-[#5b6472]">Velocidad: </span>{data.velocidad} %</p>
              <p><span className="text-[#5b6472]">Setpoint: </span>{data.setpoint} °C</p>
            </div>
          ) : null}
          {equipo === 'limites' ? (
            <div className="py-3">
              <p className="text-sm font-extrabold text-[#101828]">LIMITES DE SEGURIDAD</p>
              <p className="text-xs text-[#5b6472] mt-1">Los limites del perfil se editan en el HMI.</p>
            </div>
          ) : null}
          {equipo === 'calibracion' ? (
            <div className="py-3">
              <p className="text-sm font-extrabold text-[#101828]">CALIBRACION DEL EQUIPO</p>
              <p className="text-xs text-[#5b6472] mt-1">Detenida. Iniciar la calibracion se hace en el HMI.</p>
            </div>
          ) : null}
          {equipo === 'lista' ? (
            <div className="py-3">
              <p className="text-sm font-extrabold text-[#101828]">EQUIPOS INSTALADOS</p>
              <p className="text-xs text-[#5b6472] mt-1">La lista de equipos instalados esta en el HMI.</p>
            </div>
          ) : null}
        </Card>
      </div>
    )
  }

  if (pane === 'sistema') {
    return (
      <div className="space-y-3 max-w-xl">
        <Back label="Configuraciones" onClick={() => setPane('hub')} />
        <Chips
          labels={['Pantalla', 'Datos']}
          value={sistemaVista === 'pantalla' ? 0 : 1}
          onPick={(index) => setSistemaVista(index === 0 ? 'pantalla' : 'datos')}
        />
        {sistemaVista === 'pantalla' ? (
          <Card>
            <Row title="BRILLO">
              <Switch checked={data.sistema.brilloOn} onCheckedChange={(checked) => send('sistema/brilloOn', checked)} />
            </Row>
            <Row title="Nivel" detail={`${brillo} %`}>
              <input
                type="range"
                min={10}
                max={100}
                disabled={!data.sistema.brilloOn}
                value={brillo}
                onChange={(e) => setBrillo(Number(e.target.value))}
                onPointerUp={(e) => send('sistema/brillo', Number(e.currentTarget.value))}
                className="w-36"
              />
            </Row>
            <Row title="STANDBY" detail="pantalla en reposo tras inactividad">
              <Switch
                checked={data.sistema.suspensionOn}
                onCheckedChange={(checked) => send('sistema/suspensionOn', checked)}
              />
            </Row>
            <div className="py-3 border-b border-[#d7dde5]">
              <Chips
                labels={sleepLabels}
                value={data.sistema.suspension}
                disabled={!data.sistema.suspensionOn}
                onPick={(index) => send('sistema/suspension', index)}
              />
            </div>
            <Row title="CONFIRMACION">
              <Switch checked={data.sistema.beep} onCheckedChange={(checked) => send('sistema/beep', checked)} />
            </Row>
            <Row title="Duracion" detail={`${beepMs} ms`}>
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
            </Row>
            <Row title="Dureza" detail={`${beepDuty} %`}>
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
            </Row>
          </Card>
        ) : (
          <Card>
            <div className="py-3 space-y-2">
              <p className="text-sm font-extrabold text-[#101828]">DATOS</p>
              <p className="text-xs text-[#5b6472]">General, Carpetas, Mapas y Reglas. El almacenamiento y el PIN de datos estan en el HMI.</p>
            </div>
          </Card>
        )}
      </div>
    )
  }

  const firebaseMode = data.conectividad.firebaseModo
  return (
    <div className="space-y-3 max-w-xl">
      <Back label="Configuraciones" onClick={() => setPane('hub')} />
      <Card>
        <Row title="RADIO WiFi" detail={data.conectividad.wifiRadio ? 'ACTIVAR WIFI' : 'DESACTIVAR WIFI'}>
          <Switch
            checked={data.conectividad.wifiRadio}
            onCheckedChange={(checked) => send('conectividad/wifiRadio', checked)}
          />
        </Row>
        <p className="text-xs text-[#5b6472] pb-3">
          {data.wifi.conectado
            ? `${data.wifi.ssid || 'Red'} · ${data.wifi.ip}`
            : 'toca Redes y clave para conectar'}
        </p>
        <p className="text-sm font-extrabold text-[#101828]">Redes y clave</p>
        <div className="py-3 space-y-2 border-b border-[#d7dde5]">
          <Input
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="Nombre de la red"
            className="bg-[#F5F5F5] border-[#A8A8A8]"
          />
          <Input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Contrasena"
            className="bg-[#F5F5F5] border-[#A8A8A8]"
          />
          <button
            type="button"
            disabled={ssid.trim().length === 0}
            onClick={() =>
              void onSend({
                'conectividad/wifiSsid': ssid.trim(),
                'conectividad/wifiClave': clave,
              })
            }
            className="h-9 px-4 rounded-lg bg-[#101828] text-white text-sm font-extrabold disabled:opacity-40"
          >
            Conectar
          </button>
        </div>
        <div className="py-3">
          <p className="text-sm font-extrabold text-[#101828]">FIREBASE</p>
          <p className="text-xs text-[#5b6472] mb-2">
            {firebaseModes[firebaseMode]?.label ?? 'Apagado'} · {firebaseModes[firebaseMode]?.hint ?? ''}
          </p>
          <Chips
            labels={firebaseModes.map((mode) => mode.label)}
            value={firebaseMode}
            onPick={(index) => send('conectividad/firebaseModo', index)}
          />
        </div>
      </Card>
    </div>
  )
}
