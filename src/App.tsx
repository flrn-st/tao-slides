import { useEffect, useRef, useState } from 'react'
import { useEditor } from './store'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import NotesPanel from './components/NotesPanel'
import Presentation from './components/Presentation'
import { SlideSizeDialog, InsertImageDialog } from './components/Modals'
import { importPptx } from './lib/importPptx'
import { isSupportedFile } from './lib/importPptx'
import './styles.css'

export default function App() {
  const deck = useEditor((s) => s.deck)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  ;(window as any).__useEditorState = () => useEditor.getState()
  ;(window as any).__useEditorGetDeck = () => useEditor.getState().deck

  const handleImport = async (file: File) => {
    if (!isSupportedFile(file)) {
      if (/\.ppt$/i.test(file.name)) {
        alert('Legacy .ppt files are not supported. Convert to .pptx first (PowerPoint or Google Slides > File > Download as .pptx).')
      } else {
        alert('Unsupported file. Please import a .pptx file.')
      }
      return
    }
    setImporting(true)
    try {
      const d = await importPptx(file)
      useEditor.getState().loadDeck(d, file.name)
    } catch (e) {
      console.error(e)
      alert('Failed to import file: ' + (e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) handleImport(f)
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
            <span className="muted">Widescreen 16:9 · Autosaved locally</span>
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
      {importing && (
        <div className="import-overlay">
          <div className="spinner" />
          <p>Importing presentation…</p>
        </div>
      )}
      {dragging && <div className="drop-overlay">Drop your .pptx to import</div>}
    </div>
  )
}