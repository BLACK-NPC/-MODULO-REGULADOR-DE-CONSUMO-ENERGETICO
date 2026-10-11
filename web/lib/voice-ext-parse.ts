import {
  type DayRef,
  type HourRange,
  firstInt,
  parseClocks,
  parseDayRef,
  parseDaysMask,
  parseDurationMinutes,
  parseHourRange,
  prep,
} from '@/lib/voice-nlu'
import type { Metric } from '@/lib/voice-history'

export type StatMode = 'max' | 'min' | 'avg' | 'resumen' | 'total'
export type EstadoQ =
  | 'temp' | 'hum' | 'vel' | 'motor' | 'presencia' | 'sensores' | 'registros'
  | 'limites' | 'sistema' | 'nube' | 'radar'
export type AyudaCat =
  | 'consumo' | 'temperatura' | 'fallas' | 'perfiles' | 'control' | 'sistema'
  | 'aire' | 'tareas' | 'clima' | 'temporizador'
export type ConfigPane =
  | 'medicion' | 'automatizacion' | 'conectividad' | 'sistema'
  | 'servicio' | 'equipo' | 'voz' | 'alertas' | 'perfiles'

export type ClockTime = { h: number; m: number }

export interface ProfileSlots {
  name?: string
  on?: ClockTime
  off?: ClockTime
  days?: number
  sp?: number
  hum?: number
  speed?: number
  presence?: boolean
  silent?: boolean
  preventive?: boolean
  force?: boolean
}

export type AireOp =
  | { op: 'estado' }
  | { op: 'power'; on: boolean }
  | { op: 'temp'; value: number }
  | { op: 'delta'; value: number }
  | { op: 'modo'; modo: 'cool' | 'heat' | 'fan' | 'dry' | 'auto' }
  | { op: 'fan'; nivel: 'low' | 'medium' | 'high' | 'auto' }
  | { op: 'swing' | 'sleep'; on: boolean | null }
  | { op: 'horario_no' }

export type ExtCommand =
  | { k: 'hist'; metric: Metric; mode: StatMode; day: DayRef | null; range: HourRange | null }
  | { k: 'hist_compare'; metric: Metric }
  | { k: 'hist_top_day'; metric: Metric; mode: 'max' | 'min' }
  | { k: 'hist_horas'; day: DayRef | null }
  | { k: 'resumen_dia'; day: DayRef | null }
  | { k: 'falla'; q: 'hay' | 'ultima' | 'cuantas' | 'larga' | 'tiempo' | 'ayuda' | 'tarea'; day: DayRef | null }
  | { k: 'estado'; q: EstadoQ }
  | { k: 'equipo' }
  | { k: 'vel'; mode: 'set' | 'up' | 'down'; value: number }
  | { k: 'sistema'; what: 'brillo' | 'standby' | 'standby_tiempo' | 'beep'; op: 'set' | 'on' | 'off' | 'up' | 'down'; value?: number }
  | { k: 'registro'; metric: Metric | 'movimiento'; on: boolean }
  | { k: 'sensor'; sensor: Metric | 'presencia'; on: boolean }
  | { k: 'radar'; what: 'alcance' | 'retencion'; value: number }
  | { k: 'nube_leer_enviar' }
  | { k: 'bloqueado'; what: 'limites' | 'dht' | 'nube' | 'wifi' }
  | { k: 'perfil'; q: 'programar' | 'activar' | 'borrar' | 'editar' | 'listar' | 'activo' | 'proximo'; text: string; slots: ProfileSlots }
  | { k: 'timer'; q: 'crear' | 'cancelar' | 'estado'; target?: 'motor' | 'aire'; action?: 'on' | 'off'; minutes?: number; during?: boolean }
  | { k: 'aire'; a: AireOp }
  | { k: 'tareas'; q: 'estado' | 'lista' | 'crear' | 'cumplimiento'; filtro?: 'pendientes' | 'vencidas' | 'todas'; name?: string; days?: number }
  | { k: 'clima'; q: 'lluvia' | 'max' | 'min' | 'sensacion' | 'ahora'; dia: 'hoy' | 'manana' }
  | { k: 'nav'; page?: 'aire'; pane?: ConfigPane }
  | { k: 'ayuda'; cat: AyudaCat }
  | { k: 'ahorro' }

/* ---------------------------------------------------------------- utilidades */

const ON_RE = /\b(enciend\w*|prend\w*|activ\w*|arranc\w*|habilit\w*|inici\w*|empiez\w*|comienz\w*|conect\w*)\b/
const OFF_RE = /\b(apag\w*|desactiv\w*|deten\w*|detien\w*|par[ae]|desconect\w*|deshabilit\w*|deja de|dejes de|cierra)\b/
const SET_VERB_RE = /\b(pon|poner|ponle|ajusta|ajustar|fija|fijar|cambia|cambiar|deja|dejar|configura|configurar|establece|mueve|sube|subir|baja|bajar|aumenta|aumentar|reduce|reducir|incrementa|disminuye|modifica|edita)\b/
const QUESTION_RE = /\b(que|cual|cuales|cuanto|cuanta|cuantos|cuantas|como|dime|dame|esta|estan|hay|tengo|muestrame|sabes|en que)\b/

function onOff(t: string): boolean | null {
  const off = OFF_RE.test(t)
  const on = ON_RE.test(t)
  if (off && !on) return false
  if (on && !off) return true
  return null
}

