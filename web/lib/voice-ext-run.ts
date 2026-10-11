import type { AVCData, FaultRecord } from '@/hooks/use-avc-data'
import type { HmiCommandResult } from '@/lib/hmi-command'
import {
  AIRE_MAX,
  AIRE_MIN,
  MODO_AIRE,
  VENTILADOR_AIRE,
  cargarAire,
  guardarAire,
  type EstadoAire,
} from '@/lib/centro-voz'
import {
  DAY_NAMES,
  SI_RE,
  NO_RE,
  decirHora,
  etiquetaDia,
  fmt,
  prep,
  type HourRange,
} from '@/lib/voice-nlu'
import {
  dateOfWeekday,
  kwh,
  loggingOn,
  hourlySeries,
  segmentsFor,
  sensorOn,
  statSegments,
  weekSegments,
  type Metric,
  type Segment,
  type Stat,
} from '@/lib/voice-history'
import {
  parseProfileSlots,
  type AyudaCat,
  type ClockTime,
  type ConfigPane,
  type ExtCommand,
  type ProfileSlots,
} from '@/lib/voice-ext-parse'
import {
  SMART_ON_CONFIG_MAX,
  activateProfile,
  createProfile,
  currentProfile,
  formatSchedule,
  loadSmartProfileStore,
  profileCommandFields,
  profileRows,
  saveSmartProfileStore,
  type SmartProfile,
} from '@/lib/smart-profiles'
import { cumplimiento, loadServicio, nextDue, saveServicio, splitTasks } from '@/lib/page-servicio'
import { loadEquipo } from '@/lib/page-equipo'
import { fetchPronostico } from '@/lib/weather'
import { speak } from '@/lib/speech-synthesis'
import { toast } from 'sonner'

export interface ExtCtx {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
  send: (fields: Record<string, unknown>) => Promise<HmiCommandResult>
  navigateAire: () => void
  openPane: (pane: ConfigPane) => void
}

export type GetCtx = () => ExtCtx

const SIGNALS = ['Temperatura', 'Humedad', 'Potencia', 'WiFi', 'Presencia', 'Nube', 'Cerebro']
const HINTS = [
  'Revisa el sensor DHT y el límite máximo.',
  'Revisa el sensor DHT y el humidificador.',
  'Revisa la carga conectada y el sensor de potencia.',
  'Revisa el router y la señal en el equipo.',
  'Revisa el radar y su cableado.',
  'Revisa internet y la conexión a Firebase.',
  'Revisa TX, RX y GND entre la pantalla y el cerebro.',
]
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const STANDBY = ['15 segundos', '30 segundos', '1 minuto', '2 minutos', '5 minutos', '10 minutos', 'nunca']
const ALCANCE = ['cerca', 'media', 'lejos']
const NUBE = ['apagado', 'solo leer', 'solo enviar', 'leer y enviar']
const UNIDAD: Record<Metric, string> = { potencia: 'vatios', temperatura: 'grados', humedad: 'por ciento' }
const NOMBRE: Record<Metric, string> = { potencia: 'consumo', temperatura: 'temperatura', humedad: 'humedad' }

/* ------------------------------------------------------------------ utilidades */

function viva(ctx: ExtCtx): boolean {
  return ctx.isDemo || (ctx.lastHeartbeatAt !== null && Date.now() - ctx.lastHeartbeatAt <= 25000)
}

const SIN_LECTURA = 'No tengo lectura reciente del equipo. Revisa que el HMI esté encendido y con WiFi.'

function valor(metric: Metric, v: number): string {
  return `${fmt(v, metric === 'potencia' ? 0 : 1)} ${UNIDAD[metric]}`
}

function diasTexto(mask: number): string {
  if (mask === 0x7f) return 'todos los días'
  if (mask === 0x1f) return 'de lunes a viernes'
  if (mask === 0x60) return 'sábados y domingos'
  const names: string[] = []
  const order = [1, 2, 3, 4, 5, 6, 0]
  order.forEach((dayIdx, bit) => {
    if ((mask & (1 << bit)) !== 0) names.push(DAY_NAMES[dayIdx])
  })
  if (names.length === 1) return `los ${names[0]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

function duracion(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60)
  if (min < 1) return 'menos de un minuto'
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(min / 60)
  const r = min % 60
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`
  return r === 0 ? horas : `${horas} y ${r} minutos`
}

function cuando(epoch: number): string {
  if (epoch < 1700000000) return 'a una hora desconocida'
  const d = new Date(epoch * 1000)
  const hora = decirHora(d.getHours(), d.getMinutes())
  if (d.toDateString() === new Date().toDateString()) return `hoy a ${hora}`
  return `el ${d.getDate()} de ${MESES[d.getMonth()]} a ${hora}`
}

function ahoraSeg(): number {
  return Math.floor(Date.now() / 1000)
}

function enviado(r: HmiCommandResult, exito: string): string {
  return r.ok ? r.mensaje || exito : r.mensaje || 'El HMI no confirmó la orden.'
}

function rangoTexto(range: HourRange | null): string {
  if (!range) return ''
  return ` entre ${decirHora(range.from % 24)} y ${decirHora(range.to % 24)}`
}

/* ---------------------------------------------------------------- histórico */

function sinDatos(ctx: ExtCtx, metric: Metric, periodo: string): string {
  const nombre = NOMBRE[metric]
  if (!loggingOn(ctx.data, metric)) {
    return `No tengo registros de ${nombre} de ${periodo} porque el registro de ${metric} está desactivado. Dime «activa el registro de ${metric}» para empezar a guardarlo.`
  }
  if (!sensorOn(ctx.data, metric)) {
    return `El sensor de ${metric} está apagado, así que no hay datos de ${nombre} de ${periodo}.`
  }
  return `Todavía no hay datos guardados de ${nombre} para ${periodo}. El HMI guarda un promedio por cada hora.`
}

function cuandoPico(dayIdx: number, h: number, multiDia: boolean): string {
  return multiDia ? `${etiquetaDia(dayIdx)} a ${decirHora(h)}` : `a ${decirHora(h)}`
}

function runHist(cmd: Extract<ExtCommand, { k: 'hist' }>, ctx: ExtCtx): string {
  const { metric, mode, range } = cmd
  const semana = cmd.day?.kind === 'week'
  const dayIdx = cmd.day?.kind === 'day' ? cmd.day.idx : new Date().getDay()
  const segs: Segment[] = semana ? weekSegments() : segmentsFor(dayIdx, range)
  const periodo = semana ? 'esta semana' : etiquetaDia(dayIdx)
  const rango = semana ? '' : rangoTexto(range)
  const stat = statSegments(ctx.data, metric, segs)
  if (!stat) return sinDatos(ctx, metric, `${periodo}${rango}`)
  const multi = semana || segs.length > 1
  const nom = NOMBRE[metric]

  if (metric === 'potencia') {
    if (mode === 'max') return `El pico de consumo ${periodo}${rango} fue de ${valor(metric, stat.max)}, ${cuandoPico(stat.maxDayIdx, stat.maxH, multi)}.`
    if (mode === 'min') return `El consumo más bajo con carga ${periodo}${rango} fue de ${valor(metric, stat.min)}, ${cuandoPico(stat.minDayIdx, stat.minH, multi)}.`
    if (mode === 'avg') return `El consumo promedio ${periodo}${rango} fue de ${valor(metric, stat.avg)}.`
    if (mode === 'total') return `${periodo === 'hoy' ? 'Hoy' : periodo[0].toUpperCase() + periodo.slice(1)}${rango} se consumieron unos ${fmt(kwh(stat), 2)} kilovatios hora, con un promedio de ${valor(metric, stat.avg)}.`
    return `${periodo[0].toUpperCase() + periodo.slice(1)}${rango} el consumo promedió ${valor(metric, stat.avg)}, con un pico de ${valor(metric, stat.max)} ${cuandoPico(stat.maxDayIdx, stat.maxH, multi)}. Energía estimada: ${fmt(kwh(stat), 2)} kilovatios hora.`
  }

  const adj = metric === 'temperatura' ? 'La temperatura' : 'La humedad'
  if (mode === 'max') return `${adj} más alta ${periodo}${rango} fue de ${valor(metric, stat.max)}, ${cuandoPico(stat.maxDayIdx, stat.maxH, multi)}.`
  if (mode === 'min') return `${adj} más baja ${periodo}${rango} fue de ${valor(metric, stat.min)}, ${cuandoPico(stat.minDayIdx, stat.minH, multi)}.`
  if (mode === 'avg') return `${adj} promedio ${periodo}${rango} fue de ${valor(metric, stat.avg)}.`
  return `${periodo[0].toUpperCase() + periodo.slice(1)}${rango} la ${nom} estuvo entre ${valor(metric, stat.min)} (${cuandoPico(stat.minDayIdx, stat.minH, multi)}) y ${valor(metric, stat.max)} (${cuandoPico(stat.maxDayIdx, stat.maxH, multi)}), con un promedio de ${valor(metric, stat.avg)}.`
}

