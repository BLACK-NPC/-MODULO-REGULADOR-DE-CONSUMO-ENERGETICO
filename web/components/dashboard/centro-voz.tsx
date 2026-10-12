'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Mic } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { AVCData } from '@/hooks/use-avc-data'
import type { HmiCommandResult } from '@/lib/hmi-command'
import { speak, stopSpeaking } from '@/lib/speech-synthesis'
import { VOICE_COMMAND_GROUPS } from '@/lib/voice-command-menu'
import { FAB_HIDDEN_CHANGE_EVENT, isFabHidden, setFabHidden } from '@/lib/fab-storage'
import {
  ACCIONES,
  AIRE_MAX,
  AIRE_MIN,
  AJUSTES_INICIALES,
  MODO_AIRE,
  PANTALLAS,
  VENTILADOR_AIRE,
  buscarComando,
  cargarAire,
  cargarCentroVoz,
  comandosDeFabrica,
  esAccion,
  guardarAire,
  guardarCentroVoz,
  importarCentroVoz,
  normalizar,
  parecidas,
  tokenizar,
  type AccionVoz,
  type AjustesVoz,
  type ComandoVoz,
  type EstadoAire,
  type PantallaVoz,
} from '@/lib/centro-voz'

const HEARTBEAT_MS = 25000

type Registro = { texto: string; ok: boolean; mensaje: string; ignorado?: boolean }

interface CentroVozProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => Promise<HmiCommandResult>
  onBack: () => void
  onNavigate?: (page: 'home' | 'aire') => void
  isDemo?: boolean
  lastHeartbeatAt?: number | null
}