function titulo(s: string): string {
  const x = s.trim().slice(0, 15)
  return x.charAt(0).toUpperCase() + x.slice(1)
}

const SPEEDS = [25, 50, 75, 100]

/* ------------------------------------------------------------------ perfiles */

const NAME_STOP = new Set([
  'nuevo', 'nueva', 'que', 'para', 'con', 'de', 'del', 'programado', 'llamado', 'activo', 'actual', 'enciende',
  'apaga', 'diario', 'entre', 'semana', 'automatico', 'manual', 'a', 'el', 'la', 'los', 'las', 'un', 'una', 'en',
  'por', 'y', 'desde', 'hasta', 'todos', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  'solo', 'como', 'se', 'si', 'no', 'fines', 'horario', 'perfil', 'encendido', 'apagado',
])

/** Datos de un perfil dichos en una frase: horas, dias, temperatura, banderas... */
export function parseProfileSlots(t: string, expect?: 'on' | 'off'): ProfileSlots {
  const slots: ProfileSlots = {}

  const named = t.match(/\b(?:llamad[oa]|de nombre|con nombre|con el nombre(?: de)?|que se llame|se llama|nombre)\s+([a-z0-9]{2,15})\b/)
  if (named && !NAME_STOP.has(named[1])) {
    slots.name = titulo(named[1])
  } else {
    const after = t.match(/\bperfil\s+(?:de\s+)?([a-z0-9]{3,15})\b/)
    if (after && !NAME_STOP.has(after[1])) slots.name = titulo(after[1])
  }

  const clocks = parseClocks(t)
  const labelOf = (index: number, i: number): 'on' | 'off' | null => {
    // Texto entre la hora anterior (o hasta 70 letras atras) y esta hora.
    const from = i > 0 ? clocks[i - 1].index : Math.max(0, index - 70)
    const before = t.slice(from, index)
    let onAt = -1
    let offAt = -1
    for (const m of before.matchAll(/enc(?:ie|e)nd\w*|prend\w*|arranc\w*|inici\w*|empiez\w*|comienz\w*|desde|arranque|activ\w*/g)) onAt = m.index ?? -1
    for (const m of before.matchAll(/apag\w*|termin\w*|deten\w*|detien\w*|\bpar[ae]\b|hasta|cierr\w*|desactiv\w*/g)) offAt = m.index ?? -1
    if (onAt < 0 && offAt < 0) return null
    return onAt > offAt ? 'on' : 'off'
  }
  const labels = clocks.map((c, i) => labelOf(c.index, i))
  clocks.forEach((c, i) => {
    const label = labels[i]
    if (label === 'on' && !slots.on) slots.on = { h: c.h, m: c.m }
    if (label === 'off' && !slots.off) slots.off = { h: c.h, m: c.m }
  })
  if (clocks.length >= 2 && !slots.on && !slots.off) {
    slots.on = { h: clocks[0].h, m: clocks[0].m }
    slots.off = { h: clocks[1].h, m: clocks[1].m }
  } else if (clocks.length === 1 && !slots.on && !slots.off && expect) {
    slots[expect] = { h: clocks[0].h, m: clocks[0].m }
  } else if (clocks.length === 1 && !slots.on && !slots.off) {
    const range = parseHourRange(t)
    if (range) {
      slots.on = { h: range.from, m: 0 }
      slots.off = { h: range.to % 24, m: 0 }
    }
  }
  if (!slots.on && !slots.off && clocks.length === 0) {
    const range = parseHourRange(t)
    if (range && /\b(desde|de|entre)\b/.test(t)) {
      slots.on = { h: range.from, m: 0 }
      slots.off = { h: range.to % 24, m: 0 }
    }
  }
  if (slots.on && slots.off) {
    const offClock = clocks.find((c) => c.h === slots.off?.h && c.m === slots.off?.m)
    if (slots.on.h < 12 && slots.off.h < 12 && slots.off.h <= slots.on.h && !(offClock?.explicit)) {
      slots.off = { h: slots.off.h + 12, m: slots.off.m }
    }
  }

  const days = parseDaysMask(t)
  if (days !== null) slots.days = days

  const grados = t.match(/\b(\d{2})\s*grados\b/) ?? t.match(/\b(?:setpoint|temperatura|objetivo)\s*(?:de|en|a|al)?\s*(\d{2})\b/)
  if (grados) slots.sp = Math.min(35, Math.max(18, Number(grados[1])))
  const hum = t.match(/\bhumedad\s*(?:maxima\s*)?(?:de|en|al|a)?\s*(\d{2})\b/)
  if (hum) slots.hum = Math.min(90, Math.max(30, Number(hum[1])))
  const vel = t.match(/\bvelocidad\s*(?:maxima\s*)?(?:de|en|al|a)?\s*(\d{1,3})\b/)
  if (vel) {
    const n = Number(vel[1])
    slots.speed = SPEEDS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 100)
  }

  if (/\b(sin presencia|sin sensor de presencia|aunque no haya (?:nadie|gente)|no (?:requiere|necesita|exijas) presencia|sin radar)\b/.test(t)) slots.presence = false
  else if (/\b(con presencia|solo si hay (?:alguien|gente)|requiere presencia|presencia obligatoria|exige presencia)\b/.test(t)) slots.presence = true
  if (/\b(silencios[oa]|modo silencio)\b/.test(t)) slots.silent = true
  if (/\b(forzar|forzad[oa]|forzando|obligar)\b/.test(t)) slots.force = true
  if (/\bventilacion preventiva\b/.test(t)) slots.preventive = true
  return slots
}

