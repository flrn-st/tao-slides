import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store'
import Icon from './Icon'
import { fileToDataURL } from '../lib/utils'

export function SlideSizeDialog() {
  const modal = useEditor((s) => s.modal)
  const deck = useEditor((s) => s.deck)
  const [w, setW] = useState(960)
  const [h, setH] = useState(540)
  const [preset, setPreset] = useState('169')

  useEffect(() => {
    if (modal?.kind === 'slideSize') {
      setW(deck.slideWidth)
      setH(deck.slideHeight)
      const r = deck.slideWidth / deck.slideHeight
      setPreset(Math.abs(r - 16 / 9) < 0.01 ? '169' : Math.abs(r - 4 / 3) < 0.01 ? '43' : 'custom')
    }
  }, [modal, deck.slideWidth, deck.slideHeight])

  if (modal?.kind !== 'slideSize') return null

  const selectPreset = (p: string) => {
    setPreset(p)
    if (p === '169') {
      setW(1280)
      setH(720)
    } else if (p === '43') {
      setW(960)
      setH(720)
    } else if (p === 'widescreen') {
      setW(960)
      setH(540)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => useEditor.getState().closeModal()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change slide size</h3>
        <div className="size-presets">
          {[
            { id: '169', label: 'Widescreen 16:9' },
            { id: '43', label: 'Standard 4:3' },
            { id: 'widescreen', label: '16:9 (960×540)' },
            { id: 'custom', label: 'Custom' },
          ].map((p) => (
            <button
              key={p.id}
              className={'size-preset' + (preset === p.id ? ' active' : '')}
              onClick={() => selectPreset(p.id)}
            >
              <span className="size-icon" data-preset={p.id} />
              {p.label}
            </button>
          ))}
        </div>
        <div className="size-inputs">
          <label>
            Width (px)
            <input
              type="number"
              min={1}
              value={w}
              onChange={(e) => {
                setW(Number(e.target.value))
                setPreset('custom')
              }}
            />
          </label>
          <label>
            Height (px)
            <input
              type="number"
              min={1}
              value={h}
              onChange={(e) => {
                setH(Number(e.target.value))
                setPreset('custom')
              }}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="tool-btn" onClick={() => useEditor.getState().closeModal()}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              if (w > 0 && h > 0) {
                useEditor.getState().setSlideSize(w, h)
                useEditor.getState().closeModal()
              }
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export function InsertImageDialog() {
  const modal = useEditor((s) => s.modal)
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (modal?.kind !== 'insertImage') return null

  const insertUrl = async () => {
    if (!url) return
    const src = url
    const img = new Image()
    img.onload = async () => {
      const st = useEditor.getState()
      const slide = st.deck.slides.find((s) => s.id === st.selectedSlideId)
      if (!slide) return
      st.addShape({
        id: crypto.randomUUID(),
        type: 'image',
        src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        x: st.deck.slideWidth / 2 - Math.min(300, img.naturalWidth) / 2,
        y: st.deck.slideHeight / 2 - Math.min(200, img.naturalHeight) / 2,
        width: Math.min(600, img.naturalWidth),
        height: Math.min(400, img.naturalHeight),
        rotation: 0,
        opacity: 100,
      })
      st.closeModal()
    }
    img.onerror = () => alert('Could not load image from URL (CORS may block it). Try uploading a file instead.')
    img.src = src
  }

  const pickFile = async (f: File | null) => {
    if (!f) return
    const src = await fileToDataURL(f)
    const img = new Image()
    img.onload = () => {
      const st = useEditor.getState()
      const slide = st.deck.slides.find((s) => s.id === st.selectedSlideId)
      if (!slide) return
      st.addShape({
        id: crypto.randomUUID(),
        type: 'image',
        src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        x: st.deck.slideWidth / 2 - Math.min(300, img.naturalWidth) / 2,
        y: st.deck.slideHeight / 2 - Math.min(200, img.naturalHeight) / 2,
        width: Math.min(600, img.naturalWidth),
        height: Math.min(400, img.naturalHeight),
        rotation: 0,
        opacity: 100,
      })
      st.closeModal()
    }
    img.src = src
  }

  return (
    <div className="modal-backdrop" onClick={() => useEditor.getState().closeModal()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Insert image</h3>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        <button className="tool-btn" style={{ width: '100%', padding: '10px' }} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> Upload from computer
        </button>
        <div className="url-row">
          <input value={url} placeholder="Paste image URL" onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-primary" onClick={insertUrl}>
            Insert
          </button>
        </div>
        <div className="modal-actions">
          <button className="tool-btn" onClick={() => useEditor.getState().closeModal()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}