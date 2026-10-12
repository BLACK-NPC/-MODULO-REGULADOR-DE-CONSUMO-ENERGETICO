'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, BarChart3, Clock, Sparkles, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { loadServicio, saveServicio } from '@/lib/page-servicio'
import { currentProfile, loadSmartProfileStore, profileCommandFields, saveSmartProfileStore } from '@/lib/smart-profiles'
import { hourlySeries, kwh, statSegments } from '@/lib/voice-history'
import { fetchPronostico, type Pronostico } from '@/lib/weather'
import { LEAD_POR_DEFECTO, aplicarAccion, generarRecomendaciones, type Reco, type VentanaClima } from '@/lib/recomendaciones-clima'
import { sendRemoteCommand } from '@/lib/firebase-remote-command'
import type { AVCData, FaultRecord } from '@/hooks/use-avc-data'

const NAMES = ['Temperatura', 'Humedad', 'Potencia', 'WiFi', 'Presencia', 'Nube', 'Cerebro']
const HINTS = [
  'Revisa el sensor DHT y el limite maximo.',
  'Revisa el sensor DHT y el humidificador.',
  'Revisa la carga conectada y el sensor de potencia.',
  'Revisa el router y la senal en el equipo.',
  'Revisa el radar y su cableado.',
  'Revisa internet y la conexion a Firebase.',
  'Revisa TX, RX y GND entre la pantalla y el cerebro.',
]
const OMITIR = 'ecopulse-notif-omitir'
const CLAVE_CIUDAD = 'ecopulse-reco-ciudad'
const CLAVE_LEAD = 'ecopulse-reco-lead'
const CLAVE_RESPUESTAS = 'ecopulse-reco-respuestas'

function cuerpoReco(reco: Reco, ventana: VentanaClima | null, setpoint: number) {
  if (reco.id === 'ahorro' && ventana) {
    return `Maxima ${ventana.maxima} C en tu horario, bajo el objetivo de ${setpoint} C.`
  }
  if (reco.id === 'adelanto' && ventana) {
    return `Hacia las ${String(ventana.horaMaxima).padStart(2, '0')}:00 se esperan ${ventana.maxima} C.`
  }
  if (reco.id === 'humedad' && ventana) {
    return `Hasta ${ventana.humedadMaxima} % de humedad durante tu horario.`
  }
  if (ventana) {
    return `Entre ${ventana.minima} y ${ventana.maxima} C en tu horario.`
  }
  return 'Hoy tu perfil no tiene horario. El equipo puede descansar.'
}

function botonReco(reco: Reco) {
  if (reco.accion?.tipo === 'ahorro') return 'Ahorrar'
  if (reco.accion?.tipo === 'adelanto') return 'Adelantar'
  if (reco.accion?.tipo === 'preventiva') return 'Activar'
  return 'Aplicar'
}

function minutos(start: number) {
  if (start < 1700000000) return null
  return Math.max(1, Math.floor((Date.now() / 1000 - start) / 60))
}

