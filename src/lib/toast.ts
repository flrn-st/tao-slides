export type ToastTone = 'info' | 'error'

export interface ToastMessage {
  id: number
  message: string
  tone: ToastTone
}

type Listener = (toast: ToastMessage | null) => void

const listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | null = null
let nextId = 1

export function toast(message: string, tone: ToastTone = 'info'): void {
  const entry: ToastMessage = { id: nextId++, message, tone }
  listeners.forEach((l) => l(entry))
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    listeners.forEach((l) => l(null))
  }, 5000)
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
