'use client'

import { useEffect } from 'react'

export function PresentacionIcono({ onListo }: { onListo: () => void }) {
  useEffect(() => {
    onListo()
  }, [onListo])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <img
        src="/vientodux-logo.jpg"
        alt="Vientodux"
        className="h-[min(100vw,100vh)] w-[min(100vw,100vh)] object-contain"
        onLoad={onListo}
        onError={onListo}
      />
    </div>
  )
}
