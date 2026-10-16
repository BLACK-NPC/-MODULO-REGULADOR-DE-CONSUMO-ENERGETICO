'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const SVG_URL = '/vientodux-presentacion-negro.svg'
/** El archivo dura 8s y a los 7.1s empieza a salir. Se sostiene el logo ya armado. */
const QUIETO_S = 7.1

export function PresentacionIcono({ onListo }: { onListo: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const listo = useRef(false)
  const inicioMs = useRef(0)
  const [markup, setMarkup] = useState<string | null>(null)

  const soltar = useCallback(() => {
    if (listo.current) return
    listo.current = true
    onListo()
  }, [onListo])

  useEffect(() => {
    let vivo = true
    fetch(SVG_URL)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.text()
      })
      .then((text) => {
        if (vivo) setMarkup(text)
      })
      .catch(() => {
        if (vivo) soltar()
      })
    return () => {
      vivo = false
    }
  }, [soltar])

  useLayoutEffect(() => {
    if (!markup || !hostRef.current) return

    let vivo = true
    let cuadro = 0

    const animar = () => {
      if (!vivo) return
      const svg = hostRef.current?.querySelector('svg') as SVGSVGElement | null
      if (svg?.setCurrentTime) {
        if (!inicioMs.current) {
          svg.pauseAnimations()
          inicioMs.current = performance.now()
        }
        const t = (performance.now() - inicioMs.current) / 1000
        if (t >= QUIETO_S) {
          svg.setCurrentTime(QUIETO_S)
          soltar()
          return
        }
        svg.setCurrentTime(t)
      }
      cuadro = requestAnimationFrame(animar)
    }

    cuadro = requestAnimationFrame(animar)
    const limite = window.setTimeout(soltar, 15000)
    return () => {
      vivo = false
      cancelAnimationFrame(cuadro)
      window.clearTimeout(limite)
    }
  }, [markup, soltar])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div
        ref={hostRef}
        className="h-[min(100vw,100vh)] w-[min(100vw,100vh)] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
        {...(markup ? { dangerouslySetInnerHTML: { __html: markup } } : {})}
      />
    </div>
  )
}
