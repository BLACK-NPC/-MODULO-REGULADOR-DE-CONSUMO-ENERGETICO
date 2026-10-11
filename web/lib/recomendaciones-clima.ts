import type { Pronostico } from '@/lib/weather'
import { formatSchedule, type SmartProfile } from '@/lib/smart-profiles'

export const LEAD_OPCIONES = [10, 15, 20, 30, 45] as const
export const LEAD_POR_DEFECTO = 20

const VELOCIDADES = [25, 50, 75, 100]

export type AccionReco =
  | { tipo: 'ahorro'; etiqueta: string; speedMax: number }
  | { tipo: 'adelanto'; etiqueta: string; hourFrom: number; minFrom: number }
  | { tipo: 'preventiva'; etiqueta: string }

export interface Reco {
  id: 'ahorro' | 'adelanto' | 'normal' | 'humedad'
  titulo: string
  parrafos: string[]
  pregunta?: string
  accion?: AccionReco
}

export interface VentanaClima {
  desde: string
  hasta: string
  minima: number
  maxima: number
  horaMaxima: number
  humedadMaxima: number
  lluviaMaxima: number | null
}

export interface ResultadoReco {
  ventana: VentanaClima | null
  items: Reco[]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function horaTexto(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`
}

export function describirPerfil(perfil: SmartProfile) {
  const nombre = perfil.variantName ? `${perfil.profileName} (${perfil.variantName})` : perfil.profileName
  return `perfil ${nombre}, ${formatSchedule(perfil)}, objetivo ${perfil.setpointC} C y velocidad maxima ${perfil.speedMax} %`
}

function aplicaHoy(perfil: SmartProfile, fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  return (perfil.daysMask & (1 << ((dia + 6) % 7))) !== 0
}

function bajarVelocidad(actual: number) {
  const menores = VELOCIDADES.filter((valor) => valor < actual)
  return menores.length > 0 ? menores[menores.length - 1] : null
}

export function restarMinutos(hour: number, minute: number, minutos: number) {
  const total = Math.max(0, hour * 60 + minute - minutos)
  return { hour: Math.floor(total / 60), minute: total % 60 }
}

export function ventanaDelDia(perfil: SmartProfile, pron: Pronostico): VentanaClima | null {
  const fecha = pron.publicado.slice(0, 10)
  const inicio = perfil.hourFrom
  const fin = perfil.hourTo < perfil.hourFrom ? perfil.hourTo + 24 : perfil.hourTo
  const lista = pron.horas.filter((item) => item.hora.startsWith(fecha))
  const base = pron.horas.findIndex((item) => item.hora.startsWith(fecha))
  if (base < 0 || lista.length === 0) return null

  const horas = pron.horas
    .slice(base + inicio, base + fin + (perfil.minTo > 0 || fin === inicio ? 1 : 0))
    .filter((item) => Number.isFinite(item.temperatura))
  if (horas.length === 0) return null

  const maxima = horas.reduce((a, b) => (b.temperatura > a.temperatura ? b : a))
  const lluvias = horas.map((item) => item.lluvia).filter((v): v is number => v !== null)
  return {
    desde: horaTexto(perfil.hourFrom, perfil.minFrom),
    hasta: horaTexto(perfil.hourTo, perfil.minTo),
    minima: Math.round(Math.min(...horas.map((item) => item.temperatura))),
    maxima: Math.round(maxima.temperatura),
    horaMaxima: Number(maxima.hora.slice(11, 13)),
    humedadMaxima: Math.round(Math.max(...horas.map((item) => item.humedad).filter(Number.isFinite))),
    lluviaMaxima: lluvias.length > 0 ? Math.max(...lluvias) : null,
  }
}

export function generarRecomendaciones(perfil: SmartProfile, pron: Pronostico, lead: number): ResultadoReco {
  const fecha = pron.publicado.slice(0, 10)
  const horaAhora = Number(pron.publicado.slice(11, 13))
  const minAhora = Number(pron.publicado.slice(14, 16))

  if (!aplicaHoy(perfil, fecha)) {
    return {
      ventana: null,
      items: [
        {
          id: 'normal',
          titulo: 'Hoy tu equipo descansa',
          parrafos: [
            `Hoy tu perfil activo no tiene horario, asi que tu equipo puede descansar. Aprovecha: ${pron.ciudad} marca ${Math.round(pron.temperatura)} C ahora mismo.`,
            `Actualmente lo tienes asi: ${describirPerfil(perfil)}.`,
          ],
        },
      ],
    }
  }

  const ventana = ventanaDelDia(perfil, pron)
  if (!ventana) {
    return { ventana: null, items: [] }
  }

  const diferencia = ventana.maxima - perfil.setpointC
  const configurado = `Actualmente lo tienes asi: ${describirPerfil(perfil)}.`
  const items: Reco[] = []
  const antesDelInicio = horaAhora * 60 + minAhora < perfil.hourFrom * 60 + perfil.minFrom

  if (diferencia <= -2) {
    const nueva = bajarVelocidad(perfil.speedMax)
    const clima = ventana.maxima < 18 ? 'algo de frio' : 'un dia fresco'
    items.push({
      id: 'ahorro',
      titulo: `Hoy hara ${clima}`,
      parrafos: [
        `Hola. Hoy hara ${clima}: durante tu horario (${ventana.desde} a ${ventana.hasta}) la maxima sera de ${ventana.maxima} C, por debajo del objetivo de ${perfil.setpointC} C. Tu equipo casi no tendra que esforzarse, y eso tambien cuida su vida util.`,
        configurado,
      ],
      pregunta:
        nueva !== null
          ? `Quieres que baje la velocidad maxima a ${nueva} % para ahorrar energia?`
          : 'Ya tienes la velocidad maxima en el nivel mas bajo, asi que no hace falta cambiar nada.',
      accion: nueva !== null ? { tipo: 'ahorro', etiqueta: `Ahorrar energia (${nueva} %)`, speedMax: nueva } : undefined,
    })
  } else if (diferencia >= 2 && antesDelInicio) {
    const nuevaHora = restarMinutos(perfil.hourFrom, perfil.minFrom, lead)
    const texto = horaTexto(nuevaHora.hour, nuevaHora.minute)
    items.push({
      id: 'adelanto',
      titulo: 'Hoy vendra con calor',
      parrafos: [
        `Hola. Hoy vendra con calor: hacia las ${pad(ventana.horaMaxima)}:00 se esperan ${ventana.maxima} C, por encima del objetivo de ${perfil.setpointC} C de tu perfil.`,
        configurado,
      ],
      pregunta: `Quieres que lo encienda ${lead} min antes, a las ${texto}, para que tu casa, tu habitacion o tu lugar este fresco cuando llegues? Es un adelanto prudente: lo justo para que el ambiente cambie sin gastar mas de lo necesario.`,
      accion: { tipo: 'adelanto', etiqueta: `Encender antes (${texto})`, hourFrom: nuevaHora.hour, minFrom: nuevaHora.minute },
    })
  } else if (diferencia >= 2) {
    items.push({
      id: 'normal',
      titulo: 'Hoy hace calor',
      parrafos: [
        `Hoy hace calor: se esperan ${ventana.maxima} C hacia las ${pad(ventana.horaMaxima)}:00, por encima del objetivo de ${perfil.setpointC} C. Tu horario ya empezo, asi que tu equipo ya esta trabajando para ti.`,
        configurado,
      ],
    })
  } else {
    items.push({
      id: 'normal',
      titulo: 'Hoy el clima esta amable',
      parrafos: [
        `Hoy el clima esta amable: entre ${ventana.minima} y ${ventana.maxima} C durante tu horario (${ventana.desde} a ${ventana.hasta}). Tu configuracion va bien, no hace falta cambiar nada.`,
        configurado,
      ],
    })
  }

  if (ventana.humedadMaxima >= 80 && !perfil.preventiveVent) {
    items.push({
      id: 'humedad',
      titulo: 'Habra mucha humedad',
      parrafos: [
        `Se espera hasta ${ventana.humedadMaxima} % de humedad durante tu horario. La ventilacion preventiva ayuda a que el ambiente no se sienta pesado y a cuidar tu equipo.`,
      ],
      pregunta: 'Quieres activarla en tu perfil?',
      accion: { tipo: 'preventiva', etiqueta: 'Activar ventilacion preventiva' },
    })
  }

  return { ventana, items }
}

export function aplicarAccion(perfil: SmartProfile, accion: AccionReco): SmartProfile {
  if (accion.tipo === 'ahorro') return { ...perfil, speedMax: accion.speedMax }
  if (accion.tipo === 'adelanto') return { ...perfil, hourFrom: accion.hourFrom, minFrom: accion.minFrom }
  return { ...perfil, preventiveVent: true }
}