function hasSlots(s: ProfileSlots): boolean {
  return Object.keys(s).some((k) => k !== 'name')
}

function parsePerfil(t: string): ExtCommand | null {
  const mentions = /\b(perfil|perfiles|horario|horarios)\b/.test(t)
  const slots = parseProfileSlots(t)
  const verb = onOff(t)
  const hasOn = /\b(enciend\w*|prend\w*|arranc\w*|encendido)\b/.test(t)
  const hasOff = /\b(apag\w*|apagado)\b/.test(t)
  const clocks = parseClocks(t)
  const isQuestion = /^(a que hora|cuando|que hora)\b/.test(t)
  const make = (q: Extract<ExtCommand, { k: 'perfil' }>['q']): ExtCommand => ({ k: 'perfil', q, text: t, slots })

  if (/\bperfil activo\b|\b(que|cual)\b.*\b(perfil|horario)\b.*\b(activo|usando|actual|en uso|tengo puesto)\b/.test(t)) return make('activo')
  if (/\bproxim[oa]\s+(encendido|apagado)\b|\bcuando se (enciende|apaga|prende|va a encender|va a apagar)\b|\ba que hora se (enciende|apaga|prende)\b/.test(t) && !/\bmodo\b/.test(t)) {
    return make('proximo')
  }
  if (mentions && /\b(borra|borrar|elimina|eliminar|quita|quitar|suprime)\w*\b/.test(t)) return make('borrar')
  if (mentions && /\b(lista|listar|cuales|cuantos|mis|que)\b/.test(t) && /\b(perfiles|horarios|perfil)\b/.test(t) && !hasSlots(slots) && !/\b(activa|pon|cambia|usa)\w*\b/.test(t)) {
    return make('listar')
  }
  if (mentions && /\b(cambia|cambiar|modifica|modificar|ajusta|ajustar|edita|editar|pon|poner|actualiza|actualizar|ponle)\w*\b/.test(t) && hasSlots(slots) && !/\b(crea|crear|nuevo|nueva)\b/.test(t)) {
    return make('editar')
  }
  if (mentions && /\b(activa|activar|usa|usar|cambia|cambiar|pon|poner|selecciona|elige|carga|cambiate)\w*\b/.test(t) && !hasSlots(slots) && clocks.length === 0 && parseDurationMinutes(t) === null && !/\b(crea|crear|nuevo|nueva)\b/.test(t)) {
    return make('activar')
  }
  if (/\baire\b|acondicionado/.test(t)) return null
  if (mentions && /\b(crea|crear|haz|hacer|programa|programar|configura|configurar|arma|armar|agrega|agregar|anade|anadir|quiero|nuevo|nueva|necesito|genera|generar)\w*\b/.test(t)) {
    return make('programar')
  }
  if (mentions && (hasOn || hasOff) && clocks.length >= 1) return make('programar')
  if (!isQuestion && /\bprogram\w*\b/.test(t) && (hasOn || hasOff || /\b(encendido|apagado)\b/.test(t))) return make('programar')
  if (!isQuestion && verb !== null && clocks.length >= 1 && /\b(a la|a las|desde la|desde las|hasta la|hasta las)\b/.test(t) && /\b(motor|ventilador|ventilacion|equipo|sistema|modulo)\b|\b(todos los dias|entre semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fines? de semana)\b/.test(t)) {
    return make('programar')
  }
  if (!isQuestion && hasOn && hasOff && clocks.length >= 2) return make('programar')
  return null
}

/* ---------------------------------------------------------------- temporizador */

function parseTimer(t: string): ExtCommand | null {
  if (/\b(cancela|cancelar|quita|quitar|elimina|eliminar|borra|borrar|anula)\w*\s+(?:el |los |la |las )?(temporizador|temporizadores|timer|timers)\b/.test(t)) {
    return { k: 'timer', q: 'cancelar' }
  }
  if (/\b(cuanto falta|que temporizador|hay (?:algun )?temporizador|temporizadores? activos?|temporizadores? programados?)\b/.test(t)) {
    return { k: 'timer', q: 'estado' }
  }
  if (/\b(standby|suspension|brillo|pantalla|radar|retencion|sensor|registro|historial|reposo|perfil|perfiles|tarea|tareas|clima|pronostico|wifi|alarma)\b/.test(t)) return null
  const minutes = parseDurationMinutes(t)
  if (minutes === null || minutes <= 0) return null
  // Sin objetivo explicito ("apaga en 30 minutos") se entiende el motor.
  const target = /\baire\b|acondicionado/.test(t) ? 'aire' : 'motor'
  const hasOn = /\b(enciend\w*|prend\w*|arranc\w*|activ\w*)\b/.test(t)
  const hasOff = /\b(apag\w*|deten\w*|par[ae]|desactiv\w*|apagado)\b/.test(t)
  if (hasOn === hasOff) return null
  const during = /\b(por|durante)\b/.test(t) && !/\b(en|dentro de|despues de|luego de)\s+\d/.test(t)
  const timing = during || /\b(en|dentro de|despues de|luego de|a los)\b/.test(t)
  if (!timing) return null
  return { k: 'timer', q: 'crear', target, action: hasOn ? 'on' : 'off', minutes, during }
}