function runCompare(metric: Metric, ctx: ExtCtx): string {
  const now = new Date()
  const hoy = now.getDay()
  const ayer = (hoy + 6) % 7
  const hasta = now.getHours() + 1
  const a = statSegments(ctx.data, metric, [{ dayIdx: hoy, from: 0, to: hasta }], now)
  const b = statSegments(ctx.data, metric, [{ dayIdx: ayer, from: 0, to: hasta }], now)
  if (!a || !b) return `No tengo datos de ${NOMBRE[metric]} de hoy y de ayer para compararlos.`
  const x = metric === 'potencia' ? kwh(a) : a.avg
  const y = metric === 'potencia' ? kwh(b) : b.avg
  const u = metric === 'potencia' ? 'kilovatios hora' : UNIDAD[metric]
  const dec = metric === 'potencia' ? 2 : 1
  const base = `A esta misma hora, hoy ${metric === 'potencia' ? 'llevas' : 'el promedio es de'} ${fmt(x, dec)} ${u} y ayer ${metric === 'potencia' ? 'llevabas' : 'era de'} ${fmt(y, dec)}`
  if (y === 0) return `${base}.`
  const pct = Math.round(((x - y) / y) * 100)
  if (pct === 0) return `${base}: prácticamente igual.`
  return `${base}: ${Math.abs(pct)} por ciento ${pct > 0 ? 'más' : 'menos'} que ayer.`
}

function runTopDay(metric: Metric, mode: 'max' | 'min', ctx: ExtCtx): string {
  const filas = weekSegments()
    .map((seg) => ({ seg, stat: statSegments(ctx.data, metric, [seg]) }))
    .filter((r): r is { seg: Segment; stat: Stat } => r.stat !== null)
  if (filas.length === 0) return sinDatos(ctx, metric, 'la semana')
  const clave = (s: Stat) => (metric === 'potencia' ? s.sum : mode === 'max' ? s.max : s.min)
  const mejor = filas.reduce((best, r) => ((mode === 'max' ? clave(r.stat) > clave(best.stat) : clave(r.stat) < clave(best.stat)) ? r : best))
  const dia = DAY_NAMES[mejor.seg.dayIdx]
  const nota = ' Guardo el último registro de cada día de la semana.'
  if (metric === 'potencia') {
    return `El día de ${mode === 'max' ? 'mayor' : 'menor'} consumo fue el ${dia}, con unos ${fmt(kwh(mejor.stat), 2)} kilovatios hora.${nota}`
  }
  const pico = mode === 'max' ? mejor.stat.max : mejor.stat.min
  const h = mode === 'max' ? mejor.stat.maxH : mejor.stat.minH
  const adj = metric === 'temperatura' ? (mode === 'max' ? 'más caluroso' : 'más fresco') : mode === 'max' ? 'más húmedo' : 'más seco'
  return `El día ${adj} fue el ${dia}, con ${valor(metric, pico)} a ${decirHora(h)}.${nota}`
}

function runHoras(day: Extract<ExtCommand, { k: 'hist_horas' }>['day'], ctx: ExtCtx): string {
  const idx = day?.kind === 'day' ? day.idx : new Date().getDay()
  const serie = hourlySeries(ctx.data, idx, 'potencia')
  const activas = serie.map((v, h) => ({ v, h })).filter((x) => x.v !== null && x.v > 0)
  const periodo = etiquetaDia(idx)
  if (serie.every((v) => v === null)) return sinDatos(ctx, 'potencia', periodo)
  if (activas.length === 0) return `No hubo consumo registrado ${periodo}: el equipo estuvo apagado.`
  const primera = activas[0].h
  const ultima = activas[activas.length - 1].h
  return `${periodo[0].toUpperCase() + periodo.slice(1)} el equipo registró consumo durante ${activas.length} ${activas.length === 1 ? 'hora' : 'horas'}, desde ${decirHora(primera)} hasta ${decirHora((ultima + 1) % 24)}.`
}

function fallasDelDia(ctx: ExtCtx, day: Extract<ExtCommand, { k: 'falla' }>['day']): { lista: FaultRecord[]; periodo: string } {
  const todas = ctx.data.diag.historial
  if (!day) return { lista: todas, periodo: 'en el historial' }
  const now = new Date()
  if (day.kind === 'week') {
    const desde = ahoraSeg() - 7 * 86400
    return { lista: todas.filter((f) => f.start >= desde), periodo: 'esta semana' }
  }
  const inicio = dateOfWeekday(day.idx, now)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  const lista = todas.filter((f) => f.start >= inicio.getTime() / 1000 && f.start < fin.getTime() / 1000)
  return { lista, periodo: etiquetaDia(day.idx) }
}

function runResumenDia(day: Extract<ExtCommand, { k: 'resumen_dia' }>['day'], ctx: ExtCtx): string {
  const partes: string[] = []
  const semana = day?.kind === 'week'
  const idx = day?.kind === 'day' ? day.idx : new Date().getDay()
  const segs = semana ? weekSegments() : [{ dayIdx: idx, from: 0, to: 24 }]
  const periodo = semana ? 'esta semana' : etiquetaDia(idx)
  const p = statSegments(ctx.data, 'potencia', segs)
  const t = statSegments(ctx.data, 'temperatura', segs)
  const h = statSegments(ctx.data, 'humedad', segs)
  if (p) partes.push(`consumo de ${fmt(kwh(p), 2)} kilovatios hora con pico de ${valor('potencia', p.max)}`)
  if (t) partes.push(`temperatura entre ${fmt(t.min, 1)} y ${fmt(t.max, 1)} grados`)
  if (h) partes.push(`humedad hasta ${fmt(h.max, 0)} por ciento`)
  const f = fallasDelDia(ctx, semana ? { kind: 'week' } : { kind: 'day', idx })
  if (ctx.data.diag.historial.length > 0) partes.push(f.lista.length === 0 ? 'sin fallas' : `${f.lista.length} ${f.lista.length === 1 ? 'falla' : 'fallas'}`)
  if (partes.length === 0) return `No tengo datos guardados para el resumen de ${periodo}. Activa el registro de potencia, temperatura y humedad en Medición.`
  return `Resumen de ${periodo}: ${partes.join('; ')}.`
}

/* ------------------------------------------------------------------- fallas */

