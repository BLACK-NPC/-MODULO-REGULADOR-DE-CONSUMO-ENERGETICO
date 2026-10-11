'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendRemoteCommand } from '@/lib/firebase-remote-command'
import {
  SMART_PROFILES_EVENT,
  currentProfile,
  loadSmartProfileStore,
  profileCommandFields,
  saveSmartProfileStore,
  type SmartProfile,
  type SmartProfileStore,
} from '@/lib/smart-profiles'
import { fetchPronostico, type Pronostico } from '@/lib/weather'
import {
  LEAD_OPCIONES,
  LEAD_POR_DEFECTO,
  aplicarAccion,
  generarRecomendaciones,
  type Reco,
} from '@/lib/recomendaciones-clima'

const CLAVE_CIUDAD = 'ecopulse-reco-ciudad'
const CLAVE_LEAD = 'ecopulse-reco-lead'
const CLAVE_RESPUESTAS = 'ecopulse-reco-respuestas'
const CLAVE_DESHACER = 'ecopulse-reco-deshacer'
const REVISAR_CADA_MS = 5 * 60 * 1000

type Deshacer = { index: number; antes: SmartProfile; texto: string }
type Respuestas = Record<string, 'aplicada' | 'omitida'>

function leer<T>(clave: string, vacio: T): T {
  try {
    const raw = window.localStorage.getItem(clave)
    return raw ? (JSON.parse(raw) as T) : vacio
  } catch {
    return vacio
  }
}

function horaPublicacion(publicado: string) {
  return publicado.slice(11, 16)
}