/* ------------------------------------------------------------------- aire */

function parseAire(t: string): ExtCommand | null {
  if (!/\baire\b|acondicionado|\bsplit\b/.test(t)) return null
  const ok = (a: AireOp): ExtCommand => ({ k: 'aire', a })
  const verb = onOff(t)
  const clocks = parseClocks(t)
  if (verb !== null && clocks.length >= 1 && /\b(a la|a las|desde|hasta)\b/.test(t)) return ok({ op: 'horario_no' })
  if (/\b(como esta|estado|que tengo|en que modo|a cuanto esta)\b/.test(t) && verb === null && !SET_VERB_RE.test(t)) return ok({ op: 'estado' })

  const swing = /\b(swing|oscil\w*|aletas?)\b/.test(t)
  if (swing) return ok({ op: 'swing', on: verb })
  if (/\b(modo (?:dormir|sleep)|dormir|sleep)\b/.test(t)) return ok({ op: 'sleep', on: verb })

  const fan = t.match(/\b(?:velocidad|ventilador)\b.*\b(baja|media|alta|automatica|auto)\b/)
  if (fan) {
    const nivel = fan[1] === 'baja' ? 'low' : fan[1] === 'media' ? 'medium' : fan[1] === 'alta' ? 'high' : 'auto'
    return ok({ op: 'fan', nivel })
  }

  const temp = t.match(/\b(\d{2})\s*(?:grados|c)?\b/)
  const grados = temp && /\bgrados\b|\bc\b/.test(t) ? Number(temp[1]) : null
  if (grados !== null && grados >= 10 && grados <= 35) {
    if (/\b(sube|subir|aumenta|aumentar|incrementa)\b/.test(t)) return ok({ op: 'delta', value: grados })
    if (/\b(baja|bajar|reduce|reducir|disminuye)\b/.test(t)) return ok({ op: 'delta', value: -grados })
    return ok({ op: 'temp', value: grados })
  }
  const n = firstInt(t)
  if (/\b(sube|subir|aumenta|aumentar|incrementa)\b/.test(t) && /\b(grado|grados|temperatura)\b/.test(t)) {
    return ok({ op: 'delta', value: n !== null && n <= 10 ? n : 1 })
  }
  if (/\b(baja|bajar|reduce|reducir|disminuye)\b/.test(t) && /\b(grado|grados|temperatura)\b/.test(t)) {
    return ok({ op: 'delta', value: -(n !== null && n <= 10 ? n : 1) })
  }
  if (/\bpon\w*\b.*\b(en|a)\s+(\d{2})\b/.test(t) && n !== null && n >= 16 && n <= 30) return ok({ op: 'temp', value: n })

  const modo = t.match(/\b(frio|calor|deshumidific\w*|seco|automatico|ventilador)\b/)
  if (modo && (/\bmodo\b/.test(t) || /\b(pon|poner|cambia|cambiar|deja|dejar|ajusta)\w*\b/.test(t))) {
    const m = modo[1]
    if (m === 'frio') return ok({ op: 'modo', modo: 'cool' })
    if (m === 'calor') return ok({ op: 'modo', modo: 'heat' })
    if (m === 'seco' || m.startsWith('deshumid')) return ok({ op: 'modo', modo: 'dry' })
    if (m === 'automatico') return ok({ op: 'modo', modo: 'auto' })
    if (m === 'ventilador' && /\bmodo\b/.test(t)) return ok({ op: 'modo', modo: 'fan' })
  }
  if (verb !== null) return ok({ op: 'power', on: verb })
  return null
}

/* ---------------------------------------------------------------- tareas */

function parseTareas(t: string): ExtCommand | null {
  if (/\bcumplimiento\b/.test(t) && !/\bperfil\b/.test(t)) return { k: 'tareas', q: 'cumplimiento' }
  if (!/\b(tarea|tareas|mantenimiento|mantenimientos)\b/.test(t)) return null
  if (/\b(crea|crear|agrega|agregar|anade|anadir|programa|programar|registra|registrar|nueva|nuevo)\w*\b/.test(t) && /\btarea\b/.test(t)) {
    const raw = t.match(/\btarea\b\s*(?:de mantenimiento|preventiva|llamada|que se llame|que diga|de)?\s*(.*)$/)
    let name = (raw?.[1] ?? '').replace(/\b(cada|todos|todas|una vez|por favor)\b.*$/, '').trim()
    name = name.replace(/^(la|el|los|las|un|una)\s+/, '')
    if (!name) name = 'revision'
    const cada = t.match(/\bcada\s+(\d+)?\s*(dia|dias|semana|semanas|mes|meses|ano|anos)\b/)
    let days = 30
    if (cada) {
      const n = cada[1] ? Number(cada[1]) : 1
      const unit = cada[2]
      days = unit.startsWith('dia') ? n : unit.startsWith('semana') ? n * 7 : unit.startsWith('mes') ? n * 30 : n * 365
    } else if (/\b(todos los dias|diaria)\b/.test(t)) days = 1
    else if (/\b(semanal|todas las semanas)\b/.test(t)) days = 7
    else if (/\b(mensual|todos los meses)\b/.test(t)) days = 30
    return { k: 'tareas', q: 'crear', name: name.slice(0, 22), days: Math.max(1, Math.min(365, days)) }
  }
  const filtro = /\bvencid\w*|\batrasad\w*/.test(t) ? 'vencidas' : /\bpendient\w*/.test(t) ? 'pendientes' : 'todas'
  if (/\b(que|cuales|lista|listar|dime|muestrame)\b/.test(t) && !/\bcuantas\b/.test(t)) return { k: 'tareas', q: 'lista', filtro }
  return { k: 'tareas', q: 'estado', filtro }
}