function runFalla(cmd: Extract<ExtCommand, { k: 'falla' }>, ctx: ExtCtx): string {
  const d = ctx.data
  const journal = d.diag.historial.length > 0
  const abiertas = d.diag.historial.filter((f) => f.end === 0)
  const nombre = (f: FaultRecord) => SIGNALS[f.signal] ?? 'Señal'

  if (cmd.q === 'tarea') {
    const objetivo = abiertas[0] ?? [...d.diag.historial].sort((a, b) => b.start - a.start)[0]
    if (!objetivo) return 'No hay ninguna falla registrada para crear una tarea correctiva.'
    const store = loadServicio()
    const id = `t_${objetivo.id}`
    if (store.tasks.some((t) => t.id === id)) return `Ya existe una tarea correctiva para la falla de ${nombre(objetivo)}.`
    saveServicio({
      ...store,
      tasks: [
        ...store.tasks,
        { id, name: `Falla ${nombre(objetivo)}`.slice(0, 22), type: 'Correctivo', intervalDays: 7, reminderDays: 3, createdAt: new Date().toISOString(), lastDone: null },
      ],
    })
    return `Listo, creé la tarea correctiva «Falla ${nombre(objetivo)}» con revisión en 7 días. La ves en Configuraciones, Servicio.`
  }

  if (!journal) {
    if (!viva(ctx)) return SIN_LECTURA
    if (cmd.q === 'hay') {
      return d.diag.fallas > 0
        ? `El equipo reporta ${d.diag.fallas} ${d.diag.fallas === 1 ? 'falla abierta' : 'fallas abiertas'}, pero el detalle con hora y duración llega cuando el HMI publica el diario de fallas.`
        : 'No hay fallas reportadas en este momento. Todas las señales están en orden.'
    }
    return 'El diario de fallas todavía no llega en la lectura del HMI, así que no puedo darte fechas ni duraciones sin inventarlas.'
  }

  if (cmd.q === 'ayuda') {
    if (abiertas.length === 0) return 'No hay fallas activas, no hace falta hacer nada. Si quieres revisar el pasado, di «cuál fue la última falla».'
    return abiertas.map((f) => `${nombre(f)}: ${HINTS[f.signal]}`).join(' ') + ' Puedes decir «crea una tarea correctiva» para dejarlo anotado.'
  }

  if (cmd.q === 'hay') {
    if (abiertas.length === 0) {
      const ultima = [...d.diag.historial].sort((a, b) => b.start - a.start)[0]
      return `No hay fallas activas. Todo está en orden. La última falla fue de ${nombre(ultima)} ${cuando(ultima.start)} y duró ${duracion(ultima.end - ultima.start)}.`
    }
    const detalle = abiertas.map((f) => `${nombre(f)} desde ${cuando(f.start)}, lleva ${duracion(ahoraSeg() - f.start)}`).join('; ')
    return `Sí, hay ${abiertas.length} ${abiertas.length === 1 ? 'falla activa' : 'fallas activas'}: ${detalle}. ${HINTS[abiertas[0].signal]}`
  }

  if (cmd.q === 'ultima') {
    const ultima = [...d.diag.historial].sort((a, b) => b.start - a.start)[0]
    const estado = ultima.end === 0 ? `sigue abierta, lleva ${duracion(ahoraSeg() - ultima.start)}` : `duró ${duracion(ultima.end - ultima.start)}`
    return `La última falla fue de ${nombre(ultima)}, ${cuando(ultima.start)}; ${estado}.`
  }

  if (cmd.q === 'cuantas') {
    const { lista, periodo } = fallasDelDia(ctx, cmd.day)
    if (lista.length === 0) return `No hay fallas registradas ${periodo}.`
    const porSenal = new Map<string, number>()
    lista.forEach((f) => porSenal.set(nombre(f), (porSenal.get(nombre(f)) ?? 0) + 1))
    const resumen = [...porSenal.entries()].map(([n, c]) => `${n} ${c}`).join(', ')
    return `Hubo ${lista.length} ${lista.length === 1 ? 'falla' : 'fallas'} ${periodo}: ${resumen}. Hay ${abiertas.length} abiertas ahora.`
  }

  if (cmd.q === 'larga') {
    const dur = (f: FaultRecord) => (f.end === 0 ? ahoraSeg() : f.end) - f.start
    const mayor = [...d.diag.historial].sort((a, b) => dur(b) - dur(a))[0]
    return `La falla más larga fue de ${nombre(mayor)}, ${cuando(mayor.start)}, con ${duracion(dur(mayor))}${mayor.end === 0 ? ' y sigue abierta' : ''}.`
  }

  const total = d.diag.historial.reduce((s, f) => s + Math.max(0, (f.end === 0 ? ahoraSeg() : f.end) - f.start), 0)
  const cerradas = d.diag.historial.filter((f) => f.end !== 0)
  const recup = cerradas.length ? Math.round(cerradas.reduce((s, f) => s + (f.end - f.start), 0) / cerradas.length) : 0
  return `En total el equipo estuvo fuera de servicio ${duracion(total)} en ${d.diag.historial.length} ${d.diag.historial.length === 1 ? 'falla' : 'fallas'}${recup ? `, y tarda en recuperarse ${duracion(recup)} en promedio` : ''}.`
}

/* ------------------------------------------------------------------- estado */

function runEstado(q: Extract<ExtCommand, { k: 'estado' }>['q'], ctx: ExtCtx): string {
  const d = ctx.data
  const enMarcha = d.estado === 'running'
  const lectura = viva(ctx)
  const soloConLectura = ['temp', 'hum', 'vel', 'motor', 'presencia'].includes(q)
  if (soloConLectura && !lectura) return SIN_LECTURA

  switch (q) {
    case 'temp':
      if (!d.config.sensorTemperatura) return 'El sensor de temperatura está apagado, así que no tengo lectura.'
      return `La temperatura actual es de ${fmt(d.temperatura)} grados y el objetivo está en ${d.setpoint}.`
    case 'hum':
      if (!d.config.sensorHumedad) return 'El sensor de humedad está apagado, así que no tengo lectura.'
      return `La humedad actual es del ${fmt(d.humedad, 0)} por ciento.`
    case 'vel':
      return enMarcha
        ? `El ventilador gira al ${d.velocidad} por ciento, en modo ${d.modo === 'MANUAL' ? 'manual' : 'automático'}.`
        : `El ventilador está detenido. La velocidad guardada es ${d.velocidad} por ciento.`
    case 'motor':
      return `El motor está ${enMarcha ? 'encendido' : 'apagado'}${enMarcha ? ` al ${d.velocidad} por ciento` : ''}, en modo ${d.modo === 'MANUAL' ? 'manual' : 'automático'}.`
    case 'presencia':
      if (!d.config.sensorMovimiento) return 'El encendido inteligente está apagado, así que no estoy leyendo el radar de presencia.'
      return d.movimiento ? 'Sí, el radar detecta presencia ahora mismo.' : 'No, el radar no detecta a nadie en este momento.'
    case 'sensores': {
      const items: [string, boolean][] = [['temperatura', d.config.sensorTemperatura], ['humedad', d.config.sensorHumedad], ['potencia', d.config.sensorPotencia], ['presencia', d.config.sensorMovimiento]]
      const on = items.filter((i) => i[1]).map((i) => i[0])
      const off = items.filter((i) => !i[1]).map((i) => i[0])
      return `Activos: ${on.length ? on.join(', ') : 'ninguno'}.${off.length ? ` Apagados: ${off.join(', ')}.` : ''}`
    }
    case 'registros': {
      const items: [string, boolean][] = [['temperatura', d.config.guardarTemperatura], ['humedad', d.config.guardarHumedad], ['potencia', d.config.guardarPotencia]]
      const on = items.filter((i) => i[1]).map((i) => i[0])
      return on.length === 0 ? 'No estás guardando ningún dato. Di «activa el registro de potencia» para empezar.' : `Estás guardando: ${on.join(', ')}.${on.length < 3 ? ' El resto no se guarda.' : ''}`
    }
    case 'limites':
      return `Los límites de temperatura van de ${d.config.spMin} a ${d.config.spMax} grados. Para cambiarlos hay que usar el PIN desde Configuraciones, Medición.`
    case 'sistema':
      return `Brillo ${d.sistema.brilloOn ? `${d.sistema.brillo} por ciento` : 'desactivado'}. Standby ${d.sistema.suspensionOn ? `a los ${STANDBY[d.sistema.suspension]}` : 'desactivado'}. Sonido de confirmación ${d.sistema.beep ? 'activo' : 'apagado'}.`
    case 'nube':
      return `La nube está en modo «${NUBE[d.conectividad.firebaseModo] ?? 'apagado'}». El radio WiFi está ${d.conectividad.wifiRadio ? 'encendido' : 'apagado'}.`
    case 'radar':
      return `Encendido inteligente ${d.config.sensorMovimiento ? 'activo' : 'apagado'}. Alcance ${ALCANCE[d.automatizacion.alcance]}, retención de ${fmt(d.automatizacion.retencionMs / 1000)} segundos.`
    default:
      return 'No sé cómo responder eso todavía.'
  }
}

