import { useEditor, currentSlide } from '../store'

export default function NotesPanel() {
  const open = useEditor((s) => s.notesOpen)
  const slide = useEditor(currentSlide)
  if (!open || !slide) return null
  return (
    <div className="notes-panel">
      <div className="notes-head">
        <b>Speaker notes</b>
        <button className="tool-btn icon-only" onClick={() => useEditor.getState().toggleNotes()}>
          ×
        </button>
      </div>
      <textarea
        placeholder="Add speaker notes for this slide…"
        value={slide.notes}
        onChange={(e) => useEditor.getState().setSlideNotes(e.target.value)}
      />
    </div>
  )
}