/* ------------------------------------------------------------- navegacion */

function parseNav(t: string): ExtCommand | null {
  if (!/^(?:(?:por favor|oye|ecopulse)\s+)?(ir|ve|vamos|abre|abrir|abreme|muestra|muestrame|llevame|entra|quiero ver|enseñame|ensename)\b/.test(t)) return null
  if (/\baire\b|acondicionado/.test(t)) return { k: 'nav', page: 'aire' }
  if (/\b(perfiles|horarios|perfil)\b/.test(t)) return { k: 'nav', pane: 'perfiles' }
  if (/\b(historial de fallas|fallas)\b/.test(t)) return { k: 'nav', pane: 'alertas' }
  if (/\b(centro de voz)\b/.test(t)) return { k: 'nav', pane: 'voz' }
  if (/\b(mantenimiento|servicio|tareas)\b/.test(t)) return { k: 'nav', pane: 'servicio' }
  if (/\b(medicion)\b/.test(t)) return { k: 'nav', pane: 'medicion' }
  if (/\b(automatizacion|encendido inteligente)\b/.test(t)) return { k: 'nav', pane: 'automatizacion' }
  if (/\b(conectividad)\b/.test(t)) return { k: 'nav', pane: 'conectividad' }
  if (/\b(equipo|perfil del equipo)\b/.test(t)) return { k: 'nav', pane: 'equipo' }
  if (/\b(a|al|la|el)\s+sistema$|\bajustes del sistema\b/.test(t)) return { k: 'nav', pane: 'sistema' }
  return null
}

/* ------------------------------------------------------------------ clima */

function parseClima(t: string): ExtCommand | null {
  const sinManana = t.replace(/\b(esta|la|de la|en la|por la)\s+manana\b/g, ' ')
  const dia: 'hoy' | 'manana' = /\bmanana\b/.test(sinManana) ? 'manana' : 'hoy'
  if (/\b(llov\w*|lluvia|lluvias|paraguas|chubasc\w*)\b/.test(t)) return { k: 'clima', q: 'lluvia', dia }
  const afuera = /\b(afuera|exterior|fuera|en la calle|clima)\b/.test(t)
  if (/\b(va a hacer|hara|estara|habra)\b.*\b(frio|calor|fresco|caliente)\b/.test(t)) return { k: 'clima', q: 'sensacion', dia }
  if (afuera && /\b(maxim\w*|pico|mas alt\w*|mas calor)\b/.test(t) && /\b(temperatura|calor)\b/.test(t)) return { k: 'clima', q: 'max', dia }
  if (afuera && /\b(minim\w*|mas baj\w*|mas frio)\b/.test(t) && /\b(temperatura|frio)\b/.test(t)) return { k: 'clima', q: 'min', dia }
  if (/\b(afuera|exterior|en la calle)\b/.test(t) && /\b(temperatura|calor|frio|humedad|grados)\b/.test(t) && !/\b(setpoint|configurad)\b/.test(t)) {
    return { k: 'clima', q: 'ahora', dia: 'hoy' }
  }
  return null
}

/* ----------------------------------------------------------------- fallas */

function parseFalla(t: string): ExtCommand | null {
  const trigger = /\b(falla|fallas|fallo|fallos|averia|averias|errores|error|problema|problemas)\b/.test(t)
  if (!trigger) return null
  if (/\bproblema\b|\bproblemas\b/.test(t) && !/\b(equipo|sistema|modulo|sensor|hay|tengo|alguna|algun)\b/.test(t)) return null
  const day = parseDayRef(t)
  const mk = (q: Extract<ExtCommand, { k: 'falla' }>['q']): ExtCommand => ({ k: 'falla', q, day })
  if (/\b(crea|crear|genera|generar|agrega|agregar|programa|registra)\w*\b.*\btarea\b/.test(t) || /\btarea correctiva\b/.test(t)) return mk('tarea')
  if (/\b(que|como)\b.*\b(hago|hacer|debo|puedo|soluciono|arreglo|reparo|resuelvo|reviso|revisar|reviso)\b/.test(t)) return mk('ayuda')
  if (/\b(cuantas?|numero de|total de|cantidad de)\b/.test(t)) return mk('cuantas')
  if (/\b(mas larga|mas duradera|duro mas|mayor duracion|mas tiempo|la peor)\b/.test(t)) return mk('larga')
  if (/\b(tiempo fuera|cuanto tiempo|cuanto duro|duracion|sin servicio)\b/.test(t)) return mk('tiempo')
  if (/\b(ultima|ultimo|reciente|anterior)\b/.test(t)) return mk('ultima')
  if (/\b(hay|existe|existen|tengo|tiene|tiene el equipo|alguna|algun|que|cual|cuales|esta|estan|activa|activas|abierta|abiertas|actual|actuales|hubo|hubieron|ocurri\w*|pasaron|sucedi\w*)\b/.test(t)) return mk('hay')
  return null
}

/* -------------------------------------------------------------- historicos */

