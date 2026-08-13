import { useRef } from 'react'
import { useEditor } from '../store'
import Icon from './Icon'
import Menu, { MenuItem, MenuSeparator, MenuLabel } from './Menu'
import { SHAPE_TYPES, SHAPE_LABELS } from '../lib/utils'
import { createShape, createTextShape, createImageShape } from '../lib/templates'
import { fileToDataURL, imageDims, downloadBlob } from '../lib/utils'
import { detectLegacyPpt, isSupportedFile } from '../lib/importPptx'
import { exportPptx } from '../lib/exportPptx'
import { createNewDeck, refreshIndex } from '../lib/persistence'
import { toast } from '../lib/toast'
import type { ShapeBase } from '../types'

interface ToolbarProps {
  onImportFile: (file: File) => void
}

export default function Toolbar({ onImportFile }: ToolbarProps) {
  const deck = useEditor((s) => s.deck)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const selectedSlideId = useEditor((s) => s.selectedSlideId)
  const currentSlide = useEditor((s) =>
    s.selectedSlideId ? s.deck.slides.find((x) => x.id === s.selectedSlideId) ?? null : null,
  )
  const selectedCount = useEditor((s) => s.selectedShapeIds.length)
  const zoom = useEditor((s) => s.zoom)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const file = async (f: File | null) => {
    if (!f) return
    if (detectLegacyPpt(f)) {
      toast('Legacy .ppt files are not supported. Please convert to .pptx first (e.g. open in Google Slides or PowerPoint and "Save as .pptx").', 'error')
      return
    }
    if (!isSupportedFile(f)) {
      toast('Unsupported file type.', 'error')
      return
    }
    onImportFile(f)
  }

  const doInsertText = () => {
    const slide = currentSlide
    if (!slide) return
    const w = deck.slideWidth
    const h = deck.slideHeight
    const shape = createTextShape('Text', w * 0.3, h * 0.4, w * 0.4, h * 0.08, {
      fontFamily: 'Calibri',
      size: 24,
      color: '#202124',
      verticalAlign: 'middle',
    })
    useEditor.getState().addShape(shape)
  }

  const doInsertShape = (type: string) => {
    const slide = currentSlide
    if (!slide) return
    const w = deck.slideWidth
    const h = deck.slideHeight
    const size = 140
    const shape = createShape(type as any, w / 2 - size / 2, h / 2 - size / 2, size, size, {
      fill: { type: 'solid', color: '#4a90d9' },
      stroke: { color: '#202124', width: 1 },
    })
    useEditor.getState().addShape(shape)
  }

  const doInsertLine = () => {
    const slide = currentSlide
    if (!slide) return
    const w = deck.slideWidth
    const h = deck.slideHeight
    useEditor.getState().addShape({
      id: crypto.randomUUID(),
      type: 'line',
      x1: Math.round(w * 0.25),
      y1: Math.round(h * 0.5),
      x2: Math.round(w * 0.75),
      y2: Math.round(h * 0.5),
      stroke: { color: '#202124', width: 2 },
      arrowEnd: false,
      opacity: 100,
    } as any)
  }

  const addImage = async (file: File | null) => {
    if (!file) return
    const src = await fileToDataURL(file)
    const dims = await imageDims(src)
    const st = useEditor.getState()
    const slide = st.deck.slides.find((s) => s.id === st.selectedSlideId)
    if (!slide) return
    const img = createImageShape(src, dims.width || 1, dims.height || 1, st.deck.slideWidth / 2 - 150, st.deck.slideHeight / 2 - 100)
    st.addShape(img)
  }

  const doExport = async () => {
    try {
      const blob = await exportPptx(useEditor.getState().deck)
      const name = (useEditor.getState().deck.title || 'presentation').replace(/[^\w\- ]+/g, '').trim() || 'presentation'
      downloadBlob(blob, name + '.pptx')
    } catch (e) {
      console.error(e)
      toast('Export failed: ' + (e as Error).message, 'error')
    }
  }

  const st = useEditor

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="logo">
          <Icon name="sparkle" size={20} />
          <b>Slides</b>
        </span>
        <Menu
          label="File"
          align="left"
          children={(close) => (
            <>
              <MenuItem
                icon=""
                onClick={() => {
                  void createNewDeck()
                  close()
                }}
              >
                New deck
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void refreshIndex()
                  st.getState().openModal({ kind: 'openDeck' })
                  close()
                }}
              >
                Open…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  fileInputRef.current?.click()
                  close()
                }}
              >
                Import .pptx
              </MenuItem>
              <MenuItem onClick={() => { void doExport(); close() }}>Download .pptx</MenuItem>
              <MenuSeparator />
              <MenuItem disabled onClick={() => {}}>
                Share
              </MenuItem>
              <MenuItem disabled onClick={() => {}}>
                Version history
              </MenuItem>
            </>
          )}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx,.ppt"
          style={{ display: 'none' }}
          onChange={(e) => {
            file(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button className="tool-btn icon-only" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => st.getState().undo()}>
          <Icon name="undo" />
        </button>
        <button className="tool-btn icon-only" title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={() => st.getState().redo()}>
          <Icon name="redo" />
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <Menu
          label="Insert"
          children={(close) => (
            <>
              <MenuLabel>Shapes</MenuLabel>
              <div className="shape-grid">
                {SHAPE_TYPES.map((t) => (
                  <button
                    key={t}
                    className="shape-cell"
                    title={SHAPE_LABELS[t]}
                    onClick={() => {
                      doInsertShape(t)
                      close()
                    }}
                  >
                    <ShapePreview type={t} />
                  </button>
                ))}
              </div>
              <MenuSeparator />
              <MenuItem onClick={() => { doInsertText(); close() }}>Text box</MenuItem>
              <MenuItem onClick={() => { doInsertLine(); close() }}>Line</MenuItem>
              <MenuItem onClick={() => { fileInputRef.current?.click(); close() }}>Image…</MenuItem>
              <MenuItem disabled onClick={() => {}}>Table</MenuItem>
              <MenuItem disabled onClick={() => {}}>Chart</MenuItem>
            </>
          )}
        />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <Menu
          label="Slide"
          children={(close) => (
            <>
              <MenuItem onClick={() => { st.getState().addSlide(); close() }}>
                New slide
              </MenuItem>
              <MenuItem onClick={() => { st.getState().duplicateSlide(); close() }}>
                Duplicate slide
              </MenuItem>
              <MenuItem onClick={() => { st.getState().deleteSlide(); close() }}>
                Delete slide
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Apply layout</MenuLabel>
              {['title', 'titleAndBody', 'titleOnly', 'blank'].map((l) => (
                <MenuItem
                  key={l}
                  checked={currentSlide?.layout === l}
                  onClick={() => { st.getState().setSlideLayout(l); close() }}
                >
                  {l === 'title' ? 'Title slide' : l === 'titleAndBody' ? 'Title and body' : l === 'titleOnly' ? 'Title only' : 'Blank'}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onClick={() => { st.getState().openModal({ kind: 'slideSize' }); close() }}>
                Change slide size…
              </MenuItem>
            </>
          )}
        />

        <Menu
          label="Format"
          disabled={selectedCount === 0}
          children={(close) => (
            <>
              <MenuLabel>Arrange</MenuLabel>
              <MenuItem onClick={() => { st.getState().bringToFront(); close() }}>
                Bring to front
              </MenuItem>
              <MenuItem onClick={() => { st.getState().bringForward(); close() }}>
                Bring forward
              </MenuItem>
              <MenuItem onClick={() => { st.getState().sendBackward(); close() }}>
                Send backward
              </MenuItem>
              <MenuItem onClick={() => { st.getState().sendToBack(); close() }}>
                Send to back
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Align</MenuLabel>
              <MenuItem onClick={() => { st.getState().alignSelected('left'); close() }}>
                Align left
              </MenuItem>
              <MenuItem onClick={() => { st.getState().alignSelected('center'); close() }}>
                Align center
              </MenuItem>
              <MenuItem onClick={() => { st.getState().alignSelected('right'); close() }}>
                Align right
              </MenuItem>
              <MenuItem onClick={() => { st.getState().alignSelected('top'); close() }}>
                Align top
              </MenuItem>
              <MenuItem onClick={() => { st.getState().alignSelected('middle'); close() }}>
                Align middle
              </MenuItem>
              <MenuItem onClick={() => { st.getState().alignSelected('bottom'); close() }}>
                Align bottom
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { st.getState().distributeSelected('horizontal'); close() }}>
                Distribute horizontally
              </MenuItem>
              <MenuItem onClick={() => { st.getState().distributeSelected('vertical'); close() }}>
                Distribute vertically
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => { st.getState().duplicateSelected(); close() }}>
                Duplicate
              </MenuItem>
              <MenuItem onClick={() => { st.getState().deleteSelected(); close() }} danger>
                Delete
              </MenuItem>
            </>
          )}
        />
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <Menu
          label={<span className="mono">{zoom}%</span>}
          align="right"
          children={(close) => (
            <>
              {[50, 70, 100, 125, 150, 200, 300].map((z) => (
                <MenuItem key={z} checked={zoom === z} onClick={() => { st.getState().setZoom(z); close() }}>
                  {z}%
                </MenuItem>
              ))}
              <MenuItem onClick={() => { st.getState().setZoom(100); close() }}>100%</MenuItem>
              <MenuItem
                onClick={() => {
                  const scroller = document.querySelector('.canvas-scroller')
                  const st2 = useEditor.getState()
                  if (scroller) {
                    const r = scroller.getBoundingClientRect()
                    const z = Math.min((r.width - 120) / st2.deck.slideWidth, (r.height - 120) / st2.deck.slideHeight)
                    st2.setZoom(Math.round(Math.max(10, Math.min(400, z * 100))))
                  } else {
                    st2.setZoom(100)
                  }
                  close()
                }}
              >
                Fit to screen
              </MenuItem>
            </>
          )}
        />
        <button
          className="tool-btn icon-only"
          title={useEditor.getState().showGuides ? 'Hide guides' : 'Show guides'}
          onClick={() => st.getState().toggleGuides()}
        >
          <Icon name="grid" />
        </button>
        <button className="tool-btn icon-only" title="Speaker notes" onClick={() => st.getState().toggleNotes()}>
          <Icon name="notes" />
        </button>
      </div>

      <div className="toolbar-sep" />

      <button className="btn-primary" onClick={() => st.getState().openPresent()}>
        <Icon name="present" size={16} />
        Present
      </button>
    </div>
  )
}

function ShapePreview({ type }: { type: string }) {
  const s = createShape(type as any, 0, 0, 100, 100, { fill: { type: 'solid', color: '#4a90d9' } }) as ShapeBase
  const color = '#4285f4'
  if (type === 'text') {
    return (
      <svg viewBox="0 0 24 24" className="shape-preview-svg">
        <path d="M4 6.5h16M7 17.5h10M12 6.5v11" stroke={color} strokeWidth="2" fill="none" />
      </svg>
    )
  }
  if (type === 'ellipse') {
    return <svg viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="46" ry="32" fill={color} stroke="#1b3f7d" strokeWidth="3" /></svg>
  }
  const points = polyPoints(type).map(([x, y]) => `${x},${y}`).join(' ')
  if (type === 'roundRect') {
    return <svg viewBox="0 0 100 100"><rect x="4" y="12" width="92" height="76" rx="16" fill={color} stroke="#1b3f7d" strokeWidth="3" /></svg>
  }
  if (type === 'rect') {
    return <svg viewBox="0 0 100 100"><rect x="4" y="12" width="92" height="76" fill={color} stroke="#1b3f7d" strokeWidth="3" /></svg>
  }
  return <svg viewBox="0 0 100 100"><polygon points={points} fill={color} stroke="#1b3f7d" strokeWidth="3" strokeLinejoin="round" /></svg>
}

function polyPoints(type: string): [number, number][] {
  switch (type) {
    case 'triangle': return [[50, 10], [92, 88], [8, 88]]
    case 'rightTriangle': return [[12, 10], [92, 88], [12, 88]]
    case 'diamond': return [[50, 8], [92, 50], [50, 92], [8, 50]]
    case 'pentagon': return [[50, 8], [90, 42], [74, 90], [26, 90], [10, 42]]
    case 'hexagon': return [[28, 10], [72, 10], [92, 50], [72, 90], [28, 90], [8, 50]]
    case 'chevron': return [[8, 10], [62, 10], [32, 50], [62, 90], [8, 90], [36, 50]]
    case 'parallelogram': return [[26, 10], [92, 10], [74, 90], [8, 90]]
    case 'trapezoid': return [[24, 10], [76, 10], [92, 90], [8, 90]]
    case 'ltArrow': return [[40, 10], [40, 34], [92, 34], [92, 66], [40, 66], [40, 90], [8, 50]]
    case 'rtArrow': return [[60, 10], [92, 50], [60, 90], [60, 66], [8, 66], [8, 34], [60, 34]]
    case 'upArrow': return [[92, 32], [68, 32], [68, 90], [32, 90], [32, 32], [8, 32], [50, 8]]
    case 'dnArrow': return [[92, 68], [68, 68], [68, 8], [32, 8], [32, 68], [8, 68], [50, 92]]
    case 'star5': {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 40 : 17
        const a = (Math.PI * i) / 5 - Math.PI / 2
        pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
      }
      return pts
    }
    case 'heart': return [[50, 82], [20, 52], [8, 38], [12, 22], [28, 16], [40, 24], [50, 34], [60, 24], [72, 16], [88, 22], [92, 38], [80, 52]]
    case 'cloud': {
      const pts: [number, number][] = []
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        pts.push([50 + 38 * Math.cos(a), 52 + 32 * Math.sin(a)])
      }
      return pts
    }
    default: return []
  }
}