function runEquipo(): string {
  const p = loadEquipo().profile
  if (!p.brand && !p.model) return 'Todavía no hay un equipo configurado. Puedes cargarlo en Configuraciones, Equipo.'
  return `Tienes configurado ${p.brand} ${p.model}: ${p.watts} vatios, ${p.volts} voltios, ${fmt(p.amps)} amperios nominales y ${p.rpm} revoluciones por minuto.${p.verified ? '' : ' La ficha todavía no está verificada.'}`
}

/* ------------------------------------------------------------------- control */

async function runVel(cmd: Extract<ExtCommand, { k: 'vel' }>, ctx: ExtCtx): Promise<string> {
  const d = ctx.data
  const base = Number.isFinite(d.velocidad) ? d.velocidad : 0
  const objetivo = Math.max(0, Math.min(100, cmd.mode === 'set' ? cmd.value : cmd.mode === 'up' ? base + cmd.value : base - cmd.value))
  if (!ctx.isDemo && !viva(ctx)) return 'No puedo cambiar la velocidad: el HMI no responde en este momento.'
  let aviso = ''
  if (d.modo !== 'MANUAL') {
    const r = await ctx.send({ modo: 'MANUAL' })
    if (!r.ok) return enviado(r, 'No pude pasar a modo manual.')
    aviso = 'Pasé a modo manual para fijar la velocidad. '
  }
  const r = await ctx.send({ velocidad: objetivo })
  if (!r.ok) return enviado(r, 'No pude cambiar la velocidad.')
  const nota = d.estado === 'running' ? '' : ' El motor sigue detenido; di «enciende el motor» para arrancarlo.'
  return `${aviso}Velocidad en ${objetivo} por ciento.${nota}`
}

async function runSistema(cmd: Extract<ExtCommand, { k: 'sistema' }>, ctx: ExtCtx): Promise<string> {
  const d = ctx.data
  if (cmd.what === 'brillo') {
    const base = d.sistema.brillo
    const v = cmd.op === 'set' ? (cmd.value ?? base) : cmd.op === 'up' ? base + 10 : base - 10
    const n = Math.max(10, Math.min(100, v))
    const r = await ctx.send({ 'sistema/brillo': n })
    return r.ok ? `Brillo de la pantalla al ${n} por ciento.${d.sistema.brilloOn ? '' : ' Ojo: el control de brillo está desactivado en Sistema.'}` : enviado(r, 'No pude cambiar el brillo.')
  }
  if (cmd.what === 'standby') {
    const on = cmd.op === 'on'
    const r = await ctx.send({ 'sistema/suspensionOn': on })
    return r.ok ? `Standby ${on ? 'activado' : 'desactivado'}.` : enviado(r, 'No pude cambiar el standby.')
  }
  if (cmd.what === 'standby_tiempo') {
    const idx = Math.max(0, Math.min(6, cmd.value ?? 4))
    const r = await ctx.send({ 'sistema/suspension': idx })
    return r.ok ? `La pantalla entrará en standby ${idx === 6 ? 'nunca' : `a los ${STANDBY[idx]}`} de inactividad.` : enviado(r, 'No pude cambiar el tiempo de standby.')
  }
  const on = cmd.op === 'on'
  const r = await ctx.send({ 'sistema/beep': on })
  return r.ok ? `Sonido de confirmación ${on ? 'activado' : 'desactivado'}.` : enviado(r, 'No pude cambiar el sonido.')
}

async function runRegistro(cmd: Extract<ExtCommand, { k: 'registro' }>, ctx: ExtCtx): Promise<string> {
  const path = cmd.metric === 'potencia' ? 'config/guardarPotencia' : cmd.metric === 'temperatura' ? 'config/guardarTemperatura' : cmd.metric === 'humedad' ? 'config/guardarHumedad' : 'config/guardarMovimiento'
  const nombre = cmd.metric === 'movimiento' ? 'presencia' : cmd.metric
  const r = await ctx.send({ [path]: cmd.on })
  if (!r.ok) return enviado(r, 'No pude cambiar el registro.')
  const apagado = cmd.metric !== 'movimiento' && cmd.on && !sensorOn(ctx.data, cmd.metric) ? ` Ojo: el sensor de ${nombre} está apagado, así que no se guardará nada hasta encenderlo.` : ''
  return `Registro de ${nombre} ${cmd.on ? 'activado' : 'desactivado'}.${apagado}`
}

async function runSensor(cmd: Extract<ExtCommand, { k: 'sensor' }>, ctx: ExtCtx): Promise<string> {
  const path = cmd.sensor === 'temperatura' ? 'config/sensorTemperatura' : cmd.sensor === 'humedad' ? 'config/sensorHumedad' : cmd.sensor === 'potencia' ? 'config/sensorPotencia' : 'config/sensorMovimiento'
  const nombre = cmd.sensor === 'presencia' ? 'encendido inteligente (radar de presencia)' : `sensor de ${cmd.sensor}`
  const r = await ctx.send({ [path]: cmd.on })
  return r.ok ? `${nombre[0].toUpperCase() + nombre.slice(1)} ${cmd.on ? 'activado' : 'desactivado'}.` : enviado(r, 'No pude cambiar el sensor.')
}

async function runRadar(cmd: Extract<ExtCommand, { k: 'radar' }>, ctx: ExtCtx): Promise<string> {
  if (cmd.what === 'alcance') {
    const r = await ctx.send({ 'automatizacion/alcance': cmd.value })
    return r.ok ? `Alcance del radar en ${ALCANCE[cmd.value]}.` : enviado(r, 'No pude cambiar el alcance.')
  }
  const ms = Math.max(500, Math.min(15000, cmd.value * 1000))
  const r = await ctx.send({ 'automatizacion/retencionMs': ms })
  return r.ok ? `Retención del radar en ${fmt(ms / 1000)} segundos.` : enviado(r, 'No pude cambiar la retención.')
}

function runBloqueado(what: Extract<ExtCommand, { k: 'bloqueado' }>['what']): string {
  switch (what) {
    case 'limites':
      return 'Los límites de temperatura están protegidos con PIN, así que no los cambio por voz. Hazlo en Configuraciones, Medición, con el candado.'
    case 'dht':
      return 'Cambiar el modelo de sensor DHT reinicia el sensor y pide confirmación, así que hay que hacerlo en Configuraciones, Medición.'
    case 'wifi':
      return 'No apago el WiFi por voz: el HMI quedaría sin conexión y ya no podrías controlarlo desde aquí. Hazlo directamente en el equipo si lo necesitas.'
    default:
      return 'Ese modo de la nube dejaría al HMI sin escuchar mis órdenes y perderías el control remoto. Solo puedo ponerlo en «leer y enviar»; para otro modo usa la pantalla del equipo.'
  }
}

/* -------------------------------------------------------------------- aire */

function aireCambiar(cambio: (p: EstadoAire) => Partial<EstadoAire>): EstadoAire {
  const actual = cargarAire()
  const siguiente = { ...actual, ...cambio(actual) }
  guardarAire(siguiente)
  window.dispatchEvent(new Event('ecopulse-aire-cambio'))
  return siguiente
}