function metricOf(t: string): Metric | null {
  const cons = /\b(consum\w*|potencia|energia|gast\w*|kwh|kilovatios?|vatios|watts?)\b/.test(t)
  if (cons) return 'potencia'
  const temp = /\b(temperatura|calor|caliente|calido|grados|frio|fresco)\b/.test(t)
  const hum = /\b(humedad|humedo)\b/.test(t)
  if (hum && !temp) return 'humedad'
  if (temp) return 'temperatura'
  return null
}

function parseHist(t: string): ExtCommand | null {
  if (/\b(variacion|variado|variar|cambiado)\b/.test(t)) return null
  // "activa el registro de temperatura" es un interruptor, no una consulta (lo maneja parseControl).
  if (/\b(registro|registros|guarda\w*|almacena\w*)\b/.test(t) && onOff(t) !== null) return null
  if (/\b(setpoint|configurad\w*|objetivo|exterior|afuera|clima|pronostico|limite|limites|sube|baja|ajusta|aire)\b/.test(t) && !/\b(consum\w*|gast\w*)\b/.test(t)) return null

  const metric = metricOf(t)
  const day = parseDayRef(t)
  const range = parseHourRange(t)
  const max = /\b(pico|picos|maxim\w*|mas alt\w*|mayor|mas calor|mas caliente|mas humedad|mas humedo|record|tope|mas consum\w*)\b/.test(t)
  const min = /\b(minim\w*|mas baj\w*|menor|mas frio|mas fresco|valle|menos consum\w*)\b/.test(t)
  const avg = /\b(promedio|media|normalmente|tipico)\b/.test(t)
  const total = /\b(total|acumulad\w*|en total|cuanta energia|kwh|kilovatios?)\b/.test(t) || /\bcuanto\s+(?:consum\w*|gast\w*)\b/.test(t)

  // Comparar con ayer / entre dias
  if (/\b(compar\w+|mas que ayer|menos que ayer|frente a ayer|respecto a ayer|comparado con ayer|que ayer|diferencia con ayer)\b/.test(t)) {
    return { k: 'hist_compare', metric: metric ?? 'potencia' }
  }
  // Dia de la semana con mas/menos
  if (/\b(que dia|cual dia|en que dia)\b/.test(t) && metric && (max || min || /\b(mas|menos|mayor|menor)\b/.test(t))) {
    return { k: 'hist_top_day', metric, mode: min || /\b(menos|menor)\b/.test(t) ? 'min' : 'max' }
  }
  // Horas de funcionamiento
  if (/\b(cuantas horas|cuanto tiempo)\b/.test(t) && /\b(estuvo|estuvieron|ha estado|estado|funciono|trabajo|consumio|encendid\w*|prendid\w*|funcionando)\b/.test(t) && (day || range)) {
    return { k: 'hist_horas', day }
  }
  // Resumen
  if (/\b(resumen|balance|reporte|informe)\b/.test(t) && /\b(del dia|de hoy|de ayer|diario|semanal|de la semana|de esta semana)\b/.test(t)) {
    return { k: 'resumen_dia', day: day ?? { kind: 'day', idx: new Date().getDay() } }
  }

  if (!metric) return null
  const current = /\b(ahora|actual|actualmente|en este momento|ahorita)\b/.test(t)
  const hasCue = Boolean(range) || Boolean(day) || max || min || avg || total || /\bdesde\b/.test(t) || /\b(historial|registro|historico)\b/.test(t)
  if (!hasCue) return null
  if (current && !range && !day && !max && !min) return null

  let mode: StatMode = 'resumen'
  if (max) mode = 'max'
  else if (min) mode = 'min'
  else if (avg) mode = 'avg'
  else if (total && metric === 'potencia') mode = 'total'
  // "el pico" sin otra pista: dia de hoy
  return { k: 'hist', metric, mode, day, range }
}

/* ------------------------------------------------------------------ control */

