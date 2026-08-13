import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Background,
  CurrentFormat,
  Deck,
  Paragraph,
  Shape,
  ShapeBase,
  Slide,
  TransitionType,
} from './types'
import { cloneSlide, createDefaultDeck, createSlide, BUILTIN_LAYOUTS } from './lib/templates'
import { deepClone, uid, clamp } from './lib/utils'

export type SaveState = 'saved' | 'saving' | 'error' | 'local'
export type EditorModal = { kind: 'slideSize' } | { kind: 'insertImage' } | { kind: 'openDeck' } | null

export interface DeckIndexEntry {
  id: string
  title: string
  slideCount: number
  updatedAt: number
}

interface ClipboardEntry {
  shapes: Shape[]
  sourceSlideId: string
  offsetX: number
  offsetY: number
}

interface EditorState {
  deck: Deck
  deckId: string
  saveState: SaveState
  deckIndex: DeckIndexEntry[]
  selectedSlideId: string | null
  selectedShapeIds: string[]
  zoom: number
  present: boolean
  presentIndex: number
  notesOpen: boolean
  modal: EditorModal
  currentFormat: CurrentFormat
  showGuides: boolean
  slideNumbering: boolean
  past: Deck[]
  future: Deck[]
  clipboard: ClipboardEntry | null
  lastCopyShapeIds: string[]
  loadedFileName: string | null

  // --- undo / redo ---
  commit: (updater: (draft: Deck) => void) => void
  undo: () => void
  redo: () => void

  // --- deck ---
  hydrateDeck: (id: string, deck: Deck, fileName?: string) => void
  newDeck: () => void
  loadDeck: (deck: Deck, fileName?: string) => void
  setSlideSize: (w: number, h: number) => void
  setDeckTitle: (title: string) => void
  setSaveState: (saveState: SaveState) => void
  setDeckIndex: (deckIndex: DeckIndexEntry[]) => void

  // --- selection ---
  selectSlide: (id: string | null) => void
  selectShape: (id: string | null) => void
  selectShapes: (ids: string[]) => void

  // --- slides ---
  addSlide: (layout?: string) => void
  duplicateSlide: () => void
  deleteSlide: () => void
  reorderSlide: (from: number, to: number) => void
  setSlideBackground: (bg: Background) => void
  setSlideLayout: (layout: string) => void
  setSlideNotes: (notes: string) => void
  setSlideTransition: (type: TransitionType, duration: number) => void