export function RecomendacionesClima() {
  const [ciudad, setCiudad] = useState('')
  const [entrada, setEntrada] = useState('')
  const [editando, setEditando] = useState(false)
  const [pron, setPron] = useState<Pronostico | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [lead, setLead] = useState<number>(LEAD_POR_DEFECTO)
  const [store, setStore] = useState<SmartProfileStore | null>(null)
  const [respuestas, setRespuestas] = useState<Respuestas>({})
  const [deshacer, setDeshacer] = useState<Deshacer | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const ultimaPublicacion = useRef<string | null>(null)

  useEffect(() => {
    const guardada = window.localStorage.getItem(CLAVE_CIUDAD) ?? ''
    setCiudad(guardada)
    setEntrada(guardada)
    setEditando(guardada === '')
    const guardadoLead = Number(window.localStorage.getItem(CLAVE_LEAD))
    if ((LEAD_OPCIONES as readonly number[]).includes(guardadoLead)) setLead(guardadoLead)
    setRespuestas(leer<Respuestas>(CLAVE_RESPUESTAS, {}))
    setDeshacer(leer<Deshacer | null>(CLAVE_DESHACER, null))
    setStore(loadSmartProfileStore())
    const alCambiar = () => setStore(loadSmartProfileStore())
    window.addEventListener(SMART_PROFILES_EVENT, alCambiar)
    return () => window.removeEventListener(SMART_PROFILES_EVENT, alCambiar)
  }, [])

  const consultar = useCallback(async (nombre: string) => {
    if (!nombre) return
    setCargando(true)
    try {
      const resultado = await fetchPronostico(nombre)
      setError('')
      if (ultimaPublicacion.current !== null && ultimaPublicacion.current !== resultado.publicado) {
        setNuevo(true)
      }
      ultimaPublicacion.current = resultado.publicado
      setPron(resultado)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude consultar el clima. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (!ciudad) return
    void consultar(ciudad)
    const id = window.setInterval(() => void consultar(ciudad), REVISAR_CADA_MS)
    return () => window.clearInterval(id)
  }, [ciudad, consultar])

  useEffect(() => {
    if (!nuevo) return
    const id = window.setTimeout(() => setNuevo(false), 20000)
    return () => window.clearTimeout(id)
  }, [nuevo])

  const perfil = store ? currentProfile(store) : null

  const resultado = useMemo(
    () => (pron && perfil ? generarRecomendaciones(perfil, pron, lead) : null),
    [pron, perfil, lead],
  )

  function guardarCiudad(e: React.FormEvent) {
    e.preventDefault()
    const limpio = entrada.trim()
    if (limpio.length < 2) {
      setError('Escribe el nombre de tu ciudad.')
      return
    }
    window.localStorage.setItem(CLAVE_CIUDAD, limpio)
    ultimaPublicacion.current = null
    setPron(null)
    setCiudad(limpio)
    setEditando(false)
    setError('')
  }

  function cambiarLead(valor: number) {
    setLead(valor)
    window.localStorage.setItem(CLAVE_LEAD, String(valor))
  }

  function responder(clave: string, estado: 'aplicada' | 'omitida') {
    setRespuestas((actual) => {
      const siguiente = { ...actual, [clave]: estado }
      window.localStorage.setItem(CLAVE_RESPUESTAS, JSON.stringify(siguiente))
      return siguiente
    })
  }

  async function enviarPerfil(nuevoPerfil: SmartProfile) {
    const respuesta = await sendRemoteCommand(profileCommandFields(nuevoPerfil, true))
    if (respuesta.ok) {
      toast.success('Listo. El cambio ya esta en tu equipo.')
    } else {
      toast.error(`Guardado en la pagina, pero el equipo no lo confirmo. ${respuesta.mensaje}`, { duration: 8000 })
    }
  }

  async function aceptar(reco: Reco, clave: string) {
    if (!store || !perfil || !reco.accion || aplicando) return
    setAplicando(true)
    const index = store.activeIndex
    const antes = store.slots[index]
    const despues = aplicarAccion(antes, reco.accion)
    const slots = store.slots.slice()
    slots[index] = despues
    setStore(saveSmartProfileStore({ slots, activeIndex: index }))
    const registro: Deshacer = { index, antes, texto: reco.accion.etiqueta }
    setDeshacer(registro)
    window.localStorage.setItem(CLAVE_DESHACER, JSON.stringify(registro))
    responder(clave, 'aplicada')
    await enviarPerfil(despues)
    setAplicando(false)
  }

  async function revertir() {
    if (!store || !deshacer || aplicando) return
    setAplicando(true)
    const slots = store.slots.slice()
    slots[deshacer.index] = deshacer.antes
    setStore(saveSmartProfileStore({ slots, activeIndex: store.activeIndex }))
    window.localStorage.removeItem(CLAVE_DESHACER)
    setDeshacer(null)
    setRespuestas((actual) => {
      const siguiente = Object.fromEntries(Object.entries(actual).filter(([, v]) => v !== 'aplicada'))
      window.localStorage.setItem(CLAVE_RESPUESTAS, JSON.stringify(siguiente))
      return siguiente
    })
    await enviarPerfil(deshacer.antes)
    setAplicando(false)
  }

  const fechaClave = pron ? pron.publicado.slice(0, 10) : ''

  return (
    <section aria-labelledby="reco-clima">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle id="reco-clima" className="text-lg text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Recomendaciones para tu equipo
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Miro el clima de tu ciudad y lo comparo con tu perfil activo para cuidar tu consumo y la vida util del equipo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {editando || !ciudad ? (
            <form onSubmit={guardarCiudad} className="space-y-2" noValidate>
              <label htmlFor="reco-ciudad" className="text-sm font-medium text-foreground">
                Ciudad donde esta tu equipo
              </label>
              <div className="flex gap-2">
                <Input
                  id="reco-ciudad"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  placeholder="Ej: Cali"
                  className="bg-secondary border-border"
                />
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Guardar
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-foreground font-medium">{pron?.ciudad ?? ciudad}</span>
              {pron ? (
                <span className="text-muted-foreground">
                  Ahora {Math.round(pron.temperatura)} C · {Math.round(pron.humedad)} % · publicado {horaPublicacion(pron.publicado)}
                </span>
              ) : null}
              {cargando ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
              <button
                type="button"
                onClick={() => {
                  setEntrada(ciudad)
                  setEditando(true)
                }}
                className="ml-auto text-xs text-muted-foreground underline underline-offset-2"
              >
                Cambiar ciudad
              </button>
            </div>
          )}

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          {nuevo ? (
            <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">
              Llego una publicacion nueva del clima y ya actualice tus recomendaciones.
            </p>
          ) : null}

          {ciudad && !pron && !error && cargando ? (
            <p className="text-sm text-muted-foreground">Consultando el clima de {ciudad}...</p>
          ) : null}

          {ciudad && pron && !perfil ? (
            <p className="text-sm text-muted-foreground">
              No encuentro un perfil activo. Crea o activa uno en Configuraciones, Automatizacion, y vuelvo con ideas.
            </p>
          ) : null}

          {resultado?.items.length === 0 && pron && perfil ? (
            <p className="text-sm text-muted-foreground">
              No pude leer las horas de tu perfil en el pronostico de hoy. Intento de nuevo en unos minutos.
            </p>
          ) : null}

          {resultado?.items.map((reco) => {
            const clave = `${fechaClave}-${reco.id}`
            const estado = respuestas[clave]
            return (
              <div key={clave} className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">{reco.titulo}</p>
                {reco.parrafos.map((texto) => (
                  <p key={texto} className="text-sm text-muted-foreground">
                    {texto}
                  </p>
                ))}
                {reco.pregunta ? <p className="text-sm text-foreground">{reco.pregunta}</p> : null}

                {reco.accion && !estado ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={aplicando}
                      onClick={() => void aceptar(reco, clave)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {reco.accion.etiqueta}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => responder(clave, 'omitida')} className="border-border">
                      Dejarlo asi
                    </Button>
                    {reco.accion.tipo === 'adelanto' ? (
                      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        Adelanto estimado
                        <select
                          value={lead}
                          onChange={(e) => cambiarLead(Number(e.target.value))}
                          className="h-8 rounded-md border border-border bg-secondary px-2 text-foreground"
                        >
                          {LEAD_OPCIONES.map((minutos) => (
                            <option key={minutos} value={minutos}>
                              {minutos} min
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {estado === 'aplicada' ? (
                  <p className="text-xs text-foreground">Hecho. Gracias por cuidar tu equipo.</p>
                ) : null}
                {estado === 'omitida' ? (
                  <p className="text-xs text-muted-foreground">Entendido, lo dejamos como esta.</p>
                ) : null}
              </div>
            )
          })}

          {deshacer ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Ultimo cambio: {deshacer.texto}. Se aplico a tu perfil activo, no solo por hoy.</span>
              <button
                type="button"
                disabled={aplicando}
                onClick={() => void revertir()}
                className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
              >
                <Undo2 className="w-3 h-3" />
                Deshacer
              </button>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Las recomendaciones comparan el clima exterior con el objetivo de tu perfil; tu espacio puede comportarse distinto. La pagina revisa el clima cada 5 minutos mientras esta abierta.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
