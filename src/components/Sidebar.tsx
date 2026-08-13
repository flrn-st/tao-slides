import { useEffect, useRef } from 'react'
import { fabric } from 'fabric'
import { useEditor } from '../store'
import type { Deck, Slide } from '../types'
import { renderSlideToCanvas } from '../lib/render'
import Icon from './Icon'

const THUMB_W = 200

export default function Sidebar() {
  const deck = useEditor((s) => s.deck)
  const selectedSlideId = useEditor((s) => s.selectedSlideId)
  const dragIndex = useRef<number | null>(null)
  const dropIndex = useRef<number | null>(null)

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <button className="sidebar-add" onClick={() => useEditor.getState().addSlide()}>
          <Icon name="plus" size={16} /> New
        </button>
      </div>
      <div className="sidebar-list">
        {deck.slides.map((slide, i) => (
          <SlideThumb
            key={slide.id}
            deck={deck}
            slide={slide}
            index={i}
            selected={slide.id === selectedSlideId}
            dragging={dragIndex.current === i}
            dropAbove={dropIndex.current === i}
            onSelect={() => useEditor.getState().selectSlide(slide.id)}
            onDragStart={() => {
              dragIndex.current = i
              dropIndex.current = null
            }}
            onDragOver={(e) => {
              e.preventDefault()
              dropIndex.current = i
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragIndex.current
              const to = i
              dragIndex.current = null
              dropIndex.current = null
              if (from == null || from === to) return
              useEditor.getState().reorderSlide(from, to > from ? to + 1 : to)
            }}
            onDragEnd={() => {
              dragIndex.current = null
              dropIndex.current = null
            }}
          />
        ))}
      </div>
      <div className="sidebar-foot">
        <span className="muted">
          {deck.slides.length} slide{deck.slides.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

function SlideThumb({
  deck,
  slide,
  index,
  selected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
  dropAbove,
}: {
  deck: Deck
  slide: Slide
  index: number
  selected: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  dragging: boolean
  dropAbove: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const element = wrap.querySelector('canvas')
    if (!element) return
    const c = new fabric.StaticCanvas(element, {
      renderOnAddRemove: false,
      enableRetinaScaling: true,
    })
    const scale = THUMB_W / deck.slideWidth
    const cancelRender = renderSlideToCanvas(c as unknown as fabric.Canvas, deck, slide, {
      interactive: false,
      scale,
      onReady: () => c.requestRenderAll(),
    })
    return () => {
      cancelRender()
      c.dispose()
    }
  }, [deck, slide])

  return (
    <div
      className={'slide-thumb' + (selected ? ' selected' : '') + (dragging ? ' dragging' : '')}
      ref={wrapRef}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      {dropAbove && <div className="drop-marker" />}
      <div className="slide-thumb-num">{index + 1}</div>
      <canvas />
    </div>
  )
}