function parseControl(t: string): ExtCommand | null {
  const verb = onOff(t)
  const setv = SET_VERB_RE.test(t)

  // limites protegidos / modelo de sensor / radio / nube
  if (/\b(limite|limites)\b.*\b(temperatura|setpoint)\b|\btemperatura (maxima|minima) permitida\b|\b(setpoint) (maximo|minimo)\b/.test(t) && setv) return { k: 'bloqueado', what: 'limites' }
  if (/\b(dht ?(11|22)|modelo (?:del? )?sensor|cambia(?:r)? el dht)\b/.test(t) && (setv || /\bcambia\w*\b/.test(t))) return { k: 'bloqueado', what: 'dht' }
  if (/\b(apag\w*|desactiv\w*|desconect\w*)\b.*\b(wifi|wi fi|radio)\b/.test(t)) return { k: 'bloqueado', what: 'wifi' }
  const nube = t.match(/\b(?:firebase|modo nube|nube)\b\s*(?:en|a)?\s*(solo leer|solo enviar|leer y enviar|apagado|leer enviar)\b/)
  if (nube && (setv || verb !== null)) {
    return nube[1] === 'leer y enviar' || nube[1] === 'leer enviar' ? { k: 'nube_leer_enviar' } : { k: 'bloqueado', what: 'nube' }
  }

  // sensores y encendido inteligente
  const sens = t.match(/\b(?:sensor|control|medicion)\s+de\s+(temperatura|humedad|potencia|consumo|presencia|movimiento|radar)\b/)
  if (sens && verb !== null) {
    const s = sens[1]
    return { k: 'sensor', sensor: s === 'temperatura' ? 'temperatura' : s === 'humedad' ? 'humedad' : s === 'potencia' || s === 'consumo' ? 'potencia' : 'presencia', on: verb }
  }
  if (/\b(encendido inteligente|detector de presencia|radar de presencia|radar)\b/.test(t) && verb !== null && !/\b(alcance|retencion)\b/.test(t)) {
    return { k: 'sensor', sensor: 'presencia', on: verb }
  }

  // registro de datos
  const reg = t.match(/\b(?:registro|registros|guardar|guarda|guardando|almacena|almacenar|historico|historial)\s+(?:de |de los datos de |los datos de |el |la )?(temperatura|humedad|potencia|consumo|movimiento|presencia)\b/)
  if (reg && verb !== null && !/\b(que|cuales|estoy)\b/.test(t)) {
    const r = reg[1]
    return { k: 'registro', metric: r === 'consumo' || r === 'potencia' ? 'potencia' : r === 'presencia' || r === 'movimiento' ? 'movimiento' : (r as Metric), on: verb }
  }

  // radar
  const alcance = t.match(/\balcance\b.*\b(cerca|corto|media|medio|lejos|largo)\b/)
  if (alcance && (setv || verb !== null || /\b(en|a)\b/.test(t))) {
    const v = alcance[1]
    return { k: 'radar', what: 'alcance', value: v === 'cerca' || v === 'corto' ? 0 : v === 'media' || v === 'medio' ? 1 : 2 }
  }
  const ret = t.match(/\bretencion\b.*?(\d+)\s*(?:segundos?|s\b)?/)
  if (ret && (setv || /\b(en|a)\b/.test(t))) return { k: 'radar', what: 'retencion', value: Number(ret[1]) }

  // sistema
  if (/\bbrillo\b/.test(t) && !/\bautomatico\b/.test(t)) {
    const n = firstInt(t)
    if (/\b(sube|subir|aumenta|aumentar|mas)\b/.test(t) && n === null) return { k: 'sistema', what: 'brillo', op: 'up' }
    if (/\b(baja|bajar|reduce|reducir|menos|disminuye)\b/.test(t) && n === null) return { k: 'sistema', what: 'brillo', op: 'down' }
    if (n !== null && setv) return { k: 'sistema', what: 'brillo', op: 'set', value: Math.min(100, Math.max(10, n)) }
  }
  if (/\b(standby|stand by|suspension|reposo|modo espera)\b/.test(t)) {
    const seg = t.match(/\b(\d+)\s*(?:segundos?|s)\b/)
    const min = parseDurationMinutes(t)
    if (/\bnunca\b/.test(t)) return { k: 'sistema', what: 'standby_tiempo', op: 'set', value: 6 }
    if (seg || (min !== null && setv)) {
      const secs = seg ? Number(seg[1]) : (min as number) * 60
      const steps = [15, 30, 60, 120, 300, 600]
      const idx = steps.reduce((best, s, i) => (Math.abs(s - secs) < Math.abs(steps[best] - secs) ? i : best), 0)
      return { k: 'sistema', what: 'standby_tiempo', op: 'set', value: idx }
    }
    if (verb !== null) return { k: 'sistema', what: 'standby', op: verb ? 'on' : 'off' }
  }
  if (/\b(sonido de confirmacion|confirmacion sonora|beep|pitido|bip|sonido al (?:pulsar|tocar)|sonido de la pantalla)\b/.test(t) && verb !== null) {
    return { k: 'sistema', what: 'beep', op: verb ? 'on' : 'off' }
  }

  // velocidad del motor
  if (/\b(velocidad|ventilador|motor)\b/.test(t) && !/\b(grados|setpoint|temperatura|aire|consum\w*|potencia|sensor)\b/.test(t)) {
    if (/\b(al maximo|a tope|maxima velocidad|a toda)\b/.test(t) && (setv || /\bventilador\b/.test(t))) return { k: 'vel', mode: 'set', value: 100 }
    if (/\b(al minimo|minima velocidad|lo minimo)\b/.test(t) && (setv || /\bventilador\b/.test(t))) return { k: 'vel', mode: 'set', value: 25 }
    if (/\b(a la mitad|mitad de velocidad)\b/.test(t)) return { k: 'vel', mode: 'set', value: 50 }
    const abs = t.match(/\b(?:al|a|en|hasta)\s+(\d{1,3})\b\s*(?:%|por ciento)?/) ?? t.match(/\b(\d{1,3})\s*(?:%|por ciento)/)
    if (abs && (setv || !QUESTION_RE.test(t))) return { k: 'vel', mode: 'set', value: Math.min(100, Number(abs[1])) }
    const up = /\b(sube|subir|aumenta|aumentar|incrementa|acelera|mas rapido)\b/.test(t)
    const down = /\b(baja|bajar|reduce|reducir|disminuye|desacelera|mas lento|mas despacio)\b/.test(t)
    if ((up || down) && /\b(velocidad|ventilador)\b/.test(t)) {
      const n = firstInt(t)
      return { k: 'vel', mode: up ? 'up' : 'down', value: n !== null ? Math.min(100, n) : 10 }
    }
    if (setv && /\bvelocidad\b/.test(t)) {
      const n = firstInt(t)
      if (n !== null) return { k: 'vel', mode: 'set', value: Math.min(100, n) }
    }
  }
  return null
}