export function CentroVoz({ data, onUpdate, onBack, onNavigate, isDemo = false, lastHeartbeatAt = null }: CentroVozProps) {
  const [ajustes, setAjustes] = useState<AjustesVoz>(AJUSTES_INICIALES)
  const [comandos, setComandos] = useState<ComandoVoz[]>(comandosDeFabrica)
  const [listo, setListo] = useState(false)
  const [aire, setAire] = useState<EstadoAire>(() => cargarAire())
  const [registros, setRegistros] = useState<Registro[]>([])
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const [vivo, setVivo] = useState('')
  const [escuchando, setEscuchando] = useState(false)
  const [sinVoz, setSinVoz] = useState(false)
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<PantallaVoz | ''>('')
  const [destello, setDestello] = useState<'vent' | 'ac' | null>(null)
  const [json, setJson] = useState('')
  const [fabVisible, setFabVisible] = useState(true)
  const [ahora, setAhora] = useState(() => Date.now())

  const reconocedor = useRef<SpeechRecognition | null>(null)
  const escuchandoRef = useRef(false)
  const ejecutarRef = useRef<(texto: string, origen: 'voz' | 'texto') => void>(() => {})
  const ajustesRef = useRef(ajustes)
  ajustesRef.current = ajustes
  const siguienteId = useRef(100)
  const nuevaFrase = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const guardado = cargarCentroVoz()
    setAjustes(guardado.ajustes)
    setComandos(guardado.comandos)
    setListo(true)
    setSinVoz(!(window.SpeechRecognition || window.webkitSpeechRecognition))
    setFabVisible(!isFabHidden())
    const sincronizarFab = () => setFabVisible(!isFabHidden())
    window.addEventListener(FAB_HIDDEN_CHANGE_EVENT, sincronizarFab)
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => {
      window.removeEventListener(FAB_HIDDEN_CHANGE_EVENT, sincronizarFab)
      window.clearInterval(reloj)
      escuchandoRef.current = false
      reconocedor.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (listo) guardarCentroVoz(ajustes, comandos)
  }, [ajustes, comandos, listo])

  useEffect(() => {
    if (!destello) return
    const id = window.setTimeout(() => setDestello(null), 1400)
    return () => window.clearTimeout(id)
  }, [destello])

  const sugerencias = useMemo(
    () =>
      comandos
        .filter((c) => c.activo && c.frases[0])
        .slice(0, 26)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .map((c) => c.frases[0].replace('{n}', '24')),
    [comandos],
  )

  const lecturaViva = !isDemo && lastHeartbeatAt !== null && ahora - lastHeartbeatAt <= HEARTBEAT_MS
  const spMin = Math.round(Math.min(data.config.spMin, data.config.spMax))
  const spMax = Math.round(Math.max(data.config.spMin, data.config.spMax))

  function decir(mensaje: string) {
    if (ajustesRef.current.hablar) void speak(mensaje)
  }

  function anotar(registro: Registro) {
    setRegistros((prev) => [registro, ...prev].slice(0, 8))
  }

  function cambiarAire(cambio: (prev: EstadoAire) => Partial<EstadoAire>) {
    const actual = cargarAire()
    const siguiente = { ...actual, ...cambio(actual) }
    guardarAire(siguiente)
    setAire(siguiente)
  }

  function estadoGeneral() {
    const a = cargarAire()
    const vent = !lecturaViva
      ? 'Ventilacion sin lectura del equipo.'
      : `Ventilacion ${data.estado === 'running' ? 'en marcha' : 'detenida'} al ${data.velocidad} por ciento, en modo ${data.modo === 'MANUAL' ? 'manual' : 'automatico'}.`
    const ac = a.encendido ? `Aire encendido a ${a.objetivo} grados en modo ${MODO_AIRE[a.modo]}.` : 'Aire apagado.'
    return `${vent} ${ac}`
  }

  async function aplicar(accion: AccionVoz, n: number | null): Promise<{ ok: boolean; mensaje?: string }> {
    const hmi = (r: HmiCommandResult) => ({ ok: r.ok, mensaje: r.ok ? undefined : r.mensaje || 'El HMI no confirmo la orden.' })
    const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    switch (accion) {
      case 'vent_on':
        return hmi(await onUpdate('estado', 'running'))
      case 'vent_off':
        return hmi(await onUpdate('estado', 'stopped'))
      case 'vent_auto':
        return hmi(await onUpdate('modo', 'AUTOMATICO'))
      case 'vent_manual':
        return hmi(await onUpdate('modo', 'MANUAL'))
      case 'vent_speed': {
        if (data.modo !== 'MANUAL') {
          const r = await onUpdate('modo', 'MANUAL')
          if (!r.ok) return hmi(r)
        }
        return hmi(await onUpdate('velocidad', limitar(n ?? 0, 0, 100)))
      }
      case 'vent_sp':
        return hmi(await onUpdate('setpoint', limitar(n ?? spMin, spMin, spMax)))
      case 'ac_on':
        cambiarAire(() => ({ encendido: true }))
        break
      case 'ac_off':
        cambiarAire(() => ({ encendido: false }))
        break
      case 'ac_temp':
        cambiarAire(() => ({ encendido: true, objetivo: limitar(n ?? 22, AIRE_MIN, AIRE_MAX) }))
        break
      case 'ac_up':
        cambiarAire((p) => ({ objetivo: limitar(p.objetivo + 1, AIRE_MIN, AIRE_MAX) }))
        break
      case 'ac_down':
        cambiarAire((p) => ({ objetivo: limitar(p.objetivo - 1, AIRE_MIN, AIRE_MAX) }))
        break
      case 'ac_cool':
        cambiarAire(() => ({ modo: 'cool' }))
        break
      case 'ac_heat':
        cambiarAire(() => ({ modo: 'heat' }))
        break
      case 'ac_fan':
        cambiarAire(() => ({ modo: 'fan' }))
        break
      case 'ac_dry':
        cambiarAire(() => ({ modo: 'dry' }))
        break
      case 'ac_auto':
        cambiarAire(() => ({ modo: 'auto' }))
        break
      case 'fan_low':
        cambiarAire(() => ({ ventilador: 'low' }))
        break
      case 'fan_med':
        cambiarAire(() => ({ ventilador: 'medium' }))
        break
      case 'fan_high':
        cambiarAire(() => ({ ventilador: 'high' }))
        break
      case 'fan_auto':
        cambiarAire(() => ({ ventilador: 'auto' }))
        break
      case 'ac_swing':
        cambiarAire((p) => ({ swing: !p.swing }))
        break
      case 'ac_sleep':
        cambiarAire((p) => ({ sleep: !p.sleep }))
        break
      case 'ac_timer':
        cambiarAire((p) => ({ temporizador: !p.temporizador }))
        break
      case 'go_vent':
        onNavigate?.('home')
        break
      case 'go_ac':
        onNavigate?.('aire')
        break
      case 'status':
        return { ok: true, mensaje: estadoGeneral() }
    }
    return { ok: true }
  }

  async function ejecutar(entrada: string, origen: 'voz' | 'texto') {
    let dicho = entrada.trim()
    if (!dicho) return
    const cfg = ajustesRef.current
    if (origen === 'voz' && cfg.continua && cfg.palabraActiva) {
      const palabra = normalizar(cfg.palabra)
      const palabras = normalizar(dicho).split(' ')
      const i = palabras.findIndex((x) => parecidas(x, palabra))
      if (i < 0) {
        anotar({ texto: dicho, ok: false, mensaje: `Ignorado: no dijiste «${cfg.palabra}»`, ignorado: true })
        return
      }
      dicho = palabras.filter((_, k) => k !== i).join(' ')
    }

    const { mejor, numero } = buscarComando(dicho, comandos)
    if (!mejor || mejor.puntaje < cfg.sensibilidad / 100) {
      const mensaje = `No entendi «${dicho}»${mejor ? `. Lo mas parecido: «${mejor.frase}» (${Math.round(mejor.puntaje * 100)} %)` : ''}`
      setResultado({ ok: false, mensaje })
      anotar({ texto: dicho, ok: false, mensaje })
      decir('No te entendi')
      return
    }

    const accion = ACCIONES[mejor.comando.accion]
    if (accion.numero && numero === null) {
      const mensaje = `Falta un numero en «${dicho}»`
      setResultado({ ok: false, mensaje })
      anotar({ texto: dicho, ok: false, mensaje })
      decir('Falta un numero')
      return
    }

    setResultado({ ok: true, mensaje: `${accion.nombre}...` })
    const r = await aplicar(mejor.comando.accion, numero)
    const porcentaje = `${Math.round(mejor.puntaje * 100)} %`
    if (!r.ok) {
      const mensaje = r.mensaje ?? 'No se pudo aplicar la orden.'
      setResultado({ ok: false, mensaje })
      anotar({ texto: dicho, ok: false, mensaje })
      decir(mensaje)
      return
    }
    const mensaje = `${r.mensaje ?? accion.nombre + (accion.numero ? ` → ${numero}` : '')} · ${porcentaje}`
    setResultado({ ok: true, mensaje })
    anotar({ texto: dicho, ok: true, mensaje })
    if (accion.pantalla !== 'gen' || mejor.comando.accion === 'go_vent' || mejor.comando.accion === 'go_ac') {
      setDestello(accion.pantalla === 'ac' || mejor.comando.accion === 'go_ac' ? 'ac' : 'vent')
    }
    decir(r.mensaje ?? accion.nombre)
  }
  ejecutarRef.current = (t, o) => void ejecutar(t, o)

  function alternarEscucha() {
    const Impl = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Impl) return
    if (escuchandoRef.current) {
      escuchandoRef.current = false
      reconocedor.current?.stop()
      setEscuchando(false)
      setVivo('')
      return
    }
    stopSpeaking()
    const rec = new Impl()
    rec.lang = 'es-CO'
    rec.interimResults = true
    rec.continuous = ajustesRef.current.continua
    rec.onresult = (e) => {
      let final = ''
      let parcial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        parcial += e.results[i][0].transcript
        if (e.results[i].isFinal) final += e.results[i][0].transcript
      }
      setVivo(parcial)
      if (final) ejecutarRef.current(final, 'voz')
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        escuchandoRef.current = false
        setEscuchando(false)
        setResultado({ ok: false, mensaje: 'Permite el uso del microfono en el navegador.' })
      }
    }
    rec.onend = () => {
      if (escuchandoRef.current && ajustesRef.current.continua) {
        try {
          rec.start()
        } catch {
          /* ya en ejecucion */
        }
        return
      }
      escuchandoRef.current = false
      setEscuchando(false)
    }
    reconocedor.current = rec
    try {
      rec.start()
      escuchandoRef.current = true
      setEscuchando(true)
      setVivo('')
    } catch {
      escuchandoRef.current = false
      setEscuchando(false)
    }
  }

  function cambiarComando(id: string, cambio: (c: ComandoVoz) => ComandoVoz | null) {
    setComandos((prev) => prev.flatMap((c) => (c.id === id ? (cambio(c) ?? []) : [c])))
  }

  function ensenar(indice: number, id: string) {
    const registro = registros[indice]
    const comando = comandos.find((c) => c.id === id)
    if (!registro || !comando) return
    let frase = normalizar(registro.texto)
    if (tokenizar(registro.texto).n !== null && ACCIONES[comando.accion].numero) frase = frase.replace(/\b\d+\b/, '{n}')
    cambiarComando(id, (c) => ({ ...c, frases: [...c.frases, frase] }))
    setResultado({ ok: true, mensaje: `Aprendido: «${frase}» ahora ejecuta «${ACCIONES[comando.accion].nombre}»` })
    setRegistros((prev) =>
      prev.map((r, i) => (i === indice ? { ...r, ok: true, mensaje: `Frase añadida a «${ACCIONES[comando.accion].nombre}»` } : r)),
    )
  }

  function nuevoComando() {
    setFiltro('')
    setComandos((prev) => [{ id: `c${siguienteId.current++}`, accion: 'ac_on', frases: [], activo: true }, ...prev])
    window.setTimeout(() => nuevaFrase.current?.focus(), 0)
  }

  function exportar() {
    const texto = JSON.stringify({ ajustes, comandos }, null, 2)
    setJson(texto)
    void navigator.clipboard?.writeText(texto).catch(() => {})
  }

  function importar() {
    try {
      const datos = importarCentroVoz(JSON.parse(json), { ajustes, comandos })
      setAjustes(datos.ajustes)
      setComandos(datos.comandos)
      setResultado({ ok: true, mensaje: 'Configuracion importada' })
    } catch {
      setResultado({ ok: false, mensaje: 'El JSON no es valido' })
    }
  }

  const visibles = comandos.filter((c) => !filtro || ACCIONES[c.accion].pantalla === filtro)
  const funcionesAire = [aire.swing && 'Swing', aire.sleep && 'Sleep', aire.temporizador && 'Temporizador'].filter(Boolean).join(', ')
  const velocidad = Math.min(100, Math.max(0, data.velocidad))

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Configuraciones
      </button>
      <div>
        <h3 className="text-xl font-bold text-foreground">Centro de voz</h3>
        <p className="text-sm text-muted-foreground">
          Habla o escribe un comando, añade tus propias frases y mira como reaccionan la ventilacion y el aire acondicionado.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Seccion titulo="Asistente">
          <button
            type="button"
            onClick={alternarEscucha}
            disabled={sinVoz}
            aria-label={escuchando ? 'Dejar de escuchar' : 'Hablar'}
            className={cn(
              'relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#2EAF4A] to-[#7cf0a0] text-[#06210f] shadow-lg shadow-[#3ddc6a]/30 disabled:opacity-40',
              escuchando && 'ring-4 ring-[#3ddc6a]/50 ring-offset-2 ring-offset-card',
            )}
          >
            <Mic className="h-10 w-10" strokeWidth={2.2} />
            {escuchando ? <span className="absolute inset-0 animate-ping rounded-full bg-[#3ddc6a]/20" aria-hidden /> : null}
          </button>
          <p className="min-h-[2rem] text-center text-lg font-semibold text-muted-foreground" aria-live="polite">
            {escuchando ? vivo || 'Escuchando...' : 'Toca el microfono y habla'}
          </p>
          <div
            aria-live="polite"
            className={cn(
              'min-h-[3rem] rounded-lg px-3 py-3 text-sm',
              !resultado && 'bg-secondary/50 text-muted-foreground',
              resultado?.ok && 'bg-[#3ddc6a]/10 text-[#7cf0a0]',
              resultado && !resultado.ok && 'bg-red-500/10 text-red-300',
            )}
          >
            {resultado?.mensaje ?? 'Aqui veras que entendio el asistente.'}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void ejecutar(texto, 'texto')
              setTexto('')
            }}
          >
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="O escribe: «enciende el aire»"
              aria-label="Escribir un comando"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 basis-40 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground"
            />
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
              Probar
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ejecutar(s, 'texto')}
                className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-[#7cf0a0]"
              >
                {s}
              </button>
            ))}
          </div>
          {sinVoz ? (
            <p className="text-xs text-muted-foreground">
              Este navegador no tiene reconocimiento de voz. Usa Chrome o Edge, o prueba con el texto.
            </p>
          ) : null}
        </Seccion>

        <Seccion titulo="Estado de los equipos">
          <div className={cn('rounded-lg border border-border bg-secondary/40 p-3 transition-shadow', destello === 'vent' && 'ring-2 ring-[#3ddc6a]')}>
            <p className="font-semibold text-foreground">Ventilacion</p>
            <Dato etiqueta="Motor" valor={!lecturaViva ? 'Sin lectura' : data.estado === 'running' ? 'En marcha' : 'Detenido'} />
            <Dato etiqueta="Modo" valor={data.modo === 'MANUAL' ? 'MANUAL' : 'AUTO'} />
            <Dato etiqueta="Objetivo" valor={`${data.setpoint} °C`} />
            <Dato etiqueta="Velocidad" valor={lecturaViva && data.estado === 'running' ? `${velocidad} %` : '—'} />
            <div className="mt-2 h-2 overflow-hidden rounded bg-border">
              <div className="h-full bg-[#3ddc6a]" style={{ width: `${lecturaViva && data.estado === 'running' ? velocidad : 0}%` }} />
            </div>
          </div>
          <div className={cn('rounded-lg border border-border bg-secondary/40 p-3 transition-shadow', destello === 'ac' && 'ring-2 ring-[#3ddc6a]')}>
            <p className="font-semibold text-foreground">Aire acondicionado</p>
            <Dato etiqueta="Estado" valor={aire.encendido ? 'Encendido' : 'Apagado'} />
            <Dato etiqueta="Temperatura" valor={`${aire.objetivo} °C`} />
            <Dato etiqueta="Modo" valor={MODO_AIRE[aire.modo]} />
            <Dato etiqueta="Ventilador" valor={VENTILADOR_AIRE[aire.ventilador]} />
            <Dato etiqueta="Funciones" valor={funcionesAire || 'Ninguna'} />
            <p className="mt-2 text-[11px] text-muted-foreground">La orden del aire se guarda en la pagina hasta que la ESP32 tenga el emisor infrarrojo.</p>
          </div>
        </Seccion>

        <Seccion titulo="Comandos del asistente" className="md:col-span-2">
          <p className="text-xs text-muted-foreground">
            Frases que Hey Eco ya entiende. Para enseñar otra forma de decirlas, usa Mis comandos, mas abajo.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {VOICE_COMMAND_GROUPS.map((grupo) => (
              <div key={grupo.label} className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7cf0a0]">{grupo.label}</p>
                {grupo.commands.map(({ cmd, desc }) => (
                  <div key={cmd}>
                    <p className="text-sm font-medium text-foreground">{cmd}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Mis comandos" className="md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Cada comando ejecuta una accion. Usa <b>{'{n}'}</b> donde ira un numero: «pon el aire en {'{n}'} grados».
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as PantallaVoz | '')}
                aria-label="Filtrar por pantalla"
                className="h-10 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground"
              >
                <option value="">Todas las pantallas</option>
                <option value="vent">Ventilacion</option>
                <option value="ac">Aire acondicionado</option>
                <option value="gen">General</option>
              </select>
              <button type="button" onClick={nuevoComando} className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
                Nuevo comando
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {visibles.length === 0 ? <p className="text-xs text-muted-foreground">No hay comandos en esta pantalla.</p> : null}
            {visibles.map((c, i) => (
              <div key={c.id} className={cn('space-y-2 rounded-lg border border-border bg-secondary/40 p-3', !c.activo && 'opacity-55')}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={c.accion}
                    onChange={(e) => {
                      const valor = e.target.value
                      if (esAccion(valor)) cambiarComando(c.id, (x) => ({ ...x, accion: valor }))
                    }}
                    aria-label="Accion"
                    className="h-10 min-w-0 flex-1 basis-48 rounded-lg border border-border bg-secondary px-2 text-sm text-foreground"
                  >
                    {(['vent', 'ac', 'gen'] as const).map((p) => (
                      <optgroup key={p} label={PANTALLAS[p]}>
                        {(Object.keys(ACCIONES) as AccionVoz[])
                          .filter((a) => ACCIONES[a].pantalla === p)
                          .map((a) => (
                            <option key={a} value={a}>
                              {ACCIONES[a].nombre}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <Switch
                    checked={c.activo}
                    onCheckedChange={(activo) => cambiarComando(c.id, (x) => ({ ...x, activo }))}
                    className="data-[state=checked]:bg-green-500"
                    aria-label="Activo"
                  />
                  <button
                    type="button"
                    onClick={() => cambiarComando(c.id, () => null)}
                    className="h-10 rounded-lg border border-border px-3 text-sm text-foreground"
                  >
                    Borrar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.frases.map((f, k) => (
                    <span key={`${f}-${k}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs text-foreground">
                      {f}
                      <button
                        type="button"
                        aria-label="Quitar frase"
                        onClick={() => cambiarComando(c.id, (x) => ({ ...x, frases: x.frases.filter((_, j) => j !== k) }))}
                        className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  ref={i === 0 ? nuevaFrase : undefined}
                  type="text"
                  placeholder="Añadir frase y pulsar Enter"
                  aria-label="Nueva frase"
                  className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const valor = e.currentTarget.value.trim()
                    if (!valor) return
                    cambiarComando(c.id, (x) => ({ ...x, frases: [...x.frases, valor] }))
                    e.currentTarget.value = ''
                  }}
                />
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Ajustes">
          <Ajuste etiqueta={`Sensibilidad · ${ajustes.sensibilidad} %`} detalle="Mas alta exige que la frase se parezca mas.">
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={ajustes.sensibilidad}
              onChange={(e) => setAjustes((a) => ({ ...a, sensibilidad: Number(e.target.value) }))}
              className="w-32"
              aria-label="Sensibilidad"
            />
          </Ajuste>
          <Ajuste etiqueta="Palabra de activacion" detalle="Solo en escucha continua.">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ajustes.palabra}
                onChange={(e) => setAjustes((a) => ({ ...a, palabra: e.target.value }))}
                aria-label="Palabra"
                className="h-9 w-28 rounded-lg border border-border bg-secondary px-2 text-sm text-foreground"
              />
              <Switch
                checked={ajustes.palabraActiva}
                onCheckedChange={(palabraActiva) => setAjustes((a) => ({ ...a, palabraActiva }))}
                className="data-[state=checked]:bg-green-500"
                aria-label="Usar palabra de activacion"
              />
            </div>
          </Ajuste>
          <Ajuste etiqueta="Escucha continua">
            <Switch
              checked={ajustes.continua}
              onCheckedChange={(continua) => setAjustes((a) => ({ ...a, continua }))}
              className="data-[state=checked]:bg-green-500"
              aria-label="Escucha continua"
            />
          </Ajuste>
          <Ajuste etiqueta="Respuesta hablada">
            <Switch
              checked={ajustes.hablar}
              onCheckedChange={(hablar) => setAjustes((a) => ({ ...a, hablar }))}
              className="data-[state=checked]:bg-green-500"
              aria-label="Respuesta hablada"
            />
          </Ajuste>
          <Ajuste etiqueta="Mostrar asistente flotante" detalle="El boton de voz queda visible en la pantalla.">
            <Switch
              checked={fabVisible}
              onCheckedChange={(visible) => {
                setFabVisible(visible)
                setFabHidden(!visible)
              }}
              className="data-[state=checked]:bg-green-500"
              aria-label="Mostrar asistente flotante"
            />
          </Ajuste>
        </Seccion>

        <Seccion titulo="Historial">
          {registros.length === 0 ? <p className="text-xs text-muted-foreground">Sin comandos todavia.</p> : null}
          {registros.map((r, i) => (
            <div key={i} className="flex flex-col gap-1.5 border-t border-border py-2.5 first:border-t-0">
              <span className="text-sm text-foreground">
                <b className={r.ok ? 'text-[#7cf0a0]' : r.ignorado ? 'text-muted-foreground' : 'text-red-300'}>
                  {r.ok ? '✓' : r.ignorado ? '–' : '✕'}
                </b>{' '}
                «{r.texto}»
              </span>
              <span className="text-xs text-muted-foreground">{r.mensaje}</span>
              {!r.ok && !r.ignorado ? (
                <select
                  value=""
                  onChange={(e) => e.target.value && ensenar(i, e.target.value)}
                  aria-label="Asignar a un comando"
                  className="h-9 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground"
                >
                  <option value="">Enseñar: asignar a...</option>
                  {comandos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {ACCIONES[c.accion].nombre}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ))}
        </Seccion>

        <Seccion titulo="Exportar e importar" className="md:col-span-2">
          <p className="text-xs text-muted-foreground">Copia tu configuracion como JSON para guardarla o pasarla a otro navegador.</p>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            aria-label="Configuracion en JSON"
            spellCheck={false}
            className="h-28 w-full rounded-lg border border-border bg-secondary p-2.5 font-mono text-xs text-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportar} className="h-10 rounded-lg border border-border bg-secondary px-4 text-sm font-bold text-foreground">
              Exportar
            </button>
            <button type="button" onClick={importar} className="h-10 rounded-lg border border-border bg-secondary px-4 text-sm font-bold text-foreground">
              Importar
            </button>
            <button
              type="button"
              onClick={() => {
                setComandos(comandosDeFabrica())
                setResultado({ ok: true, mensaje: 'Comandos de fabrica restaurados' })
              }}
              className="h-10 rounded-lg border border-border bg-secondary px-4 text-sm font-bold text-foreground"
            >
              Restaurar comandos de fabrica
            </button>
          </div>
        </Seccion>
      </div>
    </div>
  )
}

function Seccion({ titulo, className, children }: { titulo: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}>
      <p className="text-lg font-semibold text-foreground">{titulo}</p>
      {children}
    </section>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border py-1.5 text-sm first-of-type:mt-1">
      <span className="text-muted-foreground">{etiqueta}</span>
      <b className="text-right text-foreground">{valor}</b>
    </div>
  )
}

function Ajuste({ etiqueta, detalle, children }: { etiqueta: string; detalle?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first-of-type:border-t-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{etiqueta}</p>
        {detalle ? <p className="text-xs text-muted-foreground">{detalle}</p> : null}
      </div>
      {children}
    </div>
  )
}
