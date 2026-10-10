import type { AVCData } from '@/hooks/use-avc-data'

const HEARTBEAT_MS = 25000
const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const FIREBASE_MODO = ['Apagado', 'Solo leer', 'Solo enviar', 'Leer+enviar']

export type Veredicto = 'verificado' | 'revisar' | 'sin_dato'

export type VerificacionItem = {
  id: string
  funcion: string
  veredicto: Veredicto
  motivo: string
  revisar: string
  desencadena: string
}

type Entrada = {
  data: AVCData
  isDemo: boolean
  lastHeartbeatAt: number | null
  now: number
  perfil: { name: string; schedule: string } | null
  amperiosNominal: number | null
}

function item(
  id: string,
  funcion: string,
  veredicto: Veredicto,
  motivo: string,
  revisar: string,
  desencadena: string,
): VerificacionItem {
  return { id, funcion, veredicto, motivo, revisar, desencadena }
}

function fresco(lastHeartbeatAt: number | null, now: number): boolean {
  return lastHeartbeatAt !== null && now - lastHeartbeatAt <= HEARTBEAT_MS
}

function rango(valores: number[]): { min: number; max: number; n: number } | null {
  const validos = valores.filter((value) => Number.isFinite(value))
  if (validos.length === 0) {
    return null
  }
  return {
    min: Math.min(...validos),
    max: Math.max(...validos),
    n: validos.length,
  }
}

