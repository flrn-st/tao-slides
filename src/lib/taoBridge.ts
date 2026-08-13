export interface AppTheme {
  mode: 'light' | 'dark'
  tokens: Record<string, string>
}

export interface StorageEntry {
  key: string
  size: number
  updatedAt: number
}

export class BridgeError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

export const embedded = typeof window !== 'undefined' && window.parent !== window

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<number, Pending>()
const themeListeners = new Set<(theme: AppTheme) => void>()
let nextId = 1
let listening = false

const TIMEOUT_MS = 15_000

function isRes(data: unknown): data is { type: 'aw:bridge:res'; id: number; ok: boolean; data?: unknown; error?: { code: string; message: string } } {
  const d = data as { type?: string; id?: unknown } | null
  return Boolean(d && d.type === 'aw:bridge:res' && typeof d.id === 'number')
}

function isEvent(data: unknown): data is { type: 'aw:bridge:event'; event: string; data: unknown } {
  const d = data as { type?: string; event?: unknown } | null
  return Boolean(d && d.type === 'aw:bridge:event' && typeof d.event === 'string')
}

function ensureListener(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (isRes(data)) {
      const slot = pending.get(data.id)
      if (!slot) return
      pending.delete(data.id)
      clearTimeout(slot.timer)
      if (data.ok) slot.resolve(data.data)
      else slot.reject(new BridgeError(data.error?.code ?? 'error', data.error?.message ?? 'The request failed'))
      return
    }
    if (isEvent(data) && data.event === 'theme') {
      const theme = data.data as AppTheme
      themeListeners.forEach((cb) => cb(theme))
    }
  })
}

function call(method: string, params?: Record<string, unknown>): Promise<unknown> {
  ensureListener()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new BridgeError('timeout', `${method} timed out`))
    }, TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    window.parent.postMessage({ type: 'aw:bridge', id, method, params }, '*')
  })
}

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme.mode === 'dark')
  for (const [name, value] of Object.entries(theme.tokens)) {
    if (value) root.style.setProperty(name, value)
  }
}

export function onThemeChange(cb: (theme: AppTheme) => void): () => void {
  ensureListener()
  themeListeners.add(cb)
  return () => {
    themeListeners.delete(cb)
  }
}

export function bridgeReady(): Promise<AppTheme> {
  return call('ready') as Promise<AppTheme>
}

export function themeGet(): Promise<AppTheme> {
  return call('theme.get') as Promise<AppTheme>
}

export function storageList(): Promise<StorageEntry[]> {
  return call('storage.list').then((data) => {
    if (Array.isArray(data)) return data as StorageEntry[]
    const items = (data as { items?: StorageEntry[] } | null)?.items
    return items ?? []
  })
}

export function storageGet(key: string): Promise<string> {
  return call('storage.get', { key }) as Promise<string>
}

export function storagePut(key: string, value: string): Promise<void> {
  return call('storage.put', { key, value }).then(() => undefined)
}

export function storageDelete(key: string): Promise<void> {
  return call('storage.delete', { key }).then(() => undefined)
}

export async function initTheme(): Promise<void> {
  if (!embedded) return
  try {
    const theme = await bridgeReady()
    applyTheme(theme)
    onThemeChange(applyTheme)
  } catch (err) {
    console.warn('theme bridge unavailable', err)
  }
}

const LOCAL_PREFIX = 'slides:'

function localKey(key: string): string {
  return LOCAL_PREFIX + key
}

function isOurLocalKey(full: string): boolean {
  return full.startsWith(LOCAL_PREFIX)
}

export interface KvStorage {
  list(): Promise<StorageEntry[]>
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

const bridgeStorage: KvStorage = {
  async list() {
    return storageList()
  },
  async get(key) {
    try {
      return await storageGet(key)
    } catch (err) {
      if (err instanceof BridgeError && (err.code === 'not_found' || err.code === 'timeout')) return null
      throw err
    }
  },
  async put(key, value) {
    await storagePut(key, value)
  },
  async delete(key) {
    await storageDelete(key)
  },
}

const localStorageBackend: KvStorage = {
  async list() {
    const items: StorageEntry[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i)
      if (!full || !isOurLocalKey(full)) continue
      const key = full.slice(LOCAL_PREFIX.length)
      const value = localStorage.getItem(full) ?? ''
      items.push({ key, size: value.length, updatedAt: 0 })
    }
    return items
  },
  async get(key) {
    return localStorage.getItem(localKey(key))
  },
  async put(key, value) {
    try {
      localStorage.setItem(localKey(key), value)
    } catch (err) {
      const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)
      if (quota) {
        console.warn('localStorage quota exceeded; large decks may not persist standalone', err)
      }
      throw err
    }
  },
  async delete(key) {
    localStorage.removeItem(localKey(key))
  },
}

export const storage: KvStorage = embedded ? bridgeStorage : localStorageBackend
