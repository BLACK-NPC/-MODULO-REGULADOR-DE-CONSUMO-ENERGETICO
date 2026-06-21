export const FAB_STORAGE_KEY_POS = 'avc-voice-fab-position'
export const FAB_STORAGE_KEY_HIDDEN = 'avc-voice-fab-hidden'
export const FAB_HIDDEN_CHANGE_EVENT = 'avc-fab-hidden-change'

export function isFabHidden(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(FAB_STORAGE_KEY_HIDDEN) === 'true'
}

export function setFabHidden(hidden: boolean): void {
  localStorage.setItem(FAB_STORAGE_KEY_HIDDEN, hidden ? 'true' : 'false')
  window.dispatchEvent(new Event(FAB_HIDDEN_CHANGE_EVENT))
}