export function buildVerificacionFalla(entrada: Entrada): VerificacionItem[] {
  const { data, isDemo, lastHeartbeatAt, now, perfil, amperiosNominal } = entrada
  if (isDemo) {
    return [
      item(
        'demo',
        'Lectura del equipo',
        'sin_dato',
        'La página está mostrando datos de demostración, no el equipo.',
        'Vincula Firebase y confirma que el HMI está encendido.',
        'Ninguna función se puede dar por buena ni por fallada desde esta pantalla.',
      ),
    ]
  }

  const vivo = fresco(lastHeartbeatAt, now)
  const salida: VerificacionItem[] = []

  salida.push(
    vivo
      ? item(
          'enlace',
          'Publicación del HMI',
          'verificado',
          'Hay una lectura reciente del equipo.',
          'Si más adelante se corta, revisar que el HMI siga encendido.',
          'Sin esta publicación la página no puede confirmar el resto.',
        )
      : item(
          'enlace',
          'Publicación del HMI',
          'revisar',
          'No llega una lectura reciente. Lo que se ve puede ser la última guardada o un valor vacío.',
          'HMI encendido, WiFi con enlace y Firebase en Leer+enviar.',
          'No se puede confirmar motor, sensores, consumo ni la causa de la falla.',
        ),
  )

  const modo = data.conectividad.firebaseModo
  if (!vivo) {
    salida.push(
      item(
        'firebase',
        'Firebase',
        'sin_dato',
        'No se puede comprobar el modo porque el equipo no está publicando.',
        'En el HMI, Conectividad, Firebase.',
        'Si está apagado o en Solo leer, esta página no recibe el estado ni puede guiar la reparación.',
      ),
    )
  } else if (modo === 3) {
    salida.push(
      item(
        'firebase',
        'Firebase',
        'verificado',
        'Modo Leer+enviar: publica lecturas y puede recibir órdenes.',
        'Dejarlo en Leer+enviar mientras se revisa la falla.',
        'En otro modo la página deja de ver el equipo o el equipo deja de obedecer.',
      ),
    )
  } else if (modo === 2) {
    salida.push(
      item(
        'firebase',
        'Firebase',
        'revisar',
        'Modo Solo enviar: llegan lecturas, pero el equipo no acepta órdenes desde la página.',
        'Pasar Firebase a Leer+enviar en el HMI.',
        'No se puede reanudar el motor ni cambiar el setpoint desde el teléfono.',
      ),
    )
  } else {
    salida.push(
      item(
        'firebase',
        'Firebase',
        'revisar',
        `Modo ${FIREBASE_MODO[modo] ?? 'desconocido'}: el equipo no publica su estado.`,
        'Pasar Firebase a Leer+enviar en el HMI.',
        'La verificación queda ciega y las órdenes de la página no entran.',
      ),
    )
  }

  if (!vivo) {
    salida.push(
      item(
        'wifi',
        'WiFi',
        'sin_dato',
        'No se puede comprobar el enlace porque no hay publicación reciente.',
        'Radio WiFi y la red configurada en el HMI. La clave no se cambia desde la página.',
        'Sin WiFi no hay lecturas, historial ni órdenes.',
      ),
    )
  } else if (!data.conectividad.wifiRadio) {
    salida.push(
      item(
        'wifi',
        'WiFi',
        'revisar',
        'La radio WiFi está apagada.',
        'Encender la radio en el HMI y elegir la red allí.',
        'El equipo no publica ni recibe nada por la nube.',
      ),
    )
  } else if (!data.wifi.conectado) {
    salida.push(
      item(
        'wifi',
        'WiFi',
        'revisar',
        'La radio está encendida y no hay enlace.',
        'Red y clave en el HMI.',
        'Se pierden lecturas, historial y el control desde la página.',
      ),
    )
  } else {
    salida.push(
      item(
        'wifi',
        'WiFi',
        'verificado',
        `Enlazado${data.wifi.ssid ? ` a ${data.wifi.ssid}` : ''}${data.wifi.ip ? `, IP ${data.wifi.ip}` : ''}.`,
        'Si se corta, volver a elegir la red en el HMI.',
        'Si cae, el resto de esta verificación deja de actualizarse.',
      ),
    )
  }

  salida.push(sensorClima('temperatura', 'Temperatura', data.config.sensorTemperatura, data.temperatura, 'C', vivo, 'el automático no compara la sala con el setpoint y no queda registro de cómo varió.'))
  salida.push(sensorClima('humedad', 'Humedad', data.config.sensorHumedad, data.humedad, '%', vivo, 'no se puede saber si el ambiente empujó el arranque ni cómo varió la humedad.'))

  const dia = DIAS[new Date(now).getDay()]
  const muestras = data.historico[dia]
  const tempRango = data.config.guardarTemperatura ? rango(muestras?.temperatura ?? []) : null
  const humRango = data.config.guardarHumedad ? rango(muestras?.humedad ?? []) : null
  if (!data.config.guardarTemperatura && !data.config.guardarHumedad) {
    salida.push(
      item(
        'curva',
        'Curva de temperatura y humedad',
        'revisar',
        'El registro de temperatura y de humedad está apagado.',
        'En Medición, activar Guardar en temperatura y humedad.',
        'Después de una falla no hay cómo ver si el ambiente cambió antes del paro.',
      ),
    )
  } else if (!tempRango && !humRango) {
    salida.push(
      item(
        'curva',
        'Curva de temperatura y humedad',
        'sin_dato',
        `El registro está activo y hoy (${dia}) no hay muestras.`,
        'Confirmar que los sensores siguen activos y que el equipo lleva un rato publicando.',
        'No se puede describir la variación alrededor de la falla.',
      ),
    )
  } else {
    const partes: string[] = []
    if (tempRango) partes.push(`temperatura ${tempRango.min} a ${tempRango.max} C (${tempRango.n} muestras)`)
    if (humRango) partes.push(`humedad ${humRango.min} a ${humRango.max} % (${humRango.n} muestras)`)
    salida.push(
      item(
        'curva',
        'Curva de temperatura y humedad',
        'verificado',
        `Hoy: ${partes.join('; ')}. Es el día completo, no solo el instante de la falla.`,
        'Si falta un tramo, revisar que Guardar siga activo.',
        'Sin estas muestras no se relaciona el paro con el ambiente.',
      ),
    )
  }

  if (!vivo) {
    salida.push(
      item(
        'potencia',
        'Potencia',
        'sin_dato',
        'No se puede leer el consumo porque no hay publicación reciente.',
        'Sensor de potencia en Medición y el enlace del equipo.',
        'No se sabe si el motor estaba consumiendo de más al detenerse.',
      ),
    )
  } else if (!data.config.sensorPotencia) {
    salida.push(
      item(
        'potencia',
        'Potencia',
        'revisar',
        'El sensor de potencia está apagado en la configuración.',
        'Activarlo en Medición.',
        'No hay consumo actual ni comparación con lo habitual. La potencia que publica el equipo es un porcentaje, no amperios.',
      ),
    )
  } else {
    const potDia = rango(data.config.guardarPotencia ? (muestras?.potencia ?? []) : [])
    salida.push(
      item(
        'potencia',
        'Potencia',
        'verificado',
        potDia
          ? `Lectura actual ${data.potencia} %. Hoy fue de ${potDia.min} a ${potDia.max} %. Es porcentaje, no corriente.`
          : `Lectura actual ${data.potencia} %. No hay muestras de hoy para compararla. Es porcentaje, no corriente.`,
        data.config.guardarPotencia ? 'Mantener el sensor y el registro activos.' : 'Activar Guardar potencia si se quiere la curva del día.',
        'Un porcentaje alto no alcanza para afirmar que el motor trabajó forzado.',
      ),
    )
  }

  const nominal =
    amperiosNominal !== null && amperiosNominal > 0 ? ` La ficha local dice ${amperiosNominal} A.` : ' La ficha del equipo no tiene corriente nominal.'
  salida.push(
    item(
      'corriente',
      'Corriente de arranque',
      'sin_dato',
      `No se puede comparar el arranque con lo habitual.${nominal} El equipo no publica amperios ni el consumo de los arranques anteriores.`,
      'Hace falta una medición real de corriente. La pantalla de salud del motor del HMI no sirve: es una simulación.',
      'No se puede concluir bobinas, capacitor de arranque ni alimentación, aunque el motor se haya detenido.',
    ),
  )

  salida.push(
    item(
      'arranque',
      'Arranque y reintentos',
      'sin_dato',
      'El equipo no informa si el arranque falló, a qué hora, ni cuántas veces volvió a intentar.',
      'Ese registro todavía no sale del HMI.',
      'No se puede decir que se detuvo por trabajo forzado ni que un segundo arranque siguió forzado.',
    ),
  )

  if (!vivo) {
    salida.push(
      item(
        'motor',
        'Estado del motor',
        'sin_dato',
        'No se puede confirmar si está encendido, la velocidad ni el modo.',
        'Restablecer la publicación del HMI y mirar el estado en el equipo.',
        'No se sabe si el paro ya ocurrió o si el motor sigue en marcha.',
      ),
    )
  } else {
    salida.push(
      item(
        'motor',
        'Estado del motor',
        'verificado',
        `Ahora está ${data.estado === 'running' ? 'encendido' : 'apagado'}, modo ${data.modo}, velocidad ${data.velocidad} %, setpoint ${data.setpoint} C. Es el estado actual, no la causa del paro.`,
        'Si no coincide con el equipo, la lectura que llegó no es la que está en pantalla del HMI.',
        'Sin este estado no se sabe si ya se puede volver a poner en marcha.',
      ),
    )
  }

  if (!vivo) {
    salida.push(
      item(
        'regulacion',
        'Regulación automática',
        'sin_dato',
        'No se puede ver si el automático tenía con qué decidir.',
        'Modo, setpoint y sensor de temperatura, cuando vuelva la publicación.',
        'El motor puede no arrancar, o arrancar fuera de horario, sin que esta página lo explique.',
      ),
    )
  } else if (data.modo === 'MANUAL') {
    salida.push(
      item(
        'regulacion',
        'Regulación automática',
        'verificado',
        'El modo es manual. El setpoint no enciende ni apaga el motor por sí solo.',
        'Pasar a automático solo cuando el arranque ya esté comprobado.',
        'En manual, una falla de temperatura o de presencia no explica el paro.',
      ),
    )
  } else if (!data.config.sensorTemperatura) {
    salida.push(
      item(
        'regulacion',
        'Regulación automática',
        'revisar',
        `Está en automático con setpoint ${data.setpoint} C y el sensor de temperatura está apagado.`,
        'Activar el sensor de temperatura antes de pedir regulación.',
        'El automático no puede decidir por temperatura y el equipo no vuelve a una marcha estable.',
      ),
    )
  } else {
    const delta = Math.round((data.temperatura - data.setpoint) * 10) / 10
    salida.push(
      item(
        'regulacion',
        'Regulación automática',
        'verificado',
        `Automático. Temperatura ${data.temperatura} C, setpoint ${data.setpoint} C, diferencia ${delta} C. No se comprueba si el perfil o la presencia debían ordenar el arranque.`,
        'Setpoint, perfil horario y presencia obligatoria.',
        'Si la temperatura no entra en la decisión, el motor no responde al ambiente.',
      ),
    )
  }

  if (!data.config.sensorMovimiento) {
    salida.push(
      item(
        'presencia',
        'Presencia',
        'revisar',
        'El sensor de presencia está apagado.',
        'Activarlo en Medición y revisar alcance y retención en Automatización.',
        'El encendido inteligente no arranca por presencia o no se puede exigir presencia obligatoria.',
      ),
    )
  } else if (!vivo) {
    salida.push(
      item(
        'presencia',
        'Presencia',
        'sin_dato',
        'No hay lectura reciente de presencia.',
        'Radar, retención y el enlace del cerebro en el HMI.',
        'No se sabe si había alguien en la zona cuando el motor paró o cuando intentó arrancar.',
      ),
    )
  } else {
    salida.push(
      item(
        'presencia',
        'Presencia',
        'verificado',
        `Última lectura: presencia ${data.movimiento ? 'sí' : 'no'}. Retención ${Math.round(data.automatizacion.retencionMs / 1000)} s, alcance ${['Cerca', 'Media', 'Lejos'][data.automatizacion.alcance] ?? 'desconocido'}. Un sí o un no no prueba que el radar esté sano.`,
        'Si la presencia no cambia al pasar frente al equipo, revisar el radar y el cerebro.',
        'Con presencia obligatoria, un radar mudo deja el motor apagado.',
      ),
    )
  }

  salida.push(
    item(
      'radar',
      'Enlace del cerebro y salud del radar',
      'sin_dato',
      'Esta lectura no dice si el cerebro está en línea ni si el radar midió bien. Solo puede llegar presencia sí o no.',
      'En el HMI, el enlace del cerebro y la calibración del radar.',
      'Si el cerebro está caído, presencia, arranque inteligente y parte del control dejan de ser confiables.',
    ),
  )

  if (!vivo) {
    salida.push(
      item(
        'fallas',
        'Fallas abiertas en el equipo',
        'sin_dato',
        'No llega el conteo de fallas.',
        'Mirar las fallas en la pantalla del HMI.',
        'No se sabe si hay un sensor, el WiFi, Firebase o el cerebro con falla abierta.',
      ),
    )
  } else if (data.diag.fallas > 0) {
    salida.push(
      item(
        'fallas',
        'Fallas abiertas en el equipo',
        'revisar',
        `El equipo reporta ${data.diag.fallas} falla(s) abierta(s) y no dice cuál. Puede ser temperatura, humedad, potencia, WiFi, presencia, Firebase o el cerebro.`,
        'Abrir el detalle en el HMI. Esta página solo recibe el número.',
        'Sin saber cuál es, se puede cambiar un componente que sí funciona.',
      ),
    )
  } else {
    salida.push(
      item(
        'fallas',
        'Fallas abiertas en el equipo',
        'verificado',
        'El conteo de fallas abiertas es 0. Ese conteo no incluye arranque forzado ni corriente.',
        'Si el motor falló igual, la causa está fuera de estas siete señales.',
        'Un conteo en cero no descarta un problema mecánico o de arranque.',
      ),
    )
  }

  salida.push(
    perfil
      ? item(
          'perfil',
          'Perfil y horario',
          'sin_dato',
          `En esta página está «${perfil.name}», ${perfil.schedule}. La lectura del equipo no confirma que el HMI esté usando ese perfil.`,
          'Usar el perfil en el HMI o volver a enviarlo cuando el equipo acepte la orden.',
          'El horario, la presencia obligatoria y el silencio de la página pueden no ser los que están mandando el motor.',
        )
      : item(
          'perfil',
          'Perfil y horario',
          'sin_dato',
          'No hay un perfil activo en esta página y el equipo no informa cuál está usando.',
          'Elegir el perfil en Automatización y confirmarlo en el HMI.',
          'Sin horario confirmado no se sabe si el paro fue por fin de jornada o por una falla.',
        ),
  )

  return salida
}

function sensorClima(
  id: string,
  nombre: string,
  activo: boolean,
  valor: number,
  unidad: string,
  vivo: boolean,
  consecuencia: string,
): VerificacionItem {
  if (!activo) {
    return item(
      id,
      nombre,
      'revisar',
      `El sensor de ${nombre.toLowerCase()} está apagado en la configuración.`,
      `Activarlo en Medición.`,
      `Al estar apagado, ${consecuencia}`,
    )
  }
  if (!vivo) {
    return item(
      id,
      nombre,
      'sin_dato',
      `El sensor está configurado como activo, pero no hay lectura reciente.`,
      'Publicación del HMI y el cableado del sensor.',
      `Mientras no haya lectura, ${consecuencia}`,
    )
  }
  return item(
    id,
    nombre,
    'verificado',
    `Sensor activo. Lectura ${valor} ${unidad}.`,
    'Si el valor no se mueve cuando el ambiente cambia, revisar el sensor en el equipo.',
    `Si deja de responder, ${consecuencia}`,
  )
}