/* ------------------------------------------------------------------ estado */

function parseEstado(t: string): ExtCommand | null {
  // "activos / encendido / apagado" describen un estado (pregunta), no una orden.
  const estadoPalabra = /\b(activ(?:o|os|a|as|ado|ados|adas)|encendid\w*|apagad\w*|prendid\w*)\b/.test(t)
  const setv = SET_VERB_RE.test(t) || (onOff(t) !== null && !estadoPalabra)
  const q = QUESTION_RE.test(t)
  if (/\b(que|cual)\b.*\b(equipo|motor)\b.*\b(tengo|configurado|instalado|uso|usa|esta)\b|\bficha del (motor|equipo)\b|\bdatos del motor\b|\bamperaje nominal\b/.test(t) && !setv) return { k: 'equipo' }
  if (setv || !q) {
    if (/\b(hace|hay)\s+(calor|frio)\b/.test(t) && !/\b(afuera|exterior|fuera)\b/.test(t) && !setv) return { k: 'estado', q: 'temp' }
    return null
  }
  if (/\b(temperatura|grados)\b/.test(t) && !/\b(setpoint|configurad\w*|objetivo|exterior|afuera|clima|limite|limites|maxim\w*|minim\w*|pico|promedio|permitid\w*)\b/.test(t)) return { k: 'estado', q: 'temp' }
  if (/\bhumedad\b/.test(t) && !/\b(exterior|afuera|clima|maxim\w*|minim\w*|pico|promedio|limite)\b/.test(t)) return { k: 'estado', q: 'hum' }
  if (/\b(velocidad|rpm)\b/.test(t)) return { k: 'estado', q: 'vel' }
  if (/\b(esta|sigue|estan)\b.*\b(encendid\w*|prendid\w*|apagad\w*|funcionando|andando|corriendo)\b/.test(t) && /\b(motor|ventilador|equipo|sistema|modulo)\b/.test(t)) return { k: 'estado', q: 'motor' }
  if (/\b(hay|detecta\w*|detecto|siente|sientes)\b.*\b(alguien|gente|persona\w*|movimiento|presencia)\b/.test(t)) return { k: 'estado', q: 'presencia' }
  if (/\bsensores\b/.test(t) && /\b(activ\w*|encendid\w*|apagad\w*|habilit\w*|funcion\w*|tengo)\b/.test(t)) return { k: 'estado', q: 'sensores' }
  if (/\b(datos|registros|historial)\b/.test(t) && /\b(guardo|guardando|guarda|almacen\w*|registr\w*)\b/.test(t)) return { k: 'estado', q: 'registros' }
  if (/\b(limite|limites|rango)\b.*\b(temperatura|setpoint|permitid\w*)\b/.test(t) || /\btemperatura (maxima|minima) (permitida|configurada)\b/.test(t)) return { k: 'estado', q: 'limites' }
  if (/\b(brillo|standby|suspension|confirmacion sonora|beep)\b/.test(t)) return { k: 'estado', q: 'sistema' }
  if (/\b(modo nube|modo de firebase|firebase en que modo)\b/.test(t)) return { k: 'estado', q: 'nube' }
  if (/\b(alcance|retencion|radar|encendido inteligente)\b/.test(t)) return { k: 'estado', q: 'radar' }
  return null
}

/* -------------------------------------------------------------------- ayuda */

function parseAyuda(t: string): ExtCommand | null {
  if (!/\b(ayuda|ejemplos?|que puedo (?:preguntar|decir|pedir|hacer)|que sabes|que me puedes|como (?:uso|programo|pregunto))\b/.test(t)) return null
  const cat: [RegExp, AyudaCat][] = [
    [/\btemporizador|timer|apagado programado\b/, 'temporizador'],
    [/\bperfil|horario|programar\b/, 'perfiles'],
    [/\bconsumo|energia|potencia|kwh\b/, 'consumo'],
    [/\btemperatura|humedad|calor\b/, 'temperatura'],
    [/\bfalla|alerta|error\b/, 'fallas'],
    [/\baire\b|acondicionado/, 'aire'],
    [/\btarea|mantenimiento|servicio\b/, 'tareas'],
    [/\bclima|lluvia|pronostico\b/, 'clima'],
    [/\bbrillo|standby|sensor|sistema|registro\b/, 'sistema'],
    [/\bcontrol|motor|ventilador|velocidad\b/, 'control'],
  ]
  for (const [re, name] of cat) if (re.test(t)) return { k: 'ayuda', cat: name }
  return null
}

function parseAhorro(t: string): ExtCommand | null {
  if (/\b(ahorr\w*|reducir el consumo|bajar el consumo|consejo|consejos|recomend\w*|sugerenc\w*|optimiz\w*|eficien\w*)\b/.test(t) && !/\b(clima|perfil|horario)\b/.test(t)) {
    return { k: 'ahorro' }
  }
  return null
}

/* ------------------------------------------------------------------- entrada */

export function parseExtendedIntent(raw: string): ExtCommand | null {
  const t = prep(raw)
  if (!t) return null
  return (
    parseAyuda(t) ??
    parseTimer(t) ??
    parseFalla(t) ??
    parsePerfil(t) ??
    parseTareas(t) ??
    parseAire(t) ??
    parseNav(t) ??
    parseClima(t) ??
    parseHist(t) ??
    parseControl(t) ??
    parseEstado(t) ??
    parseAhorro(t)
  )
}
