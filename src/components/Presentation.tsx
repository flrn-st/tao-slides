import { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import { useEditor } from '../store'
import { renderSlideToCanvas } from '../lib/render'
import Icon from './Icon'

export default function Presentation() {
  const present = useEditor((s) => s.present)
  const index = useEditor((s) => s.presentIndex)
  const deck = useEditor((s) => s.deck)
  const slide = deck.slides[Math.min(index, deck.slides.length - 1)]
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasInst = useRef<fabric.Canvas | null>(null)
  const sigRef = useRef('')
  const [showNotes, setShowNotes] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [effectKey, setEffectKey] = useState(0)

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!present) return
    const c = new fabric.Canvas(containerRef.current!.querySelector('canvas')!, { selection: false })
    c.skipTargetFind = true
    canvasInst.current = c
    return () => {
      c.dispose()
      canvasInst.current = null
    }
  }, [present])

  useEffect(() => {
    const c = canvasInst.current
    if (!c || !slide) return
    const scale = Math.min(size.w / deck.slideWidth, size.h / deck.slideHeight)
    const sig = `${index}-${scale}`
    if (sig === sigRef.current) return
    sigRef.current = sig
    setEffectKey((k) => k + 1)
    renderSlideToCanvas(c, deck, slide, { interactive: false, scale, onReady: () => c.requestRenderAll() })
  }, [slide, size, present, index])

  useEffect(() => {
    if (!present) return
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState()
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') {
        e.preventDefault()
        if (st.presentIndex < st.deck.slides.length - 1) st.setPresentIndex(st.presentIndex + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault()
        if (st.presentIndex > 0) st.setPresentIndex(st.presentIndex - 1)
      } else if (e.key === 'Escape') {
        st.closePresent()
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes((v) => !v)
      } else if (e.key === 'f' || e.key === 'F') {
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [present])

  if (!present || !slide) return null

  const transition = slide.transition?.type ?? 'none'
  const w = Math.min(size.w, 1440)
  const containerW = deck.slideWidth * Math.min(w / deck.slideWidth, size.h / deck.slideHeight)
  const containerH = deck.slideHeight * Math.min(w / deck.slideWidth, size.h / deck.slideHeight)

  return (
    <div className="presentation-overlay">
      <div
        className="presentation-stage"
        style={{ width: containerW, height: containerH }}
        ref={containerRef}
      >
        <div className={`presentation-fx fx-${transition}`} key={effectKey}>
          <canvas />
        </div>
      </div>

      <div className="presentation-bar">
        <button className="pres-btn" onClick={() => useEditor.getState().setPresentIndex(Math.max(0, index - 1))} disabled={index === 0}>
          <Icon name="chevronLeft" />
        </button>
        <span className="pres-index">
          {index + 1} / {deck.slides.length}
        </span>
        <button
          className="pres-btn"
          onClick={() => useEditor.getState().setPresentIndex(Math.min(deck.slides.length - 1, index + 1))}
          disabled={index === deck.slides.length - 1}
        >
          <Icon name="chevronRight" />
        </button>
        <span className="pres-sep" />
        <button className="pres-btn" title="Toggle notes (N)" onClick={() => setShowNotes((v) => !v)}>
          <Icon name="notes" />
        </button>
        <span className="pres-sep" />
        <button className="pres-btn" title="Exit (Esc)" onClick={() => useEditor.getState().closePresent()}>
          <Icon name="close" />
        </button>
      </div>

      {showNotes && slide.notes && <div className="presentation-notes">{slide.notes}</div>}
    </div>
  )
}