'use client'

import { useState, useEffect } from 'react'
import { Cloud, MapPin, Thermometer, Droplets, Wind, Search, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface WeatherData {
  temperature: number
  humidity: number
  windspeed: number
  weathercode: number
  time: string
}

interface HourlyForecast {
  time: string
  temperature: number
  humidity: number
  windspeed: number
}

interface FormErrors {
  ciudad?: string
}

export function DatosExternosPage() {
  const [ciudad, setCiudad] = useState('')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [hourlyData, setHourlyData] = useState<HourlyForecast[]>([])
  const [publicIP, setPublicIP] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [ipLoading, setIpLoading] = useState(true)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [locationName, setLocationName] = useState('')

  // Fetch IP publica al cargar
  useEffect(() => {
    const fetchIP = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        const data = await response.json()
        setPublicIP(data.ip)
      } catch (error) {
        console.error('Error fetching IP:', error)
        setPublicIP('No disponible')
      } finally {
        setIpLoading(false)
      }
    }
    fetchIP()
  }, [])

  // Validacion del formulario
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    
    if (!ciudad.trim()) {
      newErrors.ciudad = 'El nombre de la ciudad es requerido'
    } else if (ciudad.trim().length < 2) {
      newErrors.ciudad = 'El nombre debe tener al menos 2 caracteres'
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(ciudad)) {
      newErrors.ciudad = 'Solo se permiten letras y espacios'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Manejo del submit del formulario
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormSubmitted(true)

    if (!validateForm()) {
      return
    }

    setLoading(true)
    setWeather(null)
    setHourlyData([])

    try {
      // Primero geocodificar la ciudad usando Open-Meteo
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`
      )
      const geoData = await geoResponse.json()

      if (!geoData.results || geoData.results.length === 0) {
        setErrors({ ciudad: 'Ciudad no encontrada. Intenta con otro nombre.' })
        setLoading(false)
        return
      }

      const { latitude, longitude, name, country } = geoData.results[0]
      setLocationName(`${name}, ${country}`)

      // Obtener datos del clima
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto&forecast_days=1`
      )
      const weatherData = await weatherResponse.json()

      setWeather({
        temperature: weatherData.current.temperature_2m,
        humidity: weatherData.current.relative_humidity_2m,
        windspeed: weatherData.current.wind_speed_10m,
        weathercode: weatherData.current.weather_code,
        time: weatherData.current.time,
      })

      // Procesar datos por hora para la tabla
      const hourly: HourlyForecast[] = weatherData.hourly.time.slice(0, 12).map((time: string, index: number) => ({
        time: new Date(time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        temperature: weatherData.hourly.temperature_2m[index],
        humidity: weatherData.hourly.relative_humidity_2m[index],
        windspeed: weatherData.hourly.wind_speed_10m[index],
      }))
      setHourlyData(hourly)
      setErrors({})
    } catch (error) {
      console.error('Error fetching weather:', error)
      setErrors({ ciudad: 'Error al obtener datos del clima. Intenta de nuevo.' })
    } finally {
      setLoading(false)
    }
  }

  const getWeatherDescription = (code: number): string => {
    const descriptions: Record<number, string> = {
      0: 'Despejado',
      1: 'Principalmente despejado',
      2: 'Parcialmente nublado',
      3: 'Nublado',
      45: 'Niebla',
      48: 'Niebla con escarcha',
      51: 'Llovizna ligera',
      53: 'Llovizna moderada',
      55: 'Llovizna densa',
      61: 'Lluvia ligera',
      63: 'Lluvia moderada',
      65: 'Lluvia fuerte',
      80: 'Chubascos ligeros',
      81: 'Chubascos moderados',
      82: 'Chubascos violentos',
      95: 'Tormenta',
      96: 'Tormenta con granizo ligero',
      99: 'Tormenta con granizo fuerte',
    }
    return descriptions[code] || 'Desconocido'
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <h2 className="text-2xl font-bold text-foreground">Datos Externos</h2>
        <p className="text-muted-foreground">Consulta condiciones climaticas externas y comparalas con tu modulo</p>
      </header>

      <section aria-labelledby="ip-section">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">IP Publica del Panel</p>
                  <p className="text-lg font-mono text-foreground">
                    {ipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : publicIP}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">via api.ipify.org</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="weather-form-section">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Consultar Clima por Ciudad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label htmlFor="ciudad" className="text-sm font-medium text-foreground">
                  Nombre de la Ciudad
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="ciudad"
                      type="text"
                      value={ciudad}
                      onChange={(e) => {
                        setCiudad(e.target.value)
                        if (formSubmitted) validateForm()
                      }}
                      placeholder="Ej: Bogota, Madrid, Mexico"
                      className={`bg-secondary border-border ${errors.ciudad ? 'border-red-500' : ''}`}
                      aria-describedby={errors.ciudad ? 'ciudad-error' : undefined}
                      aria-invalid={errors.ciudad ? 'true' : 'false'}
                    />
                    {errors.ciudad && (
                      <p id="ciudad-error" className="text-red-400 text-sm mt-1" role="alert">
                        {errors.ciudad}
                      </p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Buscar</span>
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {weather && (
        <section aria-labelledby="weather-results">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle id="weather-results" className="text-lg text-foreground flex items-center gap-2">
                <Cloud className="w-5 h-5" />
                Clima Actual en {locationName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-muted-foreground">Temperatura</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{weather.temperature}°C</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-muted-foreground">Humedad</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{weather.humidity}%</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Wind className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-muted-foreground">Viento</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{weather.windspeed} km/h</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Cloud className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-muted-foreground">Condicion</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{getWeatherDescription(weather.weathercode)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {hourlyData.length > 0 && (
        <section aria-labelledby="hourly-table">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle id="hourly-table" className="text-lg text-foreground">
                Pronostico por Hora - {locationName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">Hora</TableHead>
                      <TableHead className="text-muted-foreground">Temperatura</TableHead>
                      <TableHead className="text-muted-foreground">Humedad</TableHead>
                      <TableHead className="text-muted-foreground">Viento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hourlyData.map((hour, index) => (
                      <TableRow key={index} className="border-border">
                        <TableCell className="font-medium text-foreground">{hour.time}</TableCell>
                        <TableCell className="text-red-400">{hour.temperature}°C</TableCell>
                        <TableCell className="text-blue-400">{hour.humidity}%</TableCell>
                        <TableCell className="text-cyan-400">{hour.windspeed} km/h</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <footer className="border-t border-border pt-4 mt-8">
        <p className="text-xs text-muted-foreground text-center">
          Datos climaticos proporcionados por Open-Meteo API | IP publica via IPify API
        </p>
      </footer>
    </div>
  )
}
