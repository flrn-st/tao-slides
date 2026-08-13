import { useEffect, useRef, useState } from 'react'
import { useEditor } from './store'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import NotesPanel from './components/NotesPanel'
import Presentation from './components/Presentation'
import { SlideSizeDialog, InsertImageDialog, OpenDeckDialog } from './components/Modals'
import Toast from './components/Toast'
import { importPptx } from './lib/importPptx'
import { isSupportedFile } from './lib/importPptx'
import { importDeck } from './lib/persistence'
import { toast } from './lib/toast'
import './styles.css'

if (import.meta.env.DEV) {
  ;(window as any).__useEditorState = () => useEditor.getState()
  ;(window as any).__useEditorGetDeck = () => useEditor.getState().deck
}

function sizeLabel(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 16 / 9) < 0.01) return 'Widescreen 16:9'
  if (Math.abs(r - 4 / 3) < 0.01) return 'Standard 4:3'
  return `${w}×${h}`
}

function saveLabel(state: string): string {
  if (state === 'saving') return 'Saving…'
  if (state === 'saved') return 'Saved to workspace'
  if (state === 'local') return 'Saved locally'
  if (state === 'error') return 'Save failed'
  return ''
}

export default function App() {
  const deck = useEditor((s) => s.deck)
  const saveState = useEditor((s) => s.saveState)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const handleImport = async (file: File) => {
    if (!isSupportedFile(file)) {
      if (/\.ppt$/i.test(file.name)) {
        toast(
          'Legacy .ppt files are not supported. Convert to .pptx first (PowerPoint or Google Slides > File > Download as .pptx).',
          'error',
        )
      } else {
        toast('Unsupported file. Please import a .pptx file.', 'error')
      }
      return
    }
    setImporting(true)
    try {
      const d = await importPptx(file)
      await importDeck(d, file.name)
    } catch (e) {
      console.error(e)
      toast('Failed to import file: ' + (e as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) void handleImport(f)
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    return () => {
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app">
      <Toolbar onImportFile={handleImport} />
      <div className="workspace">
        <Sidebar />
        <div className="canvas-region">
          <div className="canvas-title-row">
            <input
              className="deck-title"
              value={deck.title}
              onChange={(e) => useEditor.getState().setDeckTitle(e.target.value)}
              spellCheck={false}
            />
            <span className={'save-status' + (saveState === 'error' ? ' error' : saveState === 'saving' ? ' saving' : '')}>
              {sizeLabel(deck.slideWidth, deck.slideHeight)} · {saveLabel(saveState)}
            </span>
          </div>
          <div className="canvas-scroller" ref={scrollerRef}>
            <Canvas containerRef={scrollerRef} />
          </div>
        </div>
        <PropertiesPanel />
      </div>
      <NotesPanel />
      <Presentation />
      <SlideSizeDialog />
      <InsertImageDialog />
      <OpenDeckDialog />
      <Toast />
      {importing && (
        <div className="import-overlay">
          <div className="spinner" />
          <p>Importing presentation…</p>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">Drop your .pptx to import</div>
        </div>
      )}
    </div>
  )
}
