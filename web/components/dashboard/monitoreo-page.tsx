'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Thermometer, Droplets, Zap, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AVCData, AVCHistoryDay } from '@/hooks/use-avc-data'
import type { AccionPantalla } from '@/lib/voice-learn'

interface MonitoreoPageProps {
  data: AVCData
  onUpdate: (path: string, value: unknown) => void
}

type Metrica = 'temperatura' | 'humedad' | 'potencia'
type Capa = 'ahora' | 'log' | 'resumen' | null

const DIAS = [
  { key: 'Lun', label: 'LUN' },
  { key: 'Mar', label: 'MAR' },
  { key: 'Mie', label: 'MIE' },
  { key: 'Jue', label: 'JUE' },
  { key: 'Vie', label: 'VIE' },
  { key: 'Sab', label: 'SAB' },
  { key: 'Dom', label: 'DOM' },
]

const COLORES: Record<Metrica, string> = {
  temperatura: '#E5342A',
  humedad: '#2F6FED',
  potencia: '#FB7900',
}

const RANGOS = [24, 12, 6, 1] as const

const ORDEN: Metrica[] = ['temperatura', 'humedad', 'potencia']

function diaDeHoy(): string {
  return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][new Date().getDay()]
}

function numero(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function puntosDelDia(dia: AVCHistoryDay | undefined) {
  const temperatura = dia?.temperatura ?? []
  const humedad = dia?.humedad ?? []
  const potencia = dia?.potencia ?? []
  return Array.from({ length: 24 }, (_, hora) => ({
    hora,
    etiqueta: String(hora),
    temperatura: numero(temperatura[hora]),
    humedad: numero(humedad[hora]),
    potencia: numero(potencia[hora]),
  }))
}

type Punto = ReturnType<typeof puntosDelDia>[number]

function valores(puntos: Punto[], metrica: Metrica) {
  return puntos
    .map((punto) => ({ hora: punto.hora, valor: punto[metrica] }))
    .filter((punto): punto is { hora: number; valor: number } => punto.valor !== null)
}

function ventana(puntos: Punto[], horas: number, hoy: boolean) {
  const fin = hoy ? new Date().getHours() : 23
  const inicio = fin + 1 > horas ? fin + 1 - horas : 0
  return puntos.filter((punto) => punto.hora >= inicio && punto.hora <= fin)
}

function statsLinea(puntos: Punto[], metrica: Metrica) {
  const lista = valores(puntos, metrica)
  if (lista.length === 0) {
    return 'Max -- | Min -- | Prom -- | d --'
  }
  const unidad = metrica === 'temperatura' ? 'C' : metrica === 'humedad' ? '%' : 'W'
  let max = lista[0]
  let min = lista[0]
  let suma = 0
  for (const item of lista) {
    if (item.valor > max.valor) max = item
    if (item.valor < min.valor) min = item
    suma += item.valor
  }
  const prom = suma / lista.length
  const delta = max.valor - min.valor
  return `Max ${Math.round(max.valor)}${unidad} ${max.hora}h | Min ${Math.round(min.valor)}${unidad} ${min.hora}h | Prom ${prom.toFixed(1)}${unidad} | d ${delta.toFixed(1)}${unidad}`
}

function barras(puntos: Punto[], metrica: Metrica) {
  const lista = valores(puntos, metrica)
  if (metrica === 'temperatura') {
    return [
      { nombre: '>30C', horas: lista.filter((item) => item.valor >= 30).length, color: COLORES.temperatura },
      { nombre: '<20C', horas: lista.filter((item) => item.valor < 20).length, color: COLORES.temperatura },
    ]
  }
  if (metrica === 'humedad') {
    return [
      { nombre: '>70%', horas: lista.filter((item) => item.valor > 70).length, color: COLORES.humedad },
      { nombre: 'Confort', horas: lista.filter((item) => item.valor >= 40 && item.valor <= 60).length, color: COLORES.humedad },
    ]
  }
  return [
    { nombre: '>70%', horas: lista.filter((item) => item.valor > 70).length, color: COLORES.potencia },
    { nombre: 'Activo', horas: lista.filter((item) => item.valor > 0).length, color: COLORES.potencia },
  ]
}

function pie(puntos: Punto[], metrica: Metrica, tempViva: number, humViva: number) {
  const lista = valores(puntos, metrica)
  if (metrica === 'humedad') {
    if (humViva > 0 && humViva <= 100) {
      const a = 17.27
      const b = 237.7
      const alpha = (a * tempViva) / (b + tempViva) + Math.log(humViva / 100)
      const rocio = (b * alpha) / (a - alpha)
      return Number.isFinite(rocio) ? `Punto de rocio ${rocio.toFixed(1)}C con la lectura actual` : 'Punto de rocio -- con la lectura actual'
    }
    return 'Punto de rocio -- con la lectura actual'
  }
  const mitad = 12
  const antes = lista.filter((item) => item.hora < mitad)
  const despues = lista.filter((item) => item.hora >= mitad)
  let texto = 'estable'
  let flecha = '->'
  if (antes.length > 0 && despues.length > 0) {
    const media = (items: { valor: number }[]) => items.reduce((sum, item) => sum + item.valor, 0) / items.length
    const delta = media(despues) - media(antes)
    if (delta > 2) {
      texto = 'subiendo'
      flecha = '^'
    } else if (delta < -2) {
      texto = 'bajando'
      flecha = 'v'
    }
  }
  if (metrica === 'temperatura') {
    const picos = lista.filter((item, index, todos) => {
      if (item.hora === 0 || item.hora === 23 || item.valor < 30) return false
      const previo = todos.find((otro) => otro.hora === item.hora - 1)
      const siguiente = todos.find((otro) => otro.hora === item.hora + 1)
      return previo !== undefined && siguiente !== undefined && item.valor >= previo.valor && item.valor >= siguiente.valor
    }).length
    return `Tendencia ${flecha} ${texto} | ${picos} picos >=30C`
  }
  const prom = lista.length > 0 ? lista.reduce((sum, item) => sum + item.valor, 0) / lista.length : 0
  const picos = lista.filter((item, index, todos) => {
    if (item.hora === 0 || item.hora === 23 || item.valor <= 70) return false
    const previo = todos.find((otro) => otro.hora === item.hora - 1)
    const siguiente = todos.find((otro) => otro.hora === item.hora + 1)
    return previo !== undefined && siguiente !== undefined && item.valor >= previo.valor && item.valor >= siguiente.valor
  }).length
  const activo = lista.filter((item) => item.valor > 0).length
  return `Consumo prom. ${prom.toFixed(0)}% | ${picos} picos | ${activo}h activo`
}

function picos(puntos: Punto[], metrica: Metrica) {
  const lista = [...valores(puntos, metrica)].sort((a, b) => b.valor - a.valor)
  const elegidos: { hora: number; valor: number }[] = []
  for (const item of lista) {
    if (elegidos.some((otro) => Math.abs(otro.hora - item.hora) < 2)) continue
    elegidos.push(item)
    if (elegidos.length === 2) break
  }
  return elegidos
}

function alertas(puntos: Punto[], metrica: Metrica) {
  const cruce: { hora: number; texto: string }[] = []
  for (let hora = 1; hora < 24; hora += 1) {
    const actual = puntos[hora]?.[metrica]
    const previo = puntos[hora - 1]?.[metrica]
    if (actual === null || actual === undefined || previo === null || previo === undefined) continue
    if (metrica === 'temperatura' && actual >= 30 && previo < 30) {
      cruce.push({ hora, texto: `Supero 30C (${Math.round(actual)}C)` })
    } else if (metrica === 'temperatura' && actual < 20 && previo >= 20) {
      cruce.push({ hora, texto: `Bajo de 20C (${Math.round(actual)}C)` })
    } else if (metrica === 'humedad') {
      const ahora = actual >= 40 && actual <= 60
      const antes = previo >= 40 && previo <= 60
      if (!ahora && antes) cruce.push({ hora, texto: `Salio de zona de confort (${Math.round(actual)}%)` })
    } else if (metrica === 'potencia' && actual >= 70 && previo < 70) {
      cruce.push({ hora, texto: `Pico de consumo alto (${Math.round(actual)}%)` })
    }
  }
  return cruce.slice(-2).reverse()
}

function tendencia(puntos: Punto[], metrica: Metrica, unidad: string, banda: number) {
  const lista = valores(puntos, metrica)
  if (lista.length < 2) return 'estable'
  const primero = lista[0]
  const ultimo = lista[lista.length - 1]
  const horas = ultimo.hora - primero.hora
  if (horas <= 0) return 'estable'
  const ritmo = (ultimo.valor - primero.valor) / horas
  if (Math.abs(ritmo) < banda) return 'estable'
  return ritmo > 0 ? `+${ritmo.toFixed(1)} ${unidad}/h` : `${ritmo.toFixed(1)} ${unidad}/h`
}

function nivelVentilador(enMarcha: boolean, velocidad: number) {
  if (!enMarcha || velocidad <= 0) return 0
  if (velocidad <= 33) return 1
  if (velocidad <= 66) return 2
  return 3
}

function hora12(hora: number, minuto: number) {
  const pm = hora >= 12
  const h = hora % 12 === 0 ? 12 : hora % 12
  return `${h}:${String(minuto).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`
}

export function MonitoreoPage({ data }: MonitoreoPageProps) {
  const hoy = diaDeHoy()
  const [selectedDay, setSelectedDay] = useState(hoy)
  const [visible, setVisible] = useState<Record<Metrica, boolean>>({
    temperatura: true,
    humedad: true,
    potencia: true,
  })
  const [separada, setSeparada] = useState<Record<Metrica, boolean>>({
    temperatura: false,
    humedad: false,
    potencia: false,
  })
  const [menu, setMenu] = useState<Metrica | null>(null)
  const [rangos, setRangos] = useState<Record<Metrica, number>>({
    temperatura: 24,
    humedad: 24,
    potencia: 24,
  })
  const [detalle, setDetalle] = useState<Record<Metrica, boolean>>({
    temperatura: false,
    humedad: false,
    potencia: false,
  })
  const [capa, setCapa] = useState<Capa>(null)
  const [resumenHora, setResumenHora] = useState(() => new Date().getHours())

  const puntos = useMemo(() => puntosDelDia(data.historico?.[selectedDay]), [data.historico, selectedDay])
  const esHoy = selectedDay === hoy
  const enCombinada = ORDEN.filter((metrica) => visible[metrica])
  const paneles = ORDEN.filter((metrica) => separada[metrica] && visible[metrica])

  const sensorActivo: Record<Metrica, boolean> = {
    temperatura: data.config.sensorTemperatura,
    humedad: data.config.sensorHumedad,
    potencia: data.config.sensorPotencia,
  }
  const lectura: Record<Metrica, string> = {
    temperatura: sensorActivo.temperatura ? `${data.temperatura} C` : '--',
    humedad: sensorActivo.humedad ? `${Math.round(data.humedad)} %` : '--',
    potencia: sensorActivo.potencia ? `${data.potencia} W` : '--',
  }

  function valorPanel(metrica: Metrica) {
    if (esHoy) return lectura[metrica]
    const ultimo = [...valores(puntos, metrica)].pop()
    if (!ultimo) return '--'
    if (metrica === 'temperatura') return `${Math.round(ultimo.valor)} C`
    if (metrica === 'humedad') return `${Math.round(ultimo.valor)} %`
    return `${Math.round(ultimo.valor)} W`
  }

  useEffect(() => {
    function alHablar(event: Event) {
      const orden = (event as CustomEvent<AccionPantalla>).detail
      if (!orden) return
      const metrica = orden.metrica
      setMenu(null)
      if (orden.op === 'separar') {
        setVisible((actual) => ({ ...actual, [metrica]: true }))
        setSeparada((actual) => ({ ...actual, [metrica]: true }))
        return
      }
      if (orden.op === 'ocultar') {
        setVisible((actual) => ({ ...actual, [metrica]: false }))
        setSeparada((actual) => ({ ...actual, [metrica]: false }))
        return
      }
      setVisible((actual) => ({ ...actual, [metrica]: true }))
      setSeparada((actual) => ({ ...actual, [metrica]: false }))
    }
    window.addEventListener('ecopulse-monitoreo', alHablar)
    return () => window.removeEventListener('ecopulse-monitoreo', alHablar)
  }, [])

  function ocultar(metrica: Metrica) {
    setMenu(null)
    if (!visible[metrica]) {
      setVisible((actual) => ({ ...actual, [metrica]: true }))
      setSeparada((actual) => ({ ...actual, [metrica]: false }))
      return
    }
    setVisible((actual) => ({ ...actual, [metrica]: false }))
    setSeparada((actual) => ({ ...actual, [metrica]: false }))
  }

  function separar(metrica: Metrica) {
    setMenu(null)
    if (separada[metrica] && visible[metrica]) {
      setVisible((actual) => ({ ...actual, [metrica]: true }))
      setSeparada((actual) => ({ ...actual, [metrica]: false }))
      return
    }
    setVisible((actual) => ({ ...actual, [metrica]: true }))
    setSeparada((actual) => ({ ...actual, [metrica]: true }))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-foreground">MONITOREO</h2>
        <div className="flex gap-2">
          <Button type="button" onClick={() => setCapa(capa === 'ahora' ? null : 'ahora')} className="h-9 bg-green-600 hover:bg-green-700 text-white">
            AHORA
          </Button>
          <Button type="button" onClick={() => setCapa(capa === 'log' ? null : 'log')} className="h-9 bg-green-600 hover:bg-green-700 text-white">
            LOG
          </Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {DIAS.map((dia) => (
                <button
            key={dia.key}
            type="button"
            onClick={() => setSelectedDay(dia.key)}
                  className={cn(
              'h-8 min-w-12 flex-1 rounded-full border text-xs font-medium',
              selectedDay === dia.key ? 'bg-foreground text-background border-foreground' : 'bg-card text-muted-foreground border-border',
            )}
          >
            {dia.label}
                </button>
              ))}
            </div>

      <Card className="bg-card border-border">
        <CardContent className="p-3 space-y-2">
          {enCombinada.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Las tres variables estan separadas u ocultas. Toca un panel de abajo para volver a mostrar una aqui.
              </p>
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="etiqueta"
                    stroke="#666"
                    ticks={['0', '6', '12', '18', '23']}
                  />
                  <YAxis yAxisId="clima" stroke="#666" domain={[0, 40]} ticks={[0, 10, 20, 30, 40]} width={32} />
                  <YAxis yAxisId="escala" orientation="right" stroke="#666" domain={[0, 100]} width={36} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} />
                  {enCombinada.includes('potencia') ? (
                    <Line yAxisId="escala" type="monotone" dataKey="potencia" name="POT" stroke={COLORES.potencia} strokeWidth={2} dot={false} connectNulls={false} />
                  ) : null}
                  {enCombinada.includes('humedad') ? (
                    <Line yAxisId="escala" type="monotone" dataKey="humedad" name="HUM" stroke={COLORES.humedad} strokeWidth={2} dot={false} connectNulls={false} />
                  ) : null}
                  {enCombinada.includes('temperatura') ? (
                    <Line yAxisId="clima" type="monotone" dataKey="temperatura" name="TEMP" stroke={COLORES.temperatura} strokeWidth={2} dot={false} connectNulls={false} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {paneles.length > 0 ? (
            <p className="text-center text-xs text-muted-foreground">desliza para ver mas</p>
          ) : null}
        </CardContent>
      </Card>

      {paneles.map((metrica) => (
        <PanelSeparado
          key={metrica}
          metrica={metrica}
          puntos={puntos}
          horas={rangos[metrica]}
          esHoy={esHoy}
          valor={valorPanel(metrica)}
          abierto={detalle[metrica]}
          tempViva={data.temperatura}
          humViva={data.humedad}
          onRango={(horas) => setRangos((actual) => ({ ...actual, [metrica]: horas }))}
          onDetalle={() => setDetalle((actual) => ({ ...actual, [metrica]: !actual[metrica] }))}
        />
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ORDEN.map((metrica) => {
          const Icono = metrica === 'temperatura' ? Thermometer : metrica === 'humedad' ? Droplets : Zap
          const titulo = metrica === 'temperatura' ? 'TEMPERATURA' : metrica === 'humedad' ? 'HUMEDAD' : 'POTENCIA'
          const etiqueta = sensorActivo[metrica] && !visible[metrica] ? 'oculta' : sensorActivo[metrica] && separada[metrica] ? 'separada' : ''
          return (
            <div key={metrica} className="relative rounded-md border border-border bg-card px-3 py-2 min-h-[72px]">
              {menu === metrica ? (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-card rounded-md">
                  <button type="button" onClick={() => ocultar(metrica)} className="h-7 px-2 rounded-md border border-border text-[11px] text-muted-foreground">
                    {visible[metrica] && sensorActivo[metrica] ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button type="button" onClick={() => separar(metrica)} className="h-7 px-2 rounded-md bg-foreground text-background text-[11px]">
                    {separada[metrica] && visible[metrica] ? 'Unir' : 'Separar'}
                  </button>
              </div>
              ) : (
                <button type="button" onClick={() => setMenu(metrica)} className="w-full flex items-center gap-2 text-left">
                  <Icono className="w-4 h-4 shrink-0" style={{ color: COLORES[metrica] }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{titulo}</span>
                      {etiqueta ? <span className="text-[10px] text-muted-foreground">{etiqueta}</span> : null}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: COLORES[metrica] }}>{lectura[metrica]}</span>
                  </span>
                  <Chispa puntos={puntos} metrica={metrica} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {capa === 'ahora' ? (
        <Capa titulo="MONITOREO - AHORA" onClose={() => setCapa(null)}>
          <div className="grid grid-cols-2 gap-2">
            <TarjetaAhora nombre="Temperatura" valor={sensorActivo.temperatura ? `${data.temperatura} C` : '--'} nota={tendencia(puntosDelDia(data.historico?.[hoy]), 'temperatura', 'C', 0.15)} />
            <TarjetaAhora nombre="Humedad" valor={sensorActivo.humedad ? `${Math.round(data.humedad)} %` : '--'} nota={tendencia(puntosDelDia(data.historico?.[hoy]), 'humedad', '%', 1)} />
            <TarjetaAhora nombre="Potencia" valor={sensorActivo.potencia ? `${data.potencia} W` : '--'} nota={tendencia(puntosDelDia(data.historico?.[hoy]), 'potencia', 'W', 2)} />
            <TarjetaAhora
              nombre="Ventilador"
              valor={nivelVentilador(data.estado === 'running', data.velocidad) > 0 ? 'ON' : 'OFF'}
              nota={nivelVentilador(data.estado === 'running', data.velocidad) > 0 ? `nivel ${nivelVentilador(data.estado === 'running', data.velocidad)}` : 'apagado'}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
            <span>{data.movimiento ? 'Presencia detectada' : 'sin presencia'}</span>
            <span className="text-muted-foreground">--</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setCapa(null)}>Ver grafico</Button>
            <Button type="button" variant="outline" onClick={() => setCapa('log')}>Decisiones</Button>
          </div>
        </Capa>
      ) : null}

      {capa === 'log' ? (
        <Capa titulo="DECISIONES DEL SISTEMA" onClose={() => setCapa(null)}>
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
            <span>Bitacora del control automatico</span>
            <span className="text-muted-foreground">0/16</span>
          </div>
          <div className="grid grid-cols-[64px_1fr_1fr] gap-2 text-[11px] font-medium text-muted-foreground">
            <span>HORA</span>
            <span>QUE PASO</span>
            <span>QUE HIZO EL SISTEMA</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Aqui veras la tabla de decisiones del sistema: presencia, ventilador, perfiles y horario, mantenimiento, alertas y sensores, fallo de motor si no hay potencia. Esta lectura no trae las filas, asi que no se inventan decisiones.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setCapa('ahora')}>Ahora</Button>
            <Button type="button" variant="outline" onClick={() => setCapa('resumen')}>Ver resumen del dia</Button>
          </div>
        </Capa>
      ) : null}

      {capa === 'resumen' ? (
        <Capa titulo={`RESUMEN DEL DIA - ${DIAS.find((dia) => dia.key === selectedDay)?.label ?? selectedDay}`} onClose={() => setCapa(null)}>
          <div className="flex items-center justify-between text-sm">
            <span>{DIAS.find((dia) => dia.key === selectedDay)?.label}</span>
            <span className="text-muted-foreground">{hora12(new Date().getHours(), new Date().getMinutes())}</span>
          </div>
          <ResumenMetricas puntos={puntos} hora={resumenHora} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Punto en el tiempo</p>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{hora12(resumenHora, 0)}</span>
              <input
                type="range"
                min={0}
                max={23}
                value={resumenHora}
                onChange={(event) => setResumenHora(Number(event.target.value))}
                className="w-32"
              />
            </label>
          </div>
        </Capa>
      ) : null}
    </div>
  )
}

function PanelSeparado({
  metrica,
  puntos,
  horas,
  esHoy,
  valor,
  abierto,
  tempViva,
  humViva,
  onRango,
  onDetalle,
}: {
  metrica: Metrica
  puntos: Punto[]
  horas: number
  esHoy: boolean
  valor: string
  abierto: boolean
  tempViva: number
  humViva: number
  onRango: (horas: number) => void
  onDetalle: () => void
}) {
  const titulo = metrica === 'temperatura' ? 'TEMPERATURA' : metrica === 'humedad' ? 'HUMEDAD' : 'POTENCIA'
  const unidad = metrica === 'temperatura' ? 'C' : '%'
  const datos = ventana(puntos, horas, esHoy)
  const listaPicos = picos(puntos, metrica)
  const listaAlertas = alertas(puntos, metrica)
  return (
        <Card className="bg-card border-border">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium" style={{ color: COLORES[metrica] }}>{titulo}</p>
          <p className="text-xs text-muted-foreground">{valor}</p>
        </div>
        <div className="flex gap-1">
          {RANGOS.map((rango) => (
            <button
              key={rango}
              type="button"
              onClick={() => onRango(rango)}
              className={cn(
                'h-7 flex-1 rounded-full border text-[11px]',
                horas === rango ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground',
              )}
            >
              {rango}h
            </button>
          ))}
        </div>
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#333" vertical={false} />
              <XAxis dataKey="etiqueta" stroke="#666" />
              <YAxis stroke="#666" width={32} domain={metrica === 'temperatura' ? [0, 40] : [0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} />
              <Line type="monotone" dataKey={metrica} name={titulo} stroke={COLORES[metrica]} strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
              </div>
        <p className="text-[11px] text-foreground">{statsLinea(puntos, metrica)}</p>
        <div className="grid grid-cols-2 gap-2">
          {barras(puntos, metrica).map((barra) => (
            <div key={barra.nombre} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground w-14">{barra.nombre}</span>
              <span className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                <span className="block h-full" style={{ width: `${Math.min(100, (barra.horas * 100) / 24)}%`, background: barra.color }} />
              </span>
              <span>{barra.horas}h</span>
            </div>
          ))}
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">{pie(puntos, metrica, tempViva, humViva)}</p>
          <button type="button" onClick={onDetalle} className="text-[11px] text-muted-foreground underline shrink-0">
            {abierto ? '^ ocultar' : 'v picos y alertas'}
          </button>
        </div>
        {abierto ? (
          <div className="space-y-1 text-[11px]">
            <p className="font-medium text-muted-foreground">PICOS DEL DIA</p>
            {listaPicos.length === 0 ? <p className="text-muted-foreground">--</p> : listaPicos.map((pico) => (
              <div key={pico.hora} className="flex justify-between">
                <span>{pico.hora}h</span>
                <span>{Math.round(pico.valor)}{metrica === 'potencia' ? 'W' : unidad}</span>
              </div>
            ))}
            <p className="font-medium text-muted-foreground pt-1">ALERTAS</p>
            {listaAlertas.length === 0 ? (
              <p>Sin cruces de umbral relevantes hoy</p>
            ) : listaAlertas.map((alerta) => (
              <div key={`${alerta.hora}-${alerta.texto}`} className="flex justify-between gap-2">
                <span>{alerta.texto}</span>
                <span className="text-muted-foreground">{alerta.hora}h</span>
              </div>
            ))}
            </div>
        ) : null}
          </CardContent>
        </Card>
  )
}

function Chispa({ puntos, metrica }: { puntos: Punto[]; metrica: Metrica }) {
  const lista = valores(puntos, metrica)
  if (lista.length < 2) {
    return <span className="w-10 h-6" />
  }
  const min = Math.min(...lista.map((item) => item.valor))
  const max = Math.max(...lista.map((item) => item.valor))
  const span = max - min || 1
  const d = lista
    .map((item, index) => {
      const x = (index / (lista.length - 1)) * 40
      const y = 22 - ((item.valor - min) / span) * 18
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox="0 0 40 24" className="w-10 h-6 shrink-0">
      <path d={d} fill="none" stroke={COLORES[metrica]} strokeWidth="1.5" />
    </svg>
  )
}

function Capa({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-4 space-y-3" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TarjetaAhora({ nombre, valor, nota }: { nombre: string; valor: string; nota: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{nombre}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{nota}</p>
    </div>
  )
}

function ResumenMetricas({ puntos, hora }: { puntos: Punto[]; hora: number }) {
  const filas: { titulo: string; metrica: Metrica; entero: boolean }[] = [
    { titulo: 'TEMPERATURA (C)', metrica: 'temperatura', entero: false },
    { titulo: 'HUMEDAD (%)', metrica: 'humedad', entero: false },
    { titulo: 'POTENCIA (W)', metrica: 'potencia', entero: true },
  ]
  return (
    <div className="space-y-2">
      {filas.map((fila) => {
        const lista = valores(puntos, fila.metrica)
        const punto = puntos[hora]?.[fila.metrica]
        const texto = (value: number | null | undefined) => {
          if (value === null || value === undefined || !Number.isFinite(value)) return '--'
          return fila.entero ? String(Math.round(value)) : value.toFixed(1)
        }
        const linea = lista.length === 0
          ? 'MIN --  MAX --  PROM --  ACT --'
          : `MIN ${texto(Math.min(...lista.map((item) => item.valor)))}  MAX ${texto(Math.max(...lista.map((item) => item.valor)))}  PROM ${texto(lista.reduce((sum, item) => sum + item.valor, 0) / lista.length)}  ACT ${texto(punto)}`
        return (
          <div key={fila.titulo} className="rounded-md border border-border px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{fila.titulo}</p>
            <p className="text-xs text-foreground">{linea}</p>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">
        Temp {textoPunto(puntos[hora]?.temperatura, false)} C   Hum {textoPunto(puntos[hora]?.humedad, false)} %   Pot {textoPunto(puntos[hora]?.potencia, true)} W
      </p>
    </div>
  )
}

function textoPunto(value: number | null | undefined, entero: boolean) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return entero ? String(Math.round(value)) : value.toFixed(1)
}
