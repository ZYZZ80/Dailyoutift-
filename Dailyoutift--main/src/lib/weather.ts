export interface WeatherInfo {
  temp: number
  unit: 'C'
  description: string
  icon: string // emoji
}

const WMO_DESCRIPTIONS: Record<number, [string, string]> = {
  0:  ['Clear sky', '☀️'],
  1:  ['Mainly clear', '🌤️'],
  2:  ['Partly cloudy', '⛅'],
  3:  ['Overcast', '☁️'],
  45: ['Foggy', '🌫️'],
  48: ['Foggy', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌧️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '❄️'],
  75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'],
  81: ['Rain showers', '🌦️'],
  82: ['Heavy showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'],
  99: ['Thunderstorm', '⛈️'],
}

function getWmoDescription(code: number): [string, string] {
  if (WMO_DESCRIPTIONS[code]) return WMO_DESCRIPTIONS[code]
  // Find nearest code
  const nearest = Object.keys(WMO_DESCRIPTIONS)
    .map(Number)
    .filter((k) => k <= code)
    .sort((a, b) => b - a)[0]
  return WMO_DESCRIPTIONS[nearest] ?? ['Unknown', '🌡️']
}

function getLocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { timeout: 6000, maximumAge: 600_000 },
    )
  })
}

export async function fetchWeather(): Promise<WeatherInfo | null> {
  try {
    const coords = await getLocation()
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weathercode&timezone=auto`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const temp = Math.round(data.current?.temperature_2m ?? 0)
    const code = data.current?.weathercode ?? 0
    const [description, icon] = getWmoDescription(code)
    return { temp, unit: 'C', description, icon }
  } catch {
    return null
  }
}

export function weatherToPromptHint(w: WeatherInfo): string {
  const feel = w.temp <= 5 ? 'very cold' : w.temp <= 12 ? 'cold' : w.temp <= 18 ? 'cool' : w.temp <= 24 ? 'warm' : 'hot'
  return `Weather today: ${w.description}, ${w.temp}°C (${feel}). Choose appropriate layers, fabrics and coverage.`
}