  // --- shapes ---
  addShape: (shape: Shape) => void
  patchShape: (id: string, patch: Partial<Shape>, quiet?: boolean) => void
  patchShapes: (ids: string[], patch: Partial<Shape>, quiet?: boolean) => void
  updateShapeBy: (id: string, updater: (s: Shape) => Shape, quiet?: boolean) => void
  commitPatches: (patches: Record<string, Partial<Shape>>, live: boolean) => void
  updateParagraphs: (shapeId: string, paragraphs: Paragraph[], quiet?: boolean) => void
  deleteShapes: (ids: string[]) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  copySelected: () => void
  paste: () => void
  bringForward: () => void
  sendBackward: () => void
  bringToFront: () => void
  sendToBack: () => void
  alignSelected: (align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void
  distributeSelected: (dir: 'horizontal' | 'vertical') => void
  applyLayout: (layoutId: string) => void

  // --- ui state ---
  setZoom: (zoom: number) => void
  openPresent: (index?: number) => void
  closePresent: () => void
  setPresentIndex: (index: number) => void
  toggleNotes: () => void
  openModal: (m: EditorState['modal']) => void
  closeModal: () => void
  setCurrentFormat: (f: Partial<CurrentFormat>) => void
  toggleGuides: () => void
  toggleSlideNumbering: () => void
}

const HISTORY_LIMIT = 100

function cloneDeck(deck: Deck): Deck {
  return deepClone(deck)
}

const INITIAL_DECK: Deck = createDefaultDeck()

export const useEditor = create<EditorState>((set, get) => ({
  deck: INITIAL_DECK,
  deckId: '',
  saveState: 'saving',
  deckIndex: [],
  selectedSlideId: INITIAL_DECK.slides[0]?.id ?? null,
  selectedShapeIds: [],
  zoom: 100,
  present: false,
  presentIndex: 0,
  notesOpen: false,
  modal: null,
  currentFormat: {},
  showGuides: true,
  slideNumbering: false,
  past: [],
  future: [],
  clipboard: null,
  lastCopyShapeIds: [],
  loadedFileName: null,

  commit: (updater) => {
    const { deck, past } = get()
    const draft = cloneDeck(deck)
    updater(draft)
    const next = [...past, cloneDeck(deck)].slice(-HISTORY_LIMIT)
    set({ deck: draft, past: next, future: [] })
  },

  undo: () => {
    const { past, future, deck } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    set({
      deck: prev,
      past: past.slice(0, -1),
      future: [cloneDeck(deck), ...future].slice(0, HISTORY_LIMIT),
      selectedShapeIds: [],
    })
  },

  redo: () => {
    const { past, future, deck } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      deck: next,
      future: future.slice(1),
      past: [...past, cloneDeck(deck)].slice(-HISTORY_LIMIT),
      selectedShapeIds: [],
    })
  },

  hydrateDeck: (id, deck, fileName) => {
    set({
      deckId: id,
      deck,
      selectedSlideId: deck.slides[0]?.id ?? null,
      selectedShapeIds: [],
      past: [],
      future: [],
      loadedFileName: fileName ?? null,
      zoom: 100,
    })
  },

  newDeck: () => {
    get().hydrateDeck(nanoid(), createDefaultDeck())
  },

  loadDeck: (deck, fileName) => {
    get().hydrateDeck(nanoid(), deck, fileName)
  },

  setSaveState: (saveState) => set({ saveState }),
  setDeckIndex: (deckIndex) => set({ deckIndex }),

  setSlideSize: (w, h) => {
    get().commit((d) => {
      d.slideWidth = w
      d.slideHeight = h
    })
  },

  setDeckTitle: (title) => {
    get().commit((d) => {
      d.title = title
    })
  },

  selectSlide: (id) => {
    if (get().selectedSlideId === id && id !== null) return
    set({ selectedSlideId: id, selectedShapeIds: [] })
  },

  selectShape: (id) => set({ selectedShapeIds: id ? [id] : [] }),

  selectShapes: (ids) => set({ selectedShapeIds: ids }),

  addSlide: (layout) => {
    const { deck, selectedSlideId } = get()
    const idx = deck.slides.findIndex((s) => s.id === selectedSlideId)
    const s = createSlide(layout, deck.slideWidth, deck.slideHeight)
    get().commit((d) => {
      d.slides.splice(idx + 1, 0, s)
    })
    get().selectSlide(s.id)
  },

  duplicateSlide: () => {
    const { deck, selectedSlideId } = get()
    if (!selectedSlideId) return
    const idx = deck.slides.findIndex((s) => s.id === selectedSlideId)
    if (idx < 0) return
    const copy = cloneSlide(deck.slides[idx])
    get().commit((d) => {
      d.slides.splice(idx + 1, 0, copy)
    })
    get().selectSlide(copy.id)
  },

  deleteSlide: () => {
    const { deck, selectedSlideId } = get()
    if (!selectedSlideId || deck.slides.length <= 1) return
    const idx = deck.slides.findIndex((s) => s.id === selectedSlideId)
    get().commit((d) => {
      d.slides.splice(idx, 1)
    })
    const next = deck.slides[Math.max(0, idx - 1)] ?? deck.slides[0]
    get().selectSlide(next.id)
  },

  reorderSlide: (from, to) => {
    get().commit((d) => {
      const [s] = d.slides.splice(from, 1)
      d.slides.splice(to, 0, s)
    })
  },

  setSlideBackground: (bg) => {
    const id = get().selectedSlideId
    if (!id) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === id)
      if (s) s.background = bg
    })
  },

  setSlideLayout: (layout) => {
    const id = get().selectedSlideId
    if (!id) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === id)
      if (!s) return
      s.layout = layout
      // keep existing placeholders of the same kind, add missing ones
      const kinds = new Set(s.shapes.filter((sh) => 'placeholder' in sh && sh.placeholder).map((sh) => (sh as any).placeholder))
      getPlaceholders(layout, d).forEach((ph) => {
        const k = (ph as any).placeholder as string
        if (!kinds.has(k)) s.shapes.push(ph)
      })
    })
  },

  setSlideNotes: (notes) => {
    const id = get().selectedSlideId
    if (!id) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === id)
      if (s) s.notes = notes
    })
  },

  setSlideTransition: (type, duration) => {
    const id = get().selectedSlideId
    if (!id) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === id)
      if (s) s.transition = { type, duration }
    })
  },

  addShape: (shape) => {
    const id = get().selectedSlideId
    if (!id) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === id)
      if (s) s.shapes.push(shape)
    })
    get().selectShape(shape.id)
  },

  patchShape: (id, patch, quiet) => {
    if (quiet) {
      set((st) => ({
        deck: patchInDeck(st.deck, id, patch),
      }))
      return
    }
    get().commit((d) => patchInDeck(d, id, patch))
  },

  commitPatches: (patches, live) => {
    if (live) {
      set((st) => {
        const d = cloneDeck(st.deck)
        for (const [id, patch] of Object.entries(patches)) {
          const s = findShape(d, id)
          if (s) Object.assign(s, patch)
        }
        return { deck: d }
      })
      return
    }
    get().commit((d) => {
      for (const [id, patch] of Object.entries(patches)) {
        const s = findShape(d, id)
        if (s) Object.assign(s, patch)
      }
    })
  },

  patchShapes: (ids, patch, quiet) => {
    if (quiet) {
      set((st) => {
        const d = deepClone(st.deck)
        for (const id of ids) patchInDeck(d, id, patch)
        return { deck: d }
      })
      return
    }
    get().commit((d) => {
      for (const id of ids) patchInDeck(d, id, patch)
    })
  },

  updateShapeBy: (id, updater, quiet) => {
    if (quiet) {
      set((st) => {
        const d = deepClone(st.deck)
        const s = findShape(d, id)
        if (s) Object.assign(s, updater(s))
        return { deck: d }
      })
      return
    }
    get().commit((d) => {
      const s = findShape(d, id)
      if (s) Object.assign(s, updater(s))
    })
  },

  updateParagraphs: (shapeId, paragraphs, quiet) => {
    if (quiet) {
      set((st) => {
        const d = deepClone(st.deck)
        const s = findShape(d, shapeId)
        if (s && !('paragraphs' in s)) return { deck: d }
        ;(s as any).paragraphs = paragraphs
        return { deck: d }
      })
      return
    }
    get().commit((d) => {
      const s = findShape(d, shapeId)
      if (s && 'paragraphs' in s) (s as any).paragraphs = paragraphs
    })
  },

  deleteShapes: (ids) => {
    const slideId = get().selectedSlideId
    if (!slideId) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === slideId)
      if (s) s.shapes = s.shapes.filter((sh) => !ids.includes(sh.id))
    })
    set({ selectedShapeIds: [] })
  },

  deleteSelected: () => {
    get().deleteShapes(get().selectedShapeIds)
  },

  duplicateSelected: () => {
    const { selectedShapeIds, selectedSlideId, deck } = get()
    if (selectedShapeIds.length === 0 || !selectedSlideId) return
    const slide = deck.slides.find((s) => s.id === selectedSlideId)
    if (!slide) return
    const copies = slide.shapes
      .filter((s) => selectedShapeIds.includes(s.id))
      .map((s) => {
        const copy: any = { ...deepClone(s), id: uid() }
        if ('x' in s) {
          copy.x = (s as ShapeBase).x + 20
          copy.y = (s as ShapeBase).y + 20
        }
        return copy
      })
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === selectedSlideId)
      if (s) s.shapes.push(...copies)
    })
    get().selectShapes(copies.map((c) => c.id))
  },

  copySelected: () => {
    const { selectedShapeIds, selectedSlideId, deck } = get()
    if (selectedShapeIds.length === 0 || !selectedSlideId) return
    const slide = deck.slides.find((s) => s.id === selectedSlideId)
    if (!slide) return
    const shapes = slide.shapes
      .filter((s) => selectedShapeIds.includes(s.id))
      .map((s) => deepClone(s))
    set({ clipboard: { shapes, sourceSlideId: selectedSlideId, offsetX: 0, offsetY: 0 }, lastCopyShapeIds: selectedShapeIds })
  },

  paste: () => {
    const { clipboard, selectedSlideId } = get()
    if (!clipboard || !selectedSlideId) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === selectedSlideId)
      if (!s) return
      const offset = 20
      for (const c of clipboard.shapes) {
        const copy: any = { ...deepClone(c), id: uid() }
        if ('x' in c) {
          copy.x = (c as ShapeBase).x + offset
          copy.y = (c as ShapeBase).y + offset
        }
        s.shapes.push(copy)
      }
    })
    set({ clipboard: { ...clipboard, offsetX: 999 } })
  },

  bringForward: () => {
    const { selectedShapeIds, selectedSlideId } = get()
    if (!selectedShapeIds.length || !selectedSlideId) return
    get().commit((d) => reorderShapes(d, selectedSlideId, (list, idx) => {
      if (idx < list.length - 1) {
        const [item] = list.splice(idx, 1)
        list.splice(Math.min(idx + 1, list.length), 0, item)
      }
    }))
  },

  sendBackward: () => {
    const { selectedShapeIds, selectedSlideId } = get()
    if (!selectedShapeIds.length || !selectedSlideId) return
    get().commit((d) => reorderShapes(d, selectedSlideId, (list, idx) => {
      if (idx > 0) {
        const [item] = list.splice(idx, 1)
        list.splice(Math.max(idx - 1, 0), 0, item)
      }
    }))
  },

  bringToFront: () => {
    const { selectedShapeIds, selectedSlideId } = get()
    if (!selectedShapeIds.length || !selectedSlideId) return
    get().commit((d) => reorderShapes(d, selectedSlideId, (list, idx) => {
      const [item] = list.splice(idx, 1)
      list.push(item)
    }))
  },

  sendToBack: () => {
    const { selectedShapeIds, selectedSlideId } = get()
    if (!selectedShapeIds.length || !selectedSlideId) return
    get().commit((d) => reorderShapes(d, selectedSlideId, (list, idx) => {
      const [item] = list.splice(idx, 1)
      list.unshift(item)
    }))
  },

  alignSelected: (align) => {
    const { selectedShapeIds, deck, selectedSlideId } = get()
    if (selectedShapeIds.length < 2 || !selectedSlideId) return
    const slide = deck.slides.find((s) => s.id === selectedSlideId)
    if (!slide) return
    const items = slide.shapes.filter((s) => selectedShapeIds.includes(s.id))
    if (items.length < 2) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === selectedSlideId)
      if (!s) return
      const its = s.shapes
        .filter((x) => selectedShapeIds.includes(x.id))
        .map((i) => i as ShapeBase)
      if (align === 'left') its.forEach((i) => (i.x = Math.min(...its.map((j) => j.x))))
      if (align === 'right') its.forEach((i) => (i.x = Math.max(...its.map((j) => j.x + j.width)) - i.width))
      if (align === 'center') its.forEach((i) => (i.x = Math.min(...its.map((j) => j.x)) + (Math.max(...its.map((j) => j.x + j.width)) - Math.min(...its.map((j) => j.x))) / 2 - i.width / 2))
      if (align === 'top') its.forEach((i) => (i.y = Math.min(...its.map((j) => j.y))))
      if (align === 'bottom') its.forEach((i) => (i.y = Math.max(...its.map((j) => j.y + j.height)) - i.height))
      if (align === 'middle') its.forEach((i) => (i.y = Math.min(...its.map((j) => j.y)) + (Math.max(...its.map((j) => j.y + j.height)) - Math.min(...its.map((j) => j.y))) / 2 - i.height / 2))
    })
  },

  distributeSelected: (dir) => {
    const { selectedShapeIds, selectedSlideId } = get()
    if (selectedShapeIds.length < 3 || !selectedSlideId) return
    get().commit((d) => {
      const s = d.slides.find((x) => x.id === selectedSlideId)
      if (!s) return
      const its = s.shapes
        .filter((x) => selectedShapeIds.includes(x.id))
        .map((i) => i as ShapeBase)
      if (dir === 'horizontal') {
        const sorted = [...its].sort((a, b) => a.x - b.x)
        const total = sorted.reduce((sum, i) => sum + i.width, 0)
        const gap = (sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x - total) / (sorted.length - 1)
        let cursor = sorted[0].x
        for (const i of sorted) {
          i.x = cursor
          cursor += i.width + gap
        }
      } else {
        const sorted = [...its].sort((a, b) => a.y - b.y)
        const total = sorted.reduce((sum, i) => sum + i.height, 0)
        const gap = (sorted[sorted.length - 1].y + sorted[sorted.length - 1].height - sorted[0].y - total) / (sorted.length - 1)
        let cursor = sorted[0].y
        for (const i of sorted) {
          i.y = cursor
          cursor += i.height + gap
        }
      }
    })
  },

  applyLayout: (layoutId) => {
    get().setSlideLayout(layoutId)
  },

  setZoom: (zoom) => set({ zoom: clamp(zoom, 10, 400) }),

  openPresent: (index) =>
    set({ present: true, presentIndex: index ?? Math.max(0, get().deck.slides.findIndex((s) => s.id === get().selectedSlideId)) }),
  closePresent: () => set({ present: false }),
  setPresentIndex: (index) => set({ presentIndex: index }),

  toggleNotes: () => set((s) => ({ notesOpen: !s.notesOpen })),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),

  setCurrentFormat: (f) => set((s) => ({ currentFormat: { ...s.currentFormat, ...f } })),

  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleSlideNumbering: () => set((s) => ({ slideNumbering: !s.slideNumbering })),
}))

