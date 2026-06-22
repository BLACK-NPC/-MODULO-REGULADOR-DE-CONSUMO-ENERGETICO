let activeUtterance: SpeechSynthesisUtterance | null = null

export function speak(text: string, lang = 'es-CO'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.95

    const finish = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null
      }
      resolve()
    }

    utterance.onend = finish
    utterance.onerror = finish

    activeUtterance = utterance
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  activeUtterance = null
  window.speechSynthesis?.cancel()
}
