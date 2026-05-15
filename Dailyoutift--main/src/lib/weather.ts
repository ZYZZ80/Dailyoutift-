export interface WeatherInfo {
  temp: number
  unit: 'C'
  description: string
  code: number
  fetchedAt: string
}

const CACHE_KEY = 'daily-stylist-weather-v1'
const CACHE_TTL_MS = 30 * 60 * 1000

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
}

function getDescription(code: number) {
  return WMO_DESCRIPTIONS[code] ?? 'Current weather'
}

function getCachedWeather(): WeatherInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherInfo
    if (!parsed.fetchedAt) return null
    if (Date.now() - new Date(parsed.fetchedAt).getTime() > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedWeather(weather: WeatherInfo) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(weather))
  } catch {
    /* ignore cache failures */
  }
}

function getLocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.message || 'Location permission was denied.')),
      { timeout: 7000, maximumAge: 30 * 60 * 1000, enableHighAccuracy: false },
    )
  })
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

export async function fetchWeather(): Promise<WeatherInfo | null> {
  const cached = getCachedWeather()
  if (cached) return cached

  try {
    const coords = await getLocation()
    const params = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      current: 'temperature_2m,weather_code',
      timezone: 'auto',
    })
    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, 6000)
    if (!res.ok) return null
    const data = await res.json()
    const code = Number(data.current?.weather_code ?? data.current?.weathercode ?? 0)
    const weather: WeatherInfo = {
      temp: Math.round(Number(data.current?.temperature_2m ?? 0)),
      unit: 'C',
      description: getDescription(code),
      code,
      fetchedAt: new Date().toISOString(),
    }
    saveCachedWeather(weather)
    return weather
  } catch {
    return null
  }
}

export function weatherToPromptHint(weather: WeatherInfo): string {
  const feel =
    weather.temp <= 5 ? 'very cold' :
    weather.temp <= 12 ? 'cold' :
    weather.temp <= 18 ? 'cool' :
    weather.temp <= 25 ? 'warm' :
    'hot'

  return `Weather today: ${weather.description}, ${weather.temp} C (${feel}). Choose suitable layers, fabrics, shoes, and coverage.`
}