function runAire(a: Extract<ExtCommand, { k: 'aire' }>['a']): string {
  const lim = (v: number) => Math.max(AIRE_MIN, Math.min(AIRE_MAX, v))
  switch (a.op) {
    case 'estado': {
      const s = cargarAire()
      if (!s.encendido) return 'El aire acondicionado está apagado.'
      const extras = [s.swing && 'swing', s.sleep && 'modo dormir', s.temporizador && 'temporizador'].filter(Boolean).join(', ')
      return `El aire está encendido a ${s.objetivo} grados, en modo ${MODO_AIRE[s.modo].toLowerCase()}, ventilador ${VENTILADOR_AIRE[s.ventilador].toLowerCase()}${extras ? `, con ${extras}` : ''}.`
    }
    case 'power':
      aireCambiar(() => ({ encendido: a.on }))
      return `Aire acondicionado ${a.on ? 'encendido' : 'apagado'}.`
    case 'temp': {
      const v = lim(a.value)
      aireCambiar(() => ({ encendido: true, objetivo: v }))
      return `Aire a ${v} grados.${v !== a.value ? ` El rango del aire va de ${AIRE_MIN} a ${AIRE_MAX}.` : ''}`
    }
    case 'delta': {
      const s = aireCambiar((p) => ({ objetivo: lim(p.objetivo + a.value) }))
      return `${a.value > 0 ? 'Subí' : 'Bajé'} el aire a ${s.objetivo} grados.`
    }
    case 'modo':
      aireCambiar(() => ({ modo: a.modo }))
      return `Aire en modo ${MODO_AIRE[a.modo].toLowerCase()}.`
    case 'fan':
      aireCambiar(() => ({ ventilador: a.nivel }))
      return `Ventilador del aire en ${VENTILADOR_AIRE[a.nivel].toLowerCase()}.`
    case 'swing': {
      const s = aireCambiar((p) => ({ swing: a.on ?? !p.swing }))
      return `Swing ${s.swing ? 'activado' : 'desactivado'}.`
    }
    case 'sleep': {
      const s = aireCambiar((p) => ({ sleep: a.on ?? !p.sleep }))
      return `Modo dormir ${s.sleep ? 'activado' : 'desactivado'}.`
    }
    default:
      return 'Por ahora no puedo programar horarios para el aire acondicionado por voz; los perfiles con horario son del ventilador. Sí puedo usar un temporizador: «apaga el aire en una hora».'
  }
}

/* -------------------------------------------------------------- temporizadores */

interface TimerEntry {
  id: number
  label: string
  at: number
  handle: ReturnType<typeof setTimeout>
}

const timers = new Map<number, TimerEntry>()
let timerSeq = 1

async function ejecutarAccion(target: 'motor' | 'aire', on: boolean, ctx: ExtCtx): Promise<string> {
  if (target === 'aire') return runAire({ op: 'power', on })
  const r = await ctx.send({ estado: on ? 'running' : 'stopped' })
  return enviado(r, on ? 'Motor encendido.' : 'Motor apagado.')
}

function programarTimer(target: 'motor' | 'aire', on: boolean, minutes: number, getCtx: GetCtx): string {
  const id = timerSeq++
  const nombre = target === 'aire' ? 'el aire' : 'el motor'
  const label = `${on ? 'encender' : 'apagar'} ${nombre}`
  const handle = setTimeout(() => {
    timers.delete(id)
    void ejecutarAccion(target, on, getCtx()).then((msg) => {
      const texto = `Temporizador cumplido. ${msg}`
      toast.info(texto, { duration: 8000 })
      void speak(texto)
    })
  }, minutes * 60000)
  timers.set(id, { id, label, at: Date.now() + minutes * 60000, handle })
  return label
}

function textoMinutos(min: number): string {
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(min / 60)
  const r = min % 60
  return `${h} ${h === 1 ? 'hora' : 'horas'}${r ? ` y ${r} minutos` : ''}`
}

async function runTimer(cmd: Extract<ExtCommand, { k: 'timer' }>, getCtx: GetCtx): Promise<string> {
  if (cmd.q === 'cancelar') {
    const n = timers.size
    timers.forEach((t) => clearTimeout(t.handle))
    timers.clear()
    return n === 0 ? 'No había temporizadores activos.' : `Cancelé ${n} ${n === 1 ? 'temporizador' : 'temporizadores'}.`
  }
  if (cmd.q === 'estado') {
    if (timers.size === 0) return 'No hay temporizadores activos.'
    return [...timers.values()].map((t) => `Falta ${textoMinutos(Math.max(1, Math.round((t.at - Date.now()) / 60000)))} para ${t.label}`).join('. ') + '.'
  }
  const minutes = Math.max(1, Math.min(24 * 60, cmd.minutes ?? 1))
  const target = cmd.target ?? 'motor'
  const accion = cmd.action ?? 'off'
  const nota = ' Este temporizador vive en esta página: si la cierras, se cancela. Para algo que funcione siempre, programa un perfil con horario.'
  if (cmd.during) {
    const ahora = await ejecutarAccion(target, accion === 'on', getCtx())
    programarTimer(target, accion !== 'on', minutes, getCtx)
    return `${ahora} Lo ${accion === 'on' ? 'apagaré' : 'encenderé'} otra vez en ${textoMinutos(minutes)}.${nota}`
  }
  const label = programarTimer(target, accion === 'on', minutes, getCtx)
  return `Listo, voy a ${label} en ${textoMinutos(minutes)}.${nota}`
}

/* ------------------------------------------------------------------ perfiles */

function resumenDraft(d: ProfileSlots & { sp: number; presence: boolean; force: boolean }): string {
  const on = d.on as ClockTime
  const off = d.off as ClockTime
  const dias = diasTexto(d.days ?? 0x7f)
  const extra = [d.force ? 'forzando el encendido en ese horario' : '', d.presence ? 'solo con presencia' : 'sin exigir presencia', d.silent ? 'modo silencioso' : ''].filter(Boolean).join(', ')
  return `Perfil «${d.name ?? 'nuevo'}»: ${dias}, se enciende ${decirHora(on.h, on.m)} y se apaga ${decirHora(off.h, off.m)}, objetivo ${d.sp} grados, ${extra}.`
}

function completarDraft(d: ProfileSlots, ctx: ExtCtx) {
  return {
    ...d,
    sp: d.sp ?? Math.max(18, Math.min(35, Math.round(ctx.data.setpoint))),
    presence: d.presence ?? false,
    force: d.force ?? true,
  }
}

function aplicarSlots(p: SmartProfile, s: ProfileSlots): SmartProfile {
  return {
    ...p,
    hourFrom: s.on ? s.on.h : p.hourFrom,
    minFrom: s.on ? s.on.m : p.minFrom,
    hourTo: s.off ? s.off.h : p.hourTo,
    minTo: s.off ? s.off.m : p.minTo,
    daysMask: s.days ?? p.daysMask,
    setpointC: s.sp ?? p.setpointC,
    humidityMax: s.hum ?? p.humidityMax,
    speedMax: s.speed ?? p.speedMax,
    presenceRequired: s.presence ?? p.presenceRequired,
    silentMode: s.silent ?? p.silentMode,
    preventiveVent: s.preventive ?? p.preventiveVent,
    forceOnSchedule: s.force ?? p.forceOnSchedule,
  }
}

function buscarPerfil(text: string): number | null {
  const store = loadSmartProfileStore()
  const t = ` ${text} `
  let mejor = -1
  let largo = 0
  store.slots.forEach((s, i) => {
    if (!s.used) return
    const nombre = prep(s.profileName)
    if (nombre.length >= 2 && t.includes(` ${nombre} `) && nombre.length > largo) {
      mejor = i
      largo = nombre.length
    }
  })
  if (mejor < 0) return null
  const nombre = store.slots[mejor].profileName
  const variantes = store.slots.map((s, i) => ({ s, i })).filter((x) => x.s.used && x.s.profileName === nombre)
  const porVariante = variantes.find((x) => x.s.variantName && t.includes(` ${prep(x.s.variantName)} `))
  return (porVariante ?? variantes.find((x) => x.s.active) ?? variantes[0]).i
}

function descPerfil(p: SmartProfile): string {
  return `${p.profileName} ${p.variantName}, ${formatSchedule(p)}, objetivo ${p.setpointC} grados${p.forceOnSchedule ? ', fuerza el encendido' : ''}`
}

function enVentana(p: SmartProfile, d: Date): boolean {
  const mins = d.getHours() * 60 + d.getMinutes()
  const desde = p.hourFrom * 60 + p.minFrom
  const hasta = p.hourTo * 60 + p.minTo
  const bit = (day: number) => (p.daysMask & (1 << ((day + 6) % 7))) !== 0
  const hoy = d.getDay()
  const ayer = (hoy + 6) % 7
  if (desde === hasta) return bit(hoy)
  if (desde < hasta) return bit(hoy) && mins >= desde && mins < hasta
  return (bit(hoy) && mins >= desde) || (bit(ayer) && mins < hasta)
}