// ---- helpers ----

function patchInDeck(deck: Deck, id: string, patch: Partial<Shape>): Deck {
  for (const s of deck.slides) {
    const sh = s.shapes.find((x) => x.id === id)
    if (sh) {
      Object.assign(sh, patch)
      return deck
    }
  }
  return deck
}

function findShape(deck: Deck, id: string): Shape | null {
  for (const s of deck.slides) {
    const sh = s.shapes.find((x) => x.id === id)
    if (sh) return sh
  }
  return null
}

function reorderShapes(deck: Deck, slideId: string, op: (list: Shape[], idx: number) => void) {
  const s = deck.slides.find((x) => x.id === slideId)
  if (!s) return
  const ids = new Set(useEditor.getState().selectedShapeIds)
  const idxs = s.shapes.map((sh, i) => (ids.has(sh.id) ? i : -1)).filter((i) => i >= 0)
  for (const idx of idxs.sort((a, b) => b - a)) {
    op(s.shapes, idx)
  }
}

function getPlaceholders(layout: string, deck: Deck): Shape[] {
  const def = BUILTIN_LAYOUTS.find((l) => l.id === layout)
  if (!def) return []
  return def.build(deck.slideWidth, deck.slideHeight).map((s) => ({ ...s, id: uid() }))
}

export function currentSlide(state: EditorState): Slide | null {
  if (!state.selectedSlideId) return null
  return state.deck.slides.find((s) => s.id === state.selectedSlideId) ?? null
}

export function selectedShapes(state: EditorState): Shape[] {
  const slide = currentSlide(state)
  if (!slide) return []
  return slide.shapes.filter((s) => state.selectedShapeIds.includes(s.id))
}