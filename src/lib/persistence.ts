import { nanoid } from 'nanoid'
import { useEditor, type DeckIndexEntry } from '../store'
import type { Deck } from '../types'
import { createDefaultDeck } from './templates'
import { deepClone } from './utils'
import { embedded, storage, BridgeError } from './taoBridge'
import { toast } from './toast'

const INDEX_KEY = 'decks.index'
const DECK_PREFIX = 'deck.'
const SCHEMA = 1
const SAVE_DEBOUNCE_MS = 800

type DeckRecord = { schema: number; deck: Deck }

let booted = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave = false
let saving: Promise<void> | null = null

function deckKey(id: string): string {
  return DECK_PREFIX + id
}

function isTooLarge(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const code = err instanceof BridgeError ? err.code : ''
  return /32\s*MB|too large|values are limited/i.test(msg) || code === 'invalid'
}

function isQuota(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)
}

async function readIndex(): Promise<DeckIndexEntry[]> {
  const raw = await storage.get(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as DeckIndexEntry[]) : []
  } catch {
    return []
  }
}

async function writeIndex(entries: DeckIndexEntry[]): Promise<void> {
  await storage.put(INDEX_KEY, JSON.stringify(entries))
}

function upsertIndex(entries: DeckIndexEntry[], next: DeckIndexEntry): DeckIndexEntry[] {
  const i = entries.findIndex((e) => e.id === next.id)
  const copy = [...entries]
  if (i >= 0) copy[i] = next
  else copy.unshift(next)
  copy.sort((a, b) => b.updatedAt - a.updatedAt)
  return copy
}

async function putDeck(id: string, deck: Deck): Promise<void> {
  const rec: DeckRecord = { schema: SCHEMA, deck }
  await storage.put(deckKey(id), JSON.stringify(rec))
}

async function getDeck(id: string): Promise<Deck | null> {
  const raw = await storage.get(deckKey(id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DeckRecord | Deck
    if (parsed && typeof parsed === 'object' && 'deck' in parsed) return parsed.deck
    if (parsed && typeof parsed === 'object' && 'slides' in parsed) return parsed as Deck
    return null
  } catch {
    return null
  }
}

async function removeDeck(id: string): Promise<void> {
  await storage.delete(deckKey(id))
}

function setSavedIdle(): void {
  useEditor.getState().setSaveState(embedded ? 'saved' : 'local')
}

export async function saveNow(): Promise<void> {
  const { deckId, deck } = useEditor.getState()
  if (!deckId) return
  if (saving) await saving
  useEditor.getState().setSaveState('saving')
  const run = (async () => {
    try {
      await putDeck(deckId, deck)
      const index = upsertIndex(await readIndex(), {
        id: deckId,
        title: deck.title || 'Untitled',
        slideCount: deck.slides.length,
        updatedAt: Date.now(),
      })
      await writeIndex(index)
      useEditor.getState().setDeckIndex(index)
      setSavedIdle()
    } catch (err) {
      useEditor.getState().setSaveState('error')
      if (isTooLarge(err)) {
        toast('Deck too large to sync — reduce image sizes', 'error')
      } else if (isQuota(err)) {
        console.warn('storage quota exceeded', err)
        toast('Could not save locally — storage is full', 'error')
      } else {
        console.error(err)
        toast('Failed to save deck', 'error')
      }
    }
  })()
  saving = run
  try {
    await run
  } finally {
    if (saving === run) saving = null
  }
}

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pendingSave) {
    pendingSave = false
    await saveNow()
  }
}

function scheduleSave(): void {
  if (!booted) return
  pendingSave = true
  useEditor.getState().setSaveState('saving')
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    pendingSave = false
    void saveNow()
  }, SAVE_DEBOUNCE_MS)
}

function subscribeAutosave(): void {
  useEditor.subscribe((state, prev) => {
    if (!booted) return
    if (state.deckId !== prev.deckId) return
    if (state.deck !== prev.deck) scheduleSave()
  })
}

export async function bootPersistence(): Promise<void> {
  try {
    const index = await readIndex()
    useEditor.getState().setDeckIndex(index)
    if (index.length > 0) {
      const latest = [...index].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const deck = await getDeck(latest.id)
      if (deck) {
        useEditor.getState().hydrateDeck(latest.id, deck)
        setSavedIdle()
        booted = true
        subscribeAutosave()
        return
      }
    }
    const id = nanoid()
    const deck = useEditor.getState().deck.slides.length ? useEditor.getState().deck : createDefaultDeck()
    useEditor.getState().hydrateDeck(id, deck)
    booted = true
    subscribeAutosave()
    await saveNow()
  } catch (err) {
    console.error('persistence boot failed', err)
    if (!useEditor.getState().deckId) {
      useEditor.getState().hydrateDeck(nanoid(), createDefaultDeck())
    }
    useEditor.getState().setSaveState('error')
    booted = true
    subscribeAutosave()
  }
}

export async function createNewDeck(): Promise<void> {
  await flushSave()
  useEditor.getState().newDeck()
  await saveNow()
}

export async function openDeck(id: string): Promise<void> {
  if (id === useEditor.getState().deckId) {
    useEditor.getState().closeModal()
    return
  }
  await flushSave()
  const deck = await getDeck(id)
  if (!deck) {
    toast('Deck not found', 'error')
    return
  }
  useEditor.getState().hydrateDeck(id, deck)
  useEditor.getState().closeModal()
  setSavedIdle()
}

export async function deleteDeck(id: string): Promise<void> {
  await flushSave()
  await removeDeck(id)
  let index = (await readIndex()).filter((e) => e.id !== id)
  await writeIndex(index)

  if (useEditor.getState().deckId === id) {
    if (index.length > 0) {
      const latest = [...index].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const deck = await getDeck(latest.id)
      if (deck) {
        useEditor.getState().hydrateDeck(latest.id, deck)
      } else {
        useEditor.getState().newDeck()
        await saveNow()
        index = await readIndex()
      }
    } else {
      useEditor.getState().newDeck()
      await saveNow()
      index = await readIndex()
    }
  }
  useEditor.getState().setDeckIndex(index)
  setSavedIdle()
}

export async function duplicateDeck(id: string): Promise<void> {
  await flushSave()
  const source =
    id === useEditor.getState().deckId ? useEditor.getState().deck : await getDeck(id)
  if (!source) {
    toast('Deck not found', 'error')
    return
  }
  const copy = deepClone(source)
  copy.title = copy.title ? `${copy.title} copy` : 'Untitled copy'
  useEditor.getState().hydrateDeck(nanoid(), copy)
  useEditor.getState().closeModal()
  await saveNow()
}

export async function importDeck(deck: Deck, fileName?: string): Promise<void> {
  await flushSave()
  useEditor.getState().loadDeck(deck, fileName)
  await saveNow()
}

export async function refreshIndex(): Promise<void> {
  useEditor.getState().setDeckIndex(await readIndex())
}