function cuandoFecha(d: Date, now: Date): string {
  const hora = decirHora(d.getHours(), d.getMinutes())
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
  if (dias <= 0) return `hoy a ${hora}`
  if (dias === 1) return `mañana a ${hora}`
  return `el ${DAY_NAMES[d.getDay()]} a ${hora}`
}

async function guardarYEnviar(ctx: ExtCtx, slots: SmartProfile[], idx: number, usar: boolean): Promise<{ ok: boolean; msg: string; perfil: SmartProfile }> {
  const next = activateProfile(slots, idx)
  const saved = saveSmartProfileStore({ slots: usar ? next : slots, activeIndex: usar ? idx : loadSmartProfileStore().activeIndex })
  const perfil = saved.slots[idx]
  const r = await ctx.send(profileCommandFields(perfil, usar))
  return { ok: r.ok, msg: r.mensaje, perfil }
}

let dialog: Dialog | null = null
const DIALOG_MS = 90_000

type Dialog =
  | { kind: 'perfil'; draft: ProfileSlots; step: 'on' | 'off' | 'days' | 'confirm'; expires: number }
  | { kind: 'confirmar'; accion: (ctx: ExtCtx) => Promise<string>; expires: number }

function pasoPerfil(d: ProfileSlots): 'on' | 'off' | 'days' | 'confirm' {
  if (!d.on) return 'on'
  if (!d.off) return 'off'
  if (d.days === undefined) return 'days'
  return 'confirm'
}

const PREGUNTA: Record<'on' | 'off' | 'days', string> = {
  on: '¿A qué hora quieres que se encienda el equipo?',
  off: '¿Y a qué hora quieres que se apague?',
  days: '¿Qué días? Puedes decir lunes a viernes, fines de semana, todos los días o días sueltos.',
}

function preguntarPerfil(ctx: ExtCtx): string {
  if (!dialog || dialog.kind !== 'perfil') return ''
  dialog.step = pasoPerfil(dialog.draft)
  dialog.expires = Date.now() + DIALOG_MS
  if (dialog.step !== 'confirm') return PREGUNTA[dialog.step]
  const d = completarDraft(dialog.draft, ctx)
  return `${resumenDraft(d)} ¿Lo guardo y lo activo? Di sí o no, o dime qué cambiar.`
}

async function guardarPerfilVoz(draft: ProfileSlots, ctx: ExtCtx): Promise<string> {
  const d = completarDraft(draft, ctx)
  const store = loadSmartProfileStore()
  let slots = store.slots.map((s) => ({ ...s }))
  const nombre = d.name ? d.name.slice(0, 15) : undefined
  let idx = nombre ? slots.findIndex((s) => s.used && prep(s.profileName) === prep(nombre)) : -1
  const existia = idx >= 0
  if (idx < 0) {
    const creado = createProfile(slots)
    if (!creado) return `No hay espacio para otro perfil: el límite es ${SMART_ON_CONFIG_MAX}. Borra uno diciendo «borra el perfil» y su nombre.`
    slots = creado.slots
    idx = creado.index
    if (nombre) slots[idx] = { ...slots[idx], profileName: nombre }
  }
  slots[idx] = aplicarSlots(slots[idx], {
    on: d.on,
    off: d.off,
    days: d.days,
    sp: d.sp,
    hum: d.hum,
    speed: d.speed,
    presence: d.presence,
    silent: d.silent,
    preventive: d.preventive,
    force: d.force,
  })
  const r = await guardarYEnviar(ctx, slots, idx, true)
  const nota = d.presence && !ctx.data.config.sensorMovimiento ? ' Ojo: pediste presencia pero el encendido inteligente está apagado; actívalo para que funcione.' : ''
  if (!r.ok) return `Guardé el perfil «${r.perfil.profileName}» en esta página, pero el HMI no confirmó: ${r.msg || 'sin respuesta'}.`
  return `Listo. ${existia ? 'Actualicé' : 'Creé'} y activé el perfil «${r.perfil.profileName}»: ${diasTexto(r.perfil.daysMask)}, de ${decirHora(r.perfil.hourFrom, r.perfil.minFrom)} a ${decirHora(r.perfil.hourTo, r.perfil.minTo)}, a ${r.perfil.setpointC} grados.${nota}`
}

async function runPerfil(cmd: Extract<ExtCommand, { k: 'perfil' }>, ctx: ExtCtx): Promise<string> {
  const store = loadSmartProfileStore()

  if (cmd.q === 'listar') {
    const filas = profileRows(store.slots)
    if (filas.length === 0) return 'No tienes perfiles guardados. Di «crea un perfil» para armar uno.'
    const lista = filas.slice(0, 6).map((f) => `${f.profile.profileName}, ${formatSchedule(f.profile)}`).join('; ')
    return `Tienes ${filas.length} ${filas.length === 1 ? 'perfil' : 'perfiles'}: ${lista}${filas.length > 6 ? ' y más' : ''}.`
  }

  if (cmd.q === 'activo') {
    const p = currentProfile(store)
    return p ? `El perfil activo es ${descPerfil(p)}.` : 'No hay ningún perfil activo.'
  }

  if (cmd.q === 'proximo') {
    const p = currentProfile(store)
    if (!p) return 'No hay un perfil activo, así que no hay horario programado.'
    const now = new Date()
    now.setSeconds(0, 0)
    const dentro = enVentana(p, now)
    let cambio: Date | null = null
    for (let i = 1; i <= 7 * 1440; i += 1) {
      const d = new Date(now.getTime() + i * 60000)
      if (enVentana(p, d) !== dentro) {
        cambio = d
        break
      }
    }
    const fuerza = p.forceOnSchedule ? '' : ' Ojo: este perfil no fuerza el encendido; solo regula cuando hay presencia o sube la temperatura.'
    if (!cambio) return `El perfil ${p.profileName} cubre todo el tiempo, sin cambios de horario.${fuerza}`
    return dentro
      ? `Ahora estás dentro del horario del perfil ${p.profileName}. Termina ${cuandoFecha(cambio, now)}.${fuerza}`
      : `El perfil ${p.profileName} empieza ${cuandoFecha(cambio, now)}.${fuerza}`
  }

  if (cmd.q === 'activar') {
    const idx = buscarPerfil(cmd.text)
    if (idx === null) {
      const nombres = profileRows(store.slots).map((f) => f.profile.profileName).join(', ')
      return `No encontré ese perfil. Tus perfiles son: ${nombres || 'ninguno'}.`
    }
    const slots = store.slots
    const r = await guardarYEnviar(ctx, slots, idx, true)
    return r.ok ? `Perfil ${r.perfil.profileName} activado: ${formatSchedule(r.perfil)}.` : `Cambié el perfil en esta página, pero el HMI no confirmó: ${r.msg || 'sin respuesta'}.`
  }

  if (cmd.q === 'borrar') {
    const idx = buscarPerfil(cmd.text)
    if (idx === null) return 'No encontré ese perfil. Dime «lista mis perfiles» para ver los nombres.'
    const nombre = store.slots[idx].profileName
    if (profileRows(store.slots).length <= 1) return 'Es tu único perfil, no lo borro para que no te quedes sin horario.'
    dialog = {
      kind: 'confirmar',
      expires: Date.now() + DIALOG_MS,
      accion: async (c) => {
        const actual = loadSmartProfileStore()
        const quitados = actual.slots.filter((s) => s.used && s.profileName === nombre)
        const slots = actual.slots.map((s) => (s.used && s.profileName === nombre ? { ...s, used: false, active: false } : s))
        saveSmartProfileStore({ slots, activeIndex: actual.activeIndex })
        let falla = ''
        for (const q of quitados) {
          const r = await c.send(profileCommandFields(q, false, true))
          if (!r.ok) falla = r.mensaje
        }
        return falla ? `Lo borré de esta página, pero el HMI no confirmó: ${falla}` : `Perfil ${nombre} borrado.`
      },
    }
    return `¿Seguro que borro el perfil ${nombre}? Di sí o no.`
  }

  if (cmd.q === 'editar') {
    let idx = buscarPerfil(cmd.text)
    if (idx === null) idx = store.slots[store.activeIndex]?.used ? store.activeIndex : null
    if (idx === null) return 'No hay un perfil para modificar. Di «crea un perfil» para armar uno.'
    const slots = store.slots.map((s) => ({ ...s }))
    const { name: _ignorado, ...cambios } = cmd.slots
    void _ignorado
    slots[idx] = aplicarSlots(slots[idx], cambios)
    const r = await guardarYEnviar(ctx, slots, idx, idx === store.activeIndex)
    return r.ok ? `Listo, actualicé el perfil ${r.perfil.profileName}: ${formatSchedule(r.perfil)}, objetivo ${r.perfil.setpointC} grados.` : `Actualicé el perfil en esta página, pero el HMI no confirmó: ${r.msg || 'sin respuesta'}.`
  }

  // programar: conversación hasta tener hora de encendido, apagado y días
  dialog = { kind: 'perfil', draft: { ...cmd.slots }, step: 'on', expires: Date.now() + DIALOG_MS }
  return preguntarPerfil(ctx)
}

