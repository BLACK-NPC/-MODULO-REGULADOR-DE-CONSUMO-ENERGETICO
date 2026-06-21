export interface WeatherSummary {
  locationName: string
  temperature: number
  humidity: number
  windspeed: number
  description: string
}

const WEATHER_DESCRIPTIONS: Record<number, string> = {
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

export function getWeatherDescription(code: number): string {
  return WEATHER_DESCRIPTIONS[code] ?? 'Desconocido'
}

export async function fetchWeatherByCity(city: string): Promise<WeatherSummary> {
  const geoResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`
  )
  const geoData = await geoResponse.json()

  if (!geoData.results?.length) {
    throw new Error(`No encontré la ciudad "${city}"`)
  }

  const { latitude, longitude, name, country } = geoData.results[0]
  const locationName = `${name}, ${country}`

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`
  )
  const weatherData = await weatherResponse.json()

  return {
    locationName,
    temperature: weatherData.current.temperature_2m,
    humidity: weatherData.current.relative_humidity_2m,
    windspeed: weatherData.current.wind_speed_10m,
    description: getWeatherDescription(weatherData.current.weather_code),
  }
}

export function formatWeatherSummary(weather: WeatherSummary): string {
  return [
    `Clima en ${weather.locationName}:`,
    weather.description,
    `${weather.temperature} grados`,
    `humedad ${weather.humidity} por ciento`,
    `viento ${weather.windspeed} kilómetros por hora`,
  ].join('. ')
}

export async function fetchWeatherSummary(city: string): Promise<string> {
  const weather = await fetchWeatherByCity(city)
  return formatWeatherSummary(weather)
}