function textoMin(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

function diaClave(d: Date) {
  return d.toISOString().slice(0, 10)
}

function kwhDia(data: AVCData, dayIdx: number) {
  const stat = statSegments(data, 'potencia', [{ dayIdx, from: 0, to: 24 }])
  if (!stat) return null
  const serie = hourlySeries(data, dayIdx, 'potencia')
  if (!serie.some((v) => v !== null && v > 0)) return null
  return { kwh: kwh(stat), picoHora: stat.maxH }
}

function siguienteEncendido(now: Date) {
  const perfil = currentProfile(loadSmartProfileStore())
  if (!perfil) return null
  for (let i = 0; i < 8; i += 1) {
    const dia = new Date(now)
    dia.setDate(now.getDate() + i)
    const bit = (dia.getDay() + 6) % 7
    if ((perfil.daysMask & (1 << bit)) === 0) continue
    const cuando = new Date(dia)
    cuando.setHours(perfil.hourFrom, perfil.minFrom, 0, 0)
    if (cuando.getTime() > now.getTime() + 30_000) {
      return { perfil, cuando }
    }
  }
  return null
}

function Nota({
  color,
  icon,
  cuando,
  titulo,
  cuerpo,
  acciones,
}: {
  color: string
  icon: ReactNode
  cuando: string
  titulo: string
  cuerpo: string
  acciones?: { label: string; primary?: boolean; onClick: () => void }[]
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border border-white/10 bg-[#202a26]/90 p-3">
      <div className="flex items-start gap-3">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#08130d]', color)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
            <span>EcoPulse</span>
            <span>{cuando}</span>
          </div>
          <p className="mt-0.5 truncate text-[15px] font-bold text-foreground">{titulo}</p>
          <p className="line-clamp-2 text-[13px] leading-snug text-[#c9d6d0]">{cuerpo}</p>
        </div>
      </div>
      {acciones ? (
        <div className="flex gap-2">
          {acciones.map((accion) => (
            <button
              key={accion.label}
              type="button"
              onClick={accion.onClick}
              className={cn(
                'h-10 flex-1 rounded-xl text-[13px] font-bold',
                accion.primary ? 'bg-[#3ddc6a] text-[#06210f]' : 'bg-white/10 text-foreground',
              )}
            >
              {accion.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function NotificacionesVistas({
  data,
  onBack,
  onGo,
  onOpenDatos,
}: {
  data: AVCData
  onBack: () => void
  onGo: (pane: 'alertas' | 'perfiles' | 'servicio') => void
  onOpenDatos?: () => void
}) {
  const [ahora, setAhora] = useState(() => new Date())
  const [omitido, setOmitido] = useState('')
  const [tareaHecha, setTareaHecha] = useState(false)
  const [pron, setPron] = useState<Pronostico | null>(null)
  const [recoEstado, setRecoEstado] = useState('cargando')
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [aplicando, setAplicando] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30000)
    setOmitido(window.localStorage.getItem(OMITIR) ?? '')
    try {
      setRespuestas(JSON.parse(window.localStorage.getItem(CLAVE_RESPUESTAS) ?? '{}') as Record<string, string>)
    } catch {
      setRespuestas({})
    }
    const ciudad = window.localStorage.getItem(CLAVE_CIUDAD)?.trim() ?? ''
    if (!ciudad) {
      setRecoEstado('sin-ciudad')
      return () => window.clearInterval(id)
    }
    const perfil = currentProfile(loadSmartProfileStore())
    if (!perfil) {
      setRecoEstado('sin-perfil')
      return () => window.clearInterval(id)
    }
    let vivo = true
    setRecoEstado('cargando')
    void fetchPronostico(ciudad)
      .then((resultado) => {
        if (vivo) {
          setPron(resultado)
          setRecoEstado('listo')
        }
      })
      .catch(() => {
        if (vivo) setRecoEstado('error')
      })
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [])

  const abierta = data.diag.historial.find((row) => row.end === 0) ?? null
  const hoy = kwhDia(data, ahora.getDay())
  const ayer = kwhDia(data, (ahora.getDay() + 6) % 7)
  const encendido = siguienteEncendido(ahora)
  const omitirHoy = encendido ? omitido === `${diaClave(ahora)}:${encendido.perfil.profileName}` : false
  const hora = ahora.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  const fecha = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

  function crearTarea(row: FaultRecord) {
    const store = loadServicio()
    if (store.tasks.some((task) => task.id === `t_${row.id}`)) {
      setTareaHecha(true)
      return
    }
    saveServicio({
      ...store,
      tasks: [
        ...store.tasks,
        {
          id: `t_${row.id}`,
          name: `Falla ${NAMES[row.signal] ?? 'equipo'}`.slice(0, 22),
          type: 'Correctivo',
          intervalDays: 7,
          reminderDays: 3,
          createdAt: new Date().toISOString(),
          lastDone: null,
        },
      ],
    })
    setTareaHecha(true)
  }

  const fallaMin = abierta ? minutos(abierta.start) : null
  const fallaTitulo = abierta
    ? `Falla de ${NAMES[abierta.signal] ?? 'equipo'}${fallaMin ? ` · ${textoMin(fallaMin)}` : ''}`
    : ''
  const fallaCuerpo = abierta
    ? abierta.signal === 2 && abierta.peak > 0
      ? `Pico de ${Math.round(abierta.peak)} W. ${HINTS[2]}`
      : HINTS[abierta.signal] ?? 'Revisa el equipo.'
    : ''

  let consumoTitulo = ''
  let consumoCuerpo = ''
  if (hoy) {
    const diff = ayer && ayer.kwh > 0 ? Math.round(((hoy.kwh - ayer.kwh) / ayer.kwh) * 100) : null
    const signo = diff === null ? '' : diff > 0 ? ` (+${diff} %)` : diff < 0 ? ` (${diff} %)` : ' (igual)'
    consumoTitulo = `Hoy: ${hoy.kwh.toFixed(1)} kWh${signo}`
    consumoCuerpo = ayer
      ? `${diff !== null && diff > 0 ? 'Mas que ayer. ' : diff !== null && diff < 0 ? 'Menos que ayer. ' : ''}El pico fue a las ${hoy.picoHora}:00.`
      : `El pico fue a las ${hoy.picoHora}:00.`
  }

  const perfilTitulo = encendido
    ? `${encendido.perfil.profileName} enciende a las ${String(encendido.cuando.getHours()).padStart(2, '0')}:${String(encendido.cuando.getMinutes()).padStart(2, '0')}`
    : ''
  const perfilCuerpo = encendido ? `${encendido.perfil.daysMask === 0x1f ? 'Lunes a viernes' : 'Segun su horario'} · ${encendido.perfil.setpointC} °C.` : ''

  const perfilActivo = currentProfile(loadSmartProfileStore())
  const leadGuardado = Number(typeof window !== 'undefined' ? window.localStorage.getItem(CLAVE_LEAD) : '')
  const lead = Number.isFinite(leadGuardado) && leadGuardado > 0 ? leadGuardado : LEAD_POR_DEFECTO
  const resultado = pron && perfilActivo ? generarRecomendaciones(perfilActivo, pron, lead) : null
  const recomendaciones = resultado?.items ?? []
  const fechaReco = pron ? pron.publicado.slice(0, 10) : ''

  async function aplicarReco(reco: Reco, clave: string) {
    if (!reco.accion || aplicando) return
    const store = loadSmartProfileStore()
    const antes = store.slots[store.activeIndex]
    if (!antes) return
    setAplicando(clave)
    const despues = aplicarAccion(antes, reco.accion)
    const slots = store.slots.slice()
    slots[store.activeIndex] = despues
    saveSmartProfileStore({ slots, activeIndex: store.activeIndex })
    const siguiente = { ...respuestas, [clave]: 'aplicada' }
    window.localStorage.setItem(CLAVE_RESPUESTAS, JSON.stringify(siguiente))
    setRespuestas(siguiente)
    const respuesta = await sendRemoteCommand(profileCommandFields(despues, true))
    if (respuesta.ok) toast.success('Listo. El cambio ya esta en tu equipo.')
    else toast.error(`Guardado en la pagina, pero el equipo no lo confirmo. ${respuesta.mensaje}`)
    setAplicando('')
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Configuraciones
      </button>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notificaciones</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Titulo en una linea, un dato clave y acciones directas.</p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">En pantalla bloqueada</h2>
          <div className="flex flex-col gap-2 rounded-[28px] border border-border bg-[#0b1210] px-3.5 pb-4 pt-5">
            <div className="mb-2 text-center">
              <b className="block text-5xl font-semibold leading-none text-foreground">{hora}</b>
              <span className="text-[13px] capitalize text-muted-foreground">{fecha}</span>
            </div>
            {abierta ? (
              <Nota color="bg-[#ff8a7a]" icon={<Zap className="h-5 w-5" />} cuando="ahora" titulo={fallaTitulo} cuerpo={fallaCuerpo} />
            ) : (
              <p className="px-2 text-sm text-muted-foreground">No hay una falla abierta.</p>
            )}
            {recomendaciones.length > 0
              ? recomendaciones.map((reco) => (
                  <Nota
                    key={reco.id}
                    color="bg-[#f5c16c]"
                    icon={<Sparkles className="h-5 w-5" />}
                    cuando="hoy"
                    titulo={reco.titulo}
                    cuerpo={cuerpoReco(reco, resultado?.ventana ?? null, perfilActivo?.setpointC ?? 0)}
                  />
                ))
              : (
                  <p className="px-2 text-sm text-muted-foreground">
                    {recoEstado === 'cargando'
                      ? 'Consultando la recomendacion del dia...'
                      : recoEstado === 'sin-ciudad'
                        ? 'Falta la ciudad para recomendar la programacion.'
                        : recoEstado === 'sin-perfil'
                          ? 'Falta un perfil activo para recomendar la programacion.'
                          : recoEstado === 'error'
                            ? 'No pude consultar el clima para la recomendacion.'
                            : 'Sin recomendacion de programacion para hoy.'}
                  </p>
                )}
            {hoy ? (
              <Nota color="bg-[#6cb8ff]" icon={<BarChart3 className="h-5 w-5" />} cuando="hoy" titulo={consumoTitulo} cuerpo={consumoCuerpo} />
            ) : (
              <p className="px-2 text-sm text-muted-foreground">Sin historial de consumo para hoy.</p>
            )}
            {encendido && !omitirHoy ? (
              <Nota
                color="bg-[#3ddc6a]"
                icon={<Clock className="h-5 w-5" />}
                cuando={encendido.cuando.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                titulo={perfilTitulo}
                cuerpo={perfilCuerpo}
              />
            ) : (
              <p className="px-2 text-sm text-muted-foreground">{omitirHoy ? 'El aviso del perfil quedo omitido hoy.' : 'No hay un perfil con un proximo encendido.'}</p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">Al desplegar: con acciones</h2>
          <p className="text-[13px] text-muted-foreground">Las acciones van en botones, no escritas dentro del texto.</p>
          <div className="flex flex-col gap-2 rounded-[28px] border border-border bg-[#0b1210] p-3.5">
            {abierta ? (
              <Nota
                color="bg-[#ff8a7a]"
                icon={<Zap className="h-5 w-5" />}
                cuando="ahora"
                titulo={fallaTitulo}
                cuerpo={fallaCuerpo}
                acciones={[
                  { label: tareaHecha ? 'Tarea creada' : 'Crear tarea', primary: true, onClick: () => crearTarea(abierta) },
                  { label: 'Ver detalle', onClick: () => onGo('alertas') },
                ]}
              />
            ) : null}
            {recomendaciones.map((reco) => {
              const clave = `${fechaReco}-${reco.id}`
              const estado = respuestas[clave]
              const acciones = reco.accion && !estado
                ? [
                    { label: aplicando === clave ? 'Aplicando' : botonReco(reco), primary: true, onClick: () => void aplicarReco(reco, clave) },
                    { label: 'Ver detalle', onClick: () => onOpenDatos?.() },
                  ]
                : [{ label: 'Ver detalle', primary: true, onClick: () => onOpenDatos?.() }]
              return (
                <Nota
                  key={clave}
                  color="bg-[#f5c16c]"
                  icon={<Sparkles className="h-5 w-5" />}
                  cuando="hoy"
                  titulo={reco.titulo}
                  cuerpo={cuerpoReco(reco, resultado?.ventana ?? null, perfilActivo?.setpointC ?? 0)}
                  acciones={acciones}
                />
              )
            })}
            {encendido ? (
              <Nota
                color="bg-[#3ddc6a]"
                icon={<Clock className="h-5 w-5" />}
                cuando={encendido.cuando.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                titulo={perfilTitulo}
                cuerpo={perfilCuerpo}
                acciones={[
                  {
                    label: 'Omitir hoy',
                    onClick: () => {
                      const valor = `${diaClave(ahora)}:${encendido.perfil.profileName}`
                      window.localStorage.setItem(OMITIR, valor)
                      setOmitido(valor)
                    },
                  },
                  { label: 'Cambiar', primary: true, onClick: () => onGo('perfiles') },
                ]}
              />
            ) : null}
            {!abierta && !encendido && recomendaciones.length === 0 ? <p className="text-sm text-muted-foreground">No hay acciones pendientes.</p> : null}
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Como se lee cada aviso</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Icono con simbolo', 'Rayo rojo es una falla, chispa ambar la recomendacion del dia, barras azules el resumen y reloj verde la automatizacion.'],
            ['Titulo en una linea', 'El dato clave va en el titulo, por ejemplo la duracion o los kWh.'],
            ['Cuerpo de 1 a 2 lineas', 'Un solo dato extra. El detalle largo queda dentro de la app.'],
            ['Acciones en botones', 'Crear tarea, ver detalle, omitir hoy o cambiar, sin escribirlo en el texto.'],
            ['Cabecera del sistema', 'EcoPulse y la hora van arriba. El telefono las pone al avisar de verdad.'],
            ['Urgencia por tipo', 'La falla va primero. El resumen del dia y el perfil no tapan a la falla.'],
          ].map(([titulo, texto]) => (
            <div key={titulo} className="rounded-2xl border border-border bg-secondary/50 p-3.5">
              <b className="mb-1 block text-foreground">{titulo}</b>
              <p className="text-[13px] leading-snug text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