/** Continua una conversacion abierta (perfil o confirmacion). undefined = no habia nada que continuar. */
export async function continueDialog(raw: string, intentIsUnknown: boolean, getCtx: GetCtx): Promise<string | null | undefined> {
  if (!dialog) return undefined
  if (Date.now() > dialog.expires) {
    dialog = null
    return undefined
  }
  const ctx = getCtx()
  const t = prep(raw)
  const actual = dialog

  if (actual.kind === 'confirmar') {
    if (NO_RE.test(t) && !SI_RE.test(t)) {
      dialog = null
      return 'Listo, lo dejé como estaba.'
    }
    if (SI_RE.test(t)) {
      dialog = null
      return actual.accion(ctx)
    }
    if (!intentIsUnknown) {
      dialog = null
      return undefined
    }
    actual.expires = Date.now() + DIALOG_MS
    return 'Dime sí o no.'
  }

  if (NO_RE.test(t) && !SI_RE.test(t) && !/\b(no|sin)\s+(?:exijas|requiere|necesita)\b/.test(t) && !/\bsin presencia\b/.test(t)) {
    dialog = null
    return 'Listo, cancelé el perfil.'
  }
  const expect = actual.step === 'on' || actual.step === 'off' ? actual.step : undefined
  const slots = parseProfileSlots(t, expect)
  // una hora suelta sin "a las" ("las 7", "7", "siete")
  if (expect && !slots[expect]) {
    const solo = t.match(/^(?:a\s+)?(?:las?\s+)?(\d{1,2})(?::(\d{2}))?$/)
    if (solo) slots[expect] = { h: Math.min(23, Number(solo[1])), m: Number(solo[2] ?? 0) }
  }
  if (actual.step === 'days' && slots.days === undefined && /^(todos|siempre|diario|cada dia)\b/.test(t)) slots.days = 0x7f
  const hay = Object.keys(slots).length > 0

  if (actual.step === 'confirm' && SI_RE.test(t) && !hay) {
    dialog = null
    return guardarPerfilVoz(actual.draft, ctx)
  }
  if (!hay) {
    if (!intentIsUnknown) {
      dialog = null
      return undefined
    }
    return actual.step === 'confirm' ? 'Dime sí para guardarlo, no para cancelar, o qué quieres cambiar.' : `No te entendí. ${PREGUNTA[actual.step as 'on' | 'off' | 'days']}`
  }

  const draft: ProfileSlots = { ...actual.draft, ...slots }
  if (slots.on && !slots.off && draft.off && draft.on && draft.on.h < 12 && draft.off.h < 12 && draft.off.h <= draft.on.h) {
    draft.off = { h: draft.off.h + 12, m: draft.off.m }
  }
  if (slots.off && !slots.on && draft.on && draft.on.h < 12 && slots.off.h < 12 && slots.off.h <= draft.on.h && !/\b(am|manana|madrugada)\b/.test(t)) {
    draft.off = { h: slots.off.h + 12, m: slots.off.m }
  }
  actual.draft = draft
  return preguntarPerfil(ctx)
}

/* -------------------------------------------------------------------- tareas */

function runTareas(cmd: Extract<ExtCommand, { k: 'tareas' }>): string {
  const store = loadServicio()
  const { pendientes, vencidas } = splitTasks(store.tasks)
  if (cmd.q === 'cumplimiento') {
    const c = cumplimiento(store)
    return `Esta semana llevas ${c.hechas} ${c.hechas === 1 ? 'tarea hecha' : 'tareas hechas'} y ${c.vencidas} ${c.vencidas === 1 ? 'vencida' : 'vencidas'}: cumplimiento del ${c.actual} por ciento. La semana pasada hiciste ${c.pasadas}.`
  }
  if (cmd.q === 'crear') {
    const name = (cmd.name ?? 'Revision').trim()
    const nombre = name.charAt(0).toUpperCase() + name.slice(1)
    const dias = cmd.days ?? 30
    saveServicio({
      ...store,
      tasks: [
        ...store.tasks,
        { id: `t_${Date.now()}`, name: nombre, type: 'Preventivo', intervalDays: dias, reminderDays: Math.min(3, dias), createdAt: new Date().toISOString(), lastDone: null },
      ],
    })
    return `Listo, agregué la tarea «${nombre}», preventiva, cada ${dias} ${dias === 1 ? 'día' : 'días'}.`
  }
  const base = cmd.filtro === 'vencidas' ? vencidas : cmd.filtro === 'pendientes' ? pendientes : store.tasks
  const etiqueta = cmd.filtro === 'vencidas' ? 'vencidas' : cmd.filtro === 'pendientes' ? 'pendientes' : 'en total'
  if (cmd.q === 'estado') {
    if (store.tasks.length === 0) return 'No tienes tareas de mantenimiento. Di «agrega la tarea revisar filtros cada 30 días» para crear una.'
    const detalle = cmd.filtro === 'todas' ? ` ${pendientes.length} pendientes y ${vencidas.length} vencidas.` : ''
    const nombres = vencidas.slice(0, 3).map((t) => t.name).join(', ')
    return `Tienes ${base.length} ${base.length === 1 ? 'tarea' : 'tareas'} ${etiqueta}.${detalle}${vencidas.length && cmd.filtro !== 'pendientes' ? ` Vencidas: ${nombres}.` : ''}`
  }
  if (base.length === 0) return `No hay tareas ${etiqueta}.`
  return `Tareas ${etiqueta}: ${base.slice(0, 6).map((t) => `${t.name}, toca el ${nextDue(t).getDate()} de ${MESES[nextDue(t).getMonth()]}`).join('; ')}.`
}

/* --------------------------------------------------------------------- clima */

