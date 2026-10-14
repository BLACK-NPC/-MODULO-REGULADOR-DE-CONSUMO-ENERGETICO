import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const VOZ = 'es-MX-JorgeNeural'
const TOPE = 600

function escapar(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(request: Request) {
  const clave = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION || 'eastus'
  if (!clave || !/^[a-z0-9]+$/i.test(region)) {
    return NextResponse.json({ error: 'sin voz' }, { status: 503 })
  }

  let texto = ''
  try {
    const body = await request.json()
    texto = typeof body?.texto === 'string' ? body.texto.trim() : ''
  } catch {
    return NextResponse.json({ error: 'texto' }, { status: 400 })
  }
  if (!texto || texto.length > TOPE) {
    return NextResponse.json({ error: 'texto' }, { status: 400 })
  }

  const ssml = `<speak version="1.0" xml:lang="es-MX"><voice name="${VOZ}">${escapar(texto)}</voice></speak>`
  const respuesta = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': clave,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'EcoPulse',
    },
    body: ssml,
  })
  if (!respuesta.ok) {
    return NextResponse.json({ error: 'azure' }, { status: 502 })
  }

  const audio = await respuesta.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