async function runClima(cmd: Extract<ExtCommand, { k: 'clima' }>, ctx: ExtCtx): Promise<string> {
  const ciudad = (typeof window !== 'undefined' && window.localStorage.getItem('ecopulse-reco-ciudad')) || 'Cali'
  let p
  try {
    p = await fetchPronostico(ciudad)
  } catch (err) {
    return err instanceof Error ? err.message : 'No pude consultar el clima.'
  }
  if (cmd.q === 'ahora') {
    const dentro = viva(ctx) && ctx.data.config.sensorTemperatura ? ` Adentro hay ${fmt(ctx.data.temperatura)} grados.` : ''
    return `Afuera en ${p.ciudad} hay ${fmt(p.temperatura)} grados y humedad del ${fmt(p.humedad, 0)} por ciento.${dentro}`
  }
  const fechas = [...new Set(p.horas.map((h) => h.hora.slice(0, 10)))].sort()
  const fecha = cmd.dia === 'manana' ? fechas[1] : fechas[0]
  const horas = p.horas.filter((h) => h.hora.startsWith(fecha ?? ''))
  if (horas.length === 0) return 'No tengo pronóstico para ese día.'
  const cuandoDia = cmd.dia === 'manana' ? 'mañana' : 'hoy'
  const hora = (h: { hora: string }) => decirHora(Number(h.hora.slice(11, 13)))
  const max = horas.reduce((a, b) => (b.temperatura > a.temperatura ? b : a))
  const min = horas.reduce((a, b) => (b.temperatura < a.temperatura ? b : a))
  if (cmd.q === 'lluvia') {
    const conLluvia = horas.filter((h) => h.lluvia !== null)
    if (conLluvia.length === 0) return 'El pronóstico no trae probabilidad de lluvia.'
    const pico = conLluvia.reduce((a, b) => ((b.lluvia ?? 0) > (a.lluvia ?? 0) ? b : a))
    const prob = pico.lluvia ?? 0
    if (prob < 20) return `${cuandoDia[0].toUpperCase() + cuandoDia.slice(1)} en ${p.ciudad} es poco probable que llueva: máximo ${prob} por ciento.`
    return `${cuandoDia[0].toUpperCase() + cuandoDia.slice(1)} en ${p.ciudad} hay hasta ${prob} por ciento de probabilidad de lluvia, sobre ${hora(pico)}.`
  }
  if (cmd.q === 'max') return `La temperatura máxima ${cuandoDia} afuera en ${p.ciudad} será de ${fmt(max.temperatura)} grados, a ${hora(max)}.`
  if (cmd.q === 'min') return `La temperatura mínima ${cuandoDia} afuera en ${p.ciudad} será de ${fmt(min.temperatura)} grados, a ${hora(min)}.`
  const sensacion = max.temperatura >= 30 ? 'Va a hacer calor' : min.temperatura <= 17 ? 'Va a hacer frío' : 'Estará templado'
  return `${sensacion} ${cuandoDia} en ${p.ciudad}: entre ${fmt(min.temperatura)} y ${fmt(max.temperatura)} grados.`
}

/* ------------------------------------------------------------------ ayuda y ahorro */

const AYUDA: Record<AyudaCat, string> = {
  consumo: 'Sobre consumo prueba: «consumo desde las 8 hasta las 12», «cuánto consumí ayer», «cuál fue el pico de consumo esta semana», «compara el consumo de hoy con ayer», «qué día consumió más» o «cuántas horas estuvo encendido hoy».',
  temperatura: 'Sobre temperatura y humedad prueba: «cuál fue el pico más alto de calor hoy», «humedad máxima de ayer», «temperatura promedio de la tarde», «a qué hora hizo más calor el martes» o «qué temperatura hay ahora».',
  fallas: 'Sobre fallas prueba: «hay alguna falla», «cuál fue la última falla», «cuántas fallas hubo esta semana», «cuál fue la falla más larga», «qué hago con la falla» o «crea una tarea correctiva».',
  perfiles: 'Para perfiles prueba: «crea un perfil que encienda a las 7 de la mañana y apague a las 5 de la tarde de lunes a viernes», «activa el perfil oficina», «qué perfil está activo», «cuándo se enciende el equipo», «cambia la hora de apagado del perfil oficina a las 6 de la tarde», «lista mis perfiles» o «borra el perfil vacaciones».',
  control: 'Para controlar el ventilador prueba: «enciende el motor», «velocidad al 60», «sube la velocidad 10», «ventilador al máximo», «modo automático» o «pon el setpoint en 24».',
  sistema: 'Para ajustes prueba: «brillo al 70», «activa el standby», «standby en 5 minutos», «desactiva el sonido de confirmación», «activa el registro de temperatura», «apaga el sensor de humedad», «alcance del radar media» o «retención 5 segundos».',
  aire: 'Para el aire acondicionado prueba: «enciende el aire», «aire a 22 grados», «sube el aire 2 grados», «modo calor», «velocidad del aire alta», «activa el swing» o «cómo está el aire».',
  tareas: 'Para mantenimiento prueba: «cuántas tareas pendientes hay», «hay tareas vencidas», «agrega la tarea revisar filtros cada 30 días» o «cómo va el cumplimiento».',
  clima: 'Para el clima prueba: «va a llover hoy», «cuál es la temperatura máxima de mañana afuera», «va a hacer frío» o «qué temperatura hay afuera».',
  temporizador: 'Para temporizadores prueba: «apaga el motor en 30 minutos», «enciende el aire por una hora», «cuánto falta para el apagado» o «cancela el temporizador».',
}

function runAhorro(ctx: ExtCtx): string {
  const d = ctx.data
  const tips: string[] = []
  const perfil = currentProfile(loadSmartProfileStore())
  if (!perfil) tips.push('Programa un perfil con horario para que el equipo no trabaje cuando no hace falta')
  else if (!perfil.forceOnSchedule && !d.config.sensorMovimiento) tips.push('Activa el encendido inteligente para que el equipo se apague solo cuando no hay nadie')
  if (d.modo === 'MANUAL' && d.estado === 'running' && d.velocidad >= 80) tips.push('Estás en manual a velocidad alta; en automático el ventilador baja solo cuando ya no hace falta')
  if (d.setpoint <= 22) tips.push(`Tu objetivo está en ${d.setpoint} grados; subirlo uno o dos grados suele reducir el consumo`)
  if (!d.config.guardarPotencia) tips.push('Activa el registro de potencia para ver en qué horas consumes más')
  if (!d.config.sensorMovimiento && tips.length < 3) tips.push('El radar de presencia está apagado; con él el equipo puede bajar cuando la habitación está vacía')
  if (tips.length === 0) return 'Tu configuración ya está bien afinada: perfil activo, automático y registros encendidos. Pregúntame «cuál fue el pico de consumo» para ver en qué hora puedes mejorar.'
  return `Te sugiero: ${tips.slice(0, 3).map((t, i) => `${i + 1}, ${t}`).join('. ')}.`
}

/* -------------------------------------------------------------------- entrada */

export async function runExt(cmd: ExtCommand, getCtx: GetCtx): Promise<string> {
  const ctx = getCtx()
  switch (cmd.k) {
    case 'hist':
      return runHist(cmd, ctx)
    case 'hist_compare':
      return runCompare(cmd.metric, ctx)
    case 'hist_top_day':
      return runTopDay(cmd.metric, cmd.mode, ctx)
    case 'hist_horas':
      return runHoras(cmd.day, ctx)
    case 'resumen_dia':
      return runResumenDia(cmd.day, ctx)
    case 'falla':
      return runFalla(cmd, ctx)
    case 'estado':
      return runEstado(cmd.q, ctx)
    case 'equipo':
      return runEquipo()
    case 'vel':
      return runVel(cmd, ctx)
    case 'sistema':
      return runSistema(cmd, ctx)
    case 'registro':
      return runRegistro(cmd, ctx)
    case 'sensor':
      return runSensor(cmd, ctx)
    case 'radar':
      return runRadar(cmd, ctx)
    case 'nube_leer_enviar': {
      const r = await ctx.send({ 'conectividad/firebaseModo': 3 })
      return r.ok ? 'Nube en modo leer y enviar.' : enviado(r, 'No pude cambiar el modo de la nube.')
    }
    case 'bloqueado':
      return runBloqueado(cmd.what)
    case 'perfil':
      return runPerfil(cmd, ctx)
    case 'timer':
      return runTimer(cmd, getCtx)
    case 'aire':
      return runAire(cmd.a)
    case 'tareas':
      return runTareas(cmd)
    case 'clima':
      return runClima(cmd, ctx)
    case 'nav':
      if (cmd.page === 'aire') {
        ctx.navigateAire()
        return 'Abriendo Aire acondicionado.'
      }
      if (cmd.pane) {
        ctx.openPane(cmd.pane)
        return 'Abriendo.'
      }
      return 'No sé a dónde ir.'
    case 'ayuda':
      return AYUDA[cmd.cat]
    case 'ahorro':
      return runAhorro(ctx)
    default:
      return 'No entendí ese comando.'
  }
}
