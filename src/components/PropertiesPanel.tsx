import { useEffect, useState } from 'react'
import { useEditor, currentSlide, selectedShapes } from '../store'
import type {
  Background,
  CurrentFormat,
  Fill,
  Paragraph,
  Shape,
  ShapeBase,
  TextRun,
} from '../types'
import {
  FONT_FAMILIES,
  THEME_COLORS,
  BUILTIN_LAYOUTS,
} from '../lib/templates'
import { withTransparency, fileToDataURL, DASHES, PT_TO_PX } from '../lib/utils'
import { applyTextSelectionStyle, hasTextEditingSelection } from '../lib/fabricUtil'
import { getEditorCanvas } from './Canvas'
import Icon from './Icon'

export default function PropertiesPanel() {
  const selectedCount = useEditor((s) => s.selectedShapeIds.length)
  const slide = useEditor(currentSlide)
  const shapes = useEditor(selectedShapes)
  const slidesLen = useEditor((s) => s.deck.slides.length)

  if (!slide) return <div className="properties empty-panel" />

  return (
    <div className="properties">
      {selectedCount === 0 ? (
        <SlideSettings slide={slide} />
      ) : selectedCount === 1 ? (
        <ShapeSettings shape={shapes[0]} />
      ) : (
        <MultiSettings shapes={shapes} />
      )}
      {slidesLen > 1 && <SlideNavigator />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="prop-section">
      <button className="prop-section-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="prop-section-body">{children}</div>}
    </div>
  )
}

function NumField({
  label,
  value,
  min = -10000,
  max = 10000,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  const [v, setV] = useState(String(Math.round(value * 10) / 10))
  useEffect(() => {
    setV(String(Math.round(Number(value) * 10) / 10))
  }, [value])
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = parseFloat(v)
          if (!Number.isNaN(n)) onChange(n)
          else setV(String(Math.round(Number(value) * 10) / 10))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = parseFloat(v)
            if (!Number.isNaN(n)) onChange(n)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <div className="color-input">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="color-hex">{value.replace('#', '').toUpperCase()}</span>
      </div>
    </label>
  )
}

function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  suffix = '%',
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="slider-field">
      <span className="slider-label">
        {label} <b>{Math.round(value)}{suffix}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

const swatches = [...THEME_COLORS.map((c) => c.hex)]

function ThemeColors({ onPick }: { onPick: (hex: string) => void }) {
  return (
    <div className="theme-swatches">
      {swatches.map((c) => (
        <button
          key={c}
          className="swatch"
          style={{ background: c }}
          title={c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide settings (no selection)
// ---------------------------------------------------------------------------

function SlideSettings({ slide }: { slide: ReturnType<typeof currentSlide> & {} }) {
  const st = useEditor
  const bg: Background = slide.background ?? { type: 'solid', color: '#ffffff' }
  const solidColor = ((): string => {
    if (bg.type === 'solid') return bg.color
    if (bg.type === 'gradient') return bg.stops[0]?.color ?? '#ffffff'
    return '#ffffff'
  })()

  const setBg = (b: Background) => st.getState().setSlideBackground(b)

  return (
    <>
      <Section title="Background">
        <div className="bg-type-row">
          {(
            [
              ['none', 'None'],
              ['solid', 'Color'],
              ['gradient', 'Gradient'],
              ['image', 'Image'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              className={'seg-btn' + (bg.type === t ? ' active' : '')}
              onClick={() => {
                if (t === 'none') setBg({ type: 'none' })
                else if (t === 'solid') setBg({ type: 'solid', color: solidColor })
                else if (t === 'gradient')
                  setBg({
                    type: 'gradient',
                    angle: 90,
                    stops: [
                      { color: solidColor, position: 0 },
                      { color: '#ffffff', position: 100 },
                    ],
                  })
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="prop-row">
          <ThemeColors
            onPick={(hex) => {
              if (bg.type === 'image') setBg({ type: 'solid', color: hex })
              else setBg({ type: 'solid', color: hex, transparency: bg.type === 'solid' ? bg.transparency : 0 })
            }}
          />
        </div>
        {(bg.type === 'solid' || bg.type === 'gradient') && (
          <div className="prop-row">
            <ColorField
              label="Color"
              value={solidColor}
              onChange={(hex) => {
                if (bg.type === 'solid') setBg({ ...bg, color: hex })
                else if (bg.type === 'gradient') {
                  const stops = bg.stops.map((s, i) =>
                    i === 0 ? { ...s, color: hex } : s,
                  )
                  setBg({ ...bg, stops })
                }
              }}
            />
          </div>
        )}
        {bg.type === 'solid' && (
          <SliderField label="Transparency" value={bg.transparency ?? 0} onChange={(v) => setBg({ ...bg, transparency: v })} />
        )}
        {bg.type === 'gradient' && (
          <>
            <SliderField label="Angle" value={bg.angle} min={0} max={360} suffix="°" onChange={(v) => setBg({ ...bg, angle: v })} />
            <div className="grad-stops">
              {bg.stops.map((s, i) => (
                <div className="grad-stop" key={i}>
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ffffff'}
                    onChange={(e) => {
                      const stops = bg.stops.map((x, j) => (j === i ? { ...x, color: e.target.value } : x))
                      setBg({ ...bg, stops })
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={s.position}
                    onChange={(e) => {
                      const stops = bg.stops.map((x, j) => (j === i ? { ...x, position: Number(e.target.value) } : x))
                      setBg({ ...bg, stops: stops.sort((a, b) => a.position - b.position) })
                    }}
                  />
                  <button
                    className="mini-btn"
                    title="Remove stop"
                    onClick={() => {
                      if (bg.stops.length > 2) setBg({ ...bg, stops: bg.stops.filter((_, j) => j !== i) })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {bg.stops.length < 8 && (
                <button
                  className="mini-btn"
                  onClick={() =>
                    setBg({
                      ...bg,
                      stops: [...bg.stops, { color: '#ffffff', position: 100 }],
                    })
                  }
                >
                  + Add stop
                </button>
              )}
            </div>
          </>
        )}
        {bg.type === 'image' && (
          <div className="prop-row">
            <label className="file-btn">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const src = await fileToDataURL(f)
                  setBg({ type: 'image', src, stretch: bg.type === 'image' ? bg.stretch : true })
                }}
              />
              Replace image
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={bg.stretch}
                onChange={(e) => setBg({ ...bg, stretch: e.target.checked })}
              />
              Stretch to slide
            </label>
            <button className="tool-btn" onClick={() => setBg({ type: 'image', src: bg.src, stretch: true, transparency: 0 })}>
              Reset
            </button>
          </div>
        )}
        {bg.type === 'image' && (
          <SliderField label="Transparency" value={bg.transparency ?? 0} onChange={(v) => setBg({ ...bg, transparency: v })} />
        )}
      </Section>

      <Section title="Layout">
        <div className="layout-grid">
          {BUILTIN_LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={'layout-cell' + (slide.layout === l.id ? ' active' : '')}
              onClick={() => st.getState().setSlideLayout(l.id)}
            >
              <LayoutIcon id={l.id} />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Transition">
        <select
          value={slide.transition?.type ?? 'none'}
          onChange={(e) => useEditor.getState().setSlideTransition(e.target.value as any, slide.transition?.duration ?? 400)}
        >
          <option value="none">None</option>
          <option value="fade">Fade</option>
          <option value="slide">Slide from right</option>
          <option value="zoom">Zoom</option>
          <option value="flip">Flip</option>
        </select>
        {slide.transition?.type && slide.transition.type !== 'none' && (
          <SliderField
            label="Duration"
            value={slide.transition?.duration ?? 400}
            min={200}
            max={2000}
            suffix="ms"
            onChange={(v) => useEditor.getState().setSlideTransition(slide.transition!.type, v)}
          />
        )}
      </Section>
    </>
  )
}

function LayoutIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 100 100">
      <rect x="1" y="1" width="98" height="98" rx="4" fill="#fff" stroke="#dadce0" />
      {id === 'blank' && null}
      {id === 'title' && (
        <>
          <rect x="14" y="30" width="72" height="10" rx="5" fill="#1a73e8" />
          <rect x="14" y="52" width="52" height="7" rx="3.5" fill="#cbd1d9" />
        </>
      )}
      {id === 'titleAndBody' && (
        <>
          <rect x="14" y="14" width="72" height="10" rx="5" fill="#1a73e8" />
          <rect x="14" y="36" width="72" height="7" rx="3.5" fill="#d7dce3" />
          <rect x="14" y="48" width="72" height="7" rx="3.5" fill="#d7dce3" />
          <rect x="14" y="60" width="72" height="7" rx="3.5" fill="#d7dce3" />
          <rect x="14" y="72" width="48" height="7" rx="3.5" fill="#d7dce3" />
        </>
      )}
      {id === 'titleOnly' && <rect x="14" y="14" width="72" height="10" rx="5" fill="#1a73e8" />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Shape settings
// ---------------------------------------------------------------------------

function ShapeSettings({ shape }: { shape: Shape }) {
  const st = useEditor
  if (shape.type === 'line') return <LineSettings shape={shape as any} />
  if (shape.type === 'image') return <ImageSettings shape={shape as any} />
  return <BoxSettings shape={shape as any} />
}

function BoxSettings({ shape }: { shape: ShapeBase }) {
  const st = useEditor
  const patch = (p: Partial<ShapeBase>) => st.getState().patchShape(shape.id, p)
  const fill: Fill | undefined = shape.fill
  const isSolid = !fill || fill.type === 'solid'
  const solidColor = fill?.type === 'solid' ? fill.color : fill?.type === 'gradient' ? fill.stops[0]?.color : '#000000'

  const hasText = !!shape.paragraphs?.some((p) => p.runs.some((r) => r.text.trim()))

  return (
    <>
      {hasText && <TextSettings shape={shape} patch={patch} />}

      <Section title="Fill">
        <div className="bg-type-row">
          {(
            [
              ['none', 'None'],
              ['solid', 'Color'],
              ['gradient', 'Gradient'],
            ] as const
          ).map(([t, label]) => {
            const active = t === 'none' ? !fill : t === 'solid' ? fill?.type === 'solid' : fill?.type === 'gradient'
            return (
              <button
                key={t}
                className={'seg-btn' + (active ? ' active' : '')}
                onClick={() => {
                  if (t === 'none') patch({ fill: undefined })
                  else if (t === 'solid') patch({ fill: { type: 'solid', color: solidColor } })
                  else
                    patch({
                      fill: {
                        type: 'gradient',
                        angle: 90,
                        stops: [
                          { color: solidColor, position: 0 },
                          { color: withTransparency(solidColor, 10), position: 100 },
                        ],
                      },
                    })
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="prop-row">
          <ThemeColors
            onPick={(hex) => {
              if (!fill || fill.type === 'gradient') patch({ fill: { type: 'solid', color: hex } })
              else patch({ fill: { ...fill, color: hex } })
            }}
          />
        </div>
        {isSolid && fill?.type === 'solid' && (
          <>
            <div className="prop-row">
              <ColorField label="Color" value={solidColor} onChange={(hex) => patch({ fill: { ...fill, color: hex } })} />
            </div>
            <SliderField label="Transparency" value={fill.transparency ?? 0} onChange={(v) => patch({ fill: { ...fill, transparency: v } })} />
          </>
        )}
        {fill?.type === 'gradient' && (
          <>
            <div className="prop-row">
              <ColorField
                label="Start color"
                value={fill.stops[0]?.color ?? '#000000'}
                onChange={(hex) => {
                  const stops = fill.stops.map((s, i) => (i === 0 ? { ...s, color: hex } : s))
                  patch({ fill: { ...fill, stops } })
                }}
              />
            </div>
            <SliderField label="Angle" value={fill.angle} min={0} max={360} suffix="°" onChange={(v) => patch({ fill: { ...fill, angle: v } })} />
          </>
        )}
      </Section>

      <Section title="Border">
        <div className="prop-row">
          <button
            className={'seg-btn' + (!shape.stroke ? ' active' : '')}
            onClick={() => patch({ stroke: undefined })}
          >
            None
          </button>
          <button
            className={'seg-btn' + (shape.stroke ? ' active' : '')}
            onClick={() => patch({ stroke: shape.stroke ?? { color: '#202124', width: 2 } })}
          >
            Line
          </button>
        </div>
        {shape.stroke && (
          <>
            <div className="prop-row">
              <ColorField label="Color" value={shape.stroke.color} onChange={(hex) => patch({ stroke: { ...shape.stroke!, color: hex } })} />
            </div>
            <SliderField label="Weight" value={shape.stroke.width} min={0} max={20} suffix=" pt" onChange={(v) => patch({ stroke: { ...shape.stroke!, width: v } })} />
            <SliderField label="Transparency" value={shape.stroke.transparency ?? 0} onChange={(v) => patch({ stroke: { ...shape.stroke!, transparency: v } })} />
            <div className="dash-row">
              {(['solid', 'dash', 'dot', 'dashDot'] as const).map((d) => (
                <button
                  key={d}
                  className={'seg-btn' + ((shape.stroke!.dash ?? 'solid') === d ? ' active' : '')}
                  onClick={() => patch({ stroke: { ...shape.stroke!, dash: d } })}
                >
                  <svg width="44" height="10">
                    <line x1="1" y1="5" x2="43" y2="5" stroke="#202124" strokeWidth="2" strokeDasharray={DASHES[d].join(' ') || 'none'} />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Shadow">
        <div className="prop-row">
          <label className="check-row">
            <input
              type="checkbox"
              checked={!!shape.shadow}
              onChange={(e) =>
                patch(
                  e.target.checked
                    ? { shadow: { color: '#202124', transparency: 40, blur: 4, offsetX: 2, offsetY: 3 } }
                    : { shadow: undefined },
                )
              }
            />
            Drop shadow
          </label>
        </div>
        {shape.shadow && (
          <>
            <div className="prop-row">
              <ColorField label="Color" value={shape.shadow.color} onChange={(hex) => patch({ shadow: { ...shape.shadow!, color: hex } })} />
            </div>
            <SliderField label="Transparency" value={shape.shadow.transparency ?? 40} onChange={(v) => patch({ shadow: { ...shape.shadow!, transparency: v } })} />
            <SliderField label="Blur" value={shape.shadow.blur} min={0} max={50} suffix=" pt" onChange={(v) => patch({ shadow: { ...shape.shadow!, blur: v } })} />
            <SliderField label="Horizontal" value={shape.shadow.offsetX} min={-50} max={50} suffix=" pt" onChange={(v) => patch({ shadow: { ...shape.shadow!, offsetX: v } })} />
            <SliderField label="Vertical" value={shape.shadow.offsetY} min={-50} max={50} suffix=" pt" onChange={(v) => patch({ shadow: { ...shape.shadow!, offsetY: v } })} />
          </>
        )}
      </Section>

      <Section title="Size & Position">
        <div className="grid-fields">
          <NumField label="X" value={shape.x} onChange={(v) => patch({ x: v })} />
          <NumField label="Y" value={shape.y} onChange={(v) => patch({ y: v })} />
          <NumField label="W" value={shape.width} min={1} onChange={(v) => patch({ width: Math.max(1, v) })} />
          <NumField label="H" value={shape.height} min={1} onChange={(v) => patch({ height: Math.max(1, v) })} />
          <NumField label="Rot" value={shape.rotation} min={0} max={360} onChange={(v) => patch({ rotation: ((v % 360) + 360) % 360 })} />
        </div>
        <div className="flip-row">
          <button className="tool-btn" onClick={() => patch({ flipH: !shape.flipH })}>
            <Icon name="arrowLeft" size={14} /> Flip H
          </button>
          <button className="tool-btn" onClick={() => patch({ flipV: !shape.flipV })}>
            <Icon name="arrowUp" size={14} /> Flip V
          </button>
        </div>
        <SliderField label="Opacity" value={shape.opacity ?? 100} onChange={(v) => patch({ opacity: v })} />
      </Section>

      <Section title="Arrange">
        <div className="flip-row">
          <button className="tool-btn" title="Bring to front" onClick={() => st.getState().bringToFront()}>
            <Icon name="layers" size={14} /> Front
          </button>
          <button className="tool-btn" title="Send to back" onClick={() => st.getState().sendToBack()}>
            <Icon name="layers" size={14} /> Back
          </button>
          <button className="tool-btn" title="Duplicate" onClick={() => st.getState().duplicateSelected()}>
            <Icon name="duplicate" size={14} />
          </button>
          <button className="tool-btn danger-text" title="Delete" onClick={() => st.getState().deleteSelected()}>
            <Icon name="trash" size={14} />
          </button>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={!!shape.locked} onChange={(e) => patch({ locked: e.target.checked })} />
          Lock shape
        </label>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

function TextSettings({ shape, patch }: { shape: ShapeBase; patch: (p: Partial<ShapeBase>) => void }) {
  const st = useEditor
  const currentFormat = st((s) => s.currentFormat)
  const paragraphs = shape.paragraphs ?? []
  const firstRun = paragraphs[0]?.runs[0]
  const firstAlign = paragraphs[0]?.align ?? 'left'
  const firstLineSpacing = paragraphs[0]?.lineSpacing

  const applyFormat = (fmt: Partial<TextRun> & { flushSelection?: boolean }) => {
    const canvas = getEditorCanvas()
    const { flushSelection, ...runFmt } = fmt
    const usedSelection = applyTextSelectionStyle(canvas, {
      fontSize: runFmt.size === undefined ? undefined : runFmt.size * PT_TO_PX,
      fontWeight: runFmt.bold === undefined ? undefined : runFmt.bold ? 'bold' : 'normal',
      fontStyle: runFmt.italic === undefined ? undefined : runFmt.italic ? 'italic' : 'normal',
      underline: runFmt.underline,
      linethrough: runFmt.strike,
      fill: runFmt.color,
      textBackgroundColor: runFmt.highlight,
      fontFamily: runFmt.fontFamily,
    })
    if (!usedSelection) {
      // whole shape fallback: adjust first run of each paragraph
      st.getState().updateShapeBy(
        shape.id,
        (s) => {
          const sb = s as ShapeBase
          if (!sb.paragraphs?.length) return s
          sb.paragraphs = sb.paragraphs.map((p) => ({
            ...p,
            runs:
              (p.runs[0]?.text ?? '') === ''
                ? p.runs
                : p.runs.map((r) => {
                    const next: TextRun = { ...r }
                    if (runFmt.size) next.size = runFmt.size
                    if (runFmt.fontFamily) next.fontFamily = runFmt.fontFamily
                    if (runFmt.bold !== undefined) next.bold = runFmt.bold
                    if (runFmt.italic !== undefined) next.italic = runFmt.italic
                    if (runFmt.underline !== undefined) next.underline = runFmt.underline
                    if (runFmt.strike !== undefined) next.strike = runFmt.strike
                    if (runFmt.color) next.color = runFmt.color
                    if (runFmt.highlight !== undefined) next.highlight = runFmt.highlight
                    return next
                  }),
          }))
          return s
        },
        false,
      )
    }
    st.getState().setCurrentFormat(runFmt as CurrentFormat)
  }

  const patchParagraphs = (updater: (ps: Paragraph[]) => Paragraph[]) => {
    st.getState().updateShapeBy(shape.id, (s) => {
      const sb = s as ShapeBase
      sb.paragraphs = updater(sb.paragraphs ?? [{ runs: [{ text: '' }] }])
      return s
    })
  }

  return (
    <Section title="Text">
      <div className="prop-row">
        <select
          value={firstRun?.fontFamily ?? 'Calibri'}
          onChange={(e) => applyFormat({ fontFamily: e.target.value })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="prop-row">
        <select
          value={String(firstRun?.size ?? 18)}
          onChange={(e) => applyFormat({ size: Number(e.target.value) })}
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 54, 60, 72, 96].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="text-tools">
          <button className={'tool-btn' + (currentFormat.bold ? ' active' : '')} title="Bold" onClick={() => applyFormat({ bold: !currentFormat.bold })}>
            <Icon name="bold" size={15} />
          </button>
          <button className={'tool-btn' + (currentFormat.italic ? ' active' : '')} title="Italic" onClick={() => applyFormat({ italic: !currentFormat.italic })}>
            <Icon name="italic" size={15} />
          </button>
          <button className={'tool-btn' + (currentFormat.underline ? ' active' : '')} title="Underline" onClick={() => applyFormat({ underline: !currentFormat.underline })}>
            <Icon name="underline" size={15} />
          </button>
          <button className={'tool-btn' + (currentFormat.strike ? ' active' : '')} title="Strikethrough" onClick={() => applyFormat({ strike: !currentFormat.strike })}>
            <Icon name="strike" size={15} />
          </button>
        </div>
      </div>
      <div className="prop-row">
        <ColorField label="Color" value={firstRun?.color ?? '#202124'} onChange={(hex) => applyFormat({ color: hex })} />
      </div>
      <div className="prop-row">
        <ColorField label="Highlight" value={firstRun?.highlight ?? '#ffffff'} onChange={(hex) => applyFormat({ highlight: hex })} />
      </div>
      <div className="prop-row">
        <div className="text-tools">
          <button className="tool-btn" title="Subscript" onClick={() => applyFormat({ sub: true })}>
            <span className="subsup">x<sub>2</sub></span>
          </button>
          <button className="tool-btn" title="Superscript" onClick={() => applyFormat({ super: true })}>
            <span className="subsup">x<sup>2</sup></span>
          </button>
        </div>
        <div className="align-tools">
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <button
              key={a}
              className={'tool-btn' + (firstAlign === a ? ' active' : '')}
              title={a}
              onClick={() => patchParagraphs((ps) => ps.map((p) => ({ ...p, align: a })))}
            >
              <Icon name={`align${a[0].toUpperCase()}${a.slice(1)}`} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="prop-row">
        <button
          className={'seg-btn' + (paragraphs[0]?.bullet ? ' active' : '')}
          onClick={() => patchParagraphs((ps) => ps.map((p) => ({ ...p, bullet: !(paragraphs[0]?.bullet ?? false) })))}
        >
          <Icon name="bullet" size={14} /> Bullet list
        </button>
      </div>
      <div className="prop-row">
        <label className="select-row">
          <span>Line spacing</span>
          <select
            value={String(firstLineSpacing ?? 1)}
            onChange={(e) => patchParagraphs((ps) => ps.map((p) => ({ ...p, lineSpacing: Number(e.target.value) })))}
          >
            <option value="1">1.0</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
            <option value="2.5">2.5</option>
            <option value="3">3.0</option>
          </select>
        </label>
      </div>
      <div className="prop-row">
        <span className="field-label">Vertical align</span>
        <div className="va-tools">
          {(['top', 'middle', 'bottom'] as const).map((va) => (
            <button
              key={va}
              className={'tool-btn' + ((shape.verticalAlign ?? 'top') === va ? ' active' : '')}
              title={va}
              onClick={() => patch({ verticalAlign: va })}
            >
              <Icon name={va === 'top' ? 'arrowUp' : va === 'middle' ? 'arrowDown' : 'arrowLeft'} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="prop-row">
        <button
          className="tool-btn"
          onClick={() => {
            // reset formatting: first run's base props
            const canvas = getEditorCanvas()
            const used = applyTextSelectionStyle(canvas, {
              fontWeight: 'normal',
              fontStyle: 'normal',
              underline: false,
              linethrough: false,
            })
            if (!used) {
              st.getState().updateShapeBy(shape.id, (s) => {
                const sb = s as ShapeBase
                sb.paragraphs = (sb.paragraphs ?? []).map((p) => ({
                  ...p,
                  runs: p.runs.map((r) => ({
                    text: r.text,
                    fontFamily: r.fontFamily ?? 'Calibri',
                    size: r.size ?? 18,
                    color: '#202124',
                  })),
                }))
                return s
              })
            }
            st.getState().setCurrentFormat({})
          }}
        >
          <Icon name="format" size={14} /> Clear formatting
        </button>
      </div>
      {hasTextEditingSelection(getEditorCanvas()) && (
        <div className="hint">Formatting applies to the selected text inside the box. Select text on the canvas first.</div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Line settings
// ---------------------------------------------------------------------------

function LineSettings({ shape }: { shape: import('../types').LineShape }) {
  const st = useEditor
  const patch = (p: Partial<import('../types').LineShape>) => st.getState().patchShape(shape.id, p as any)
  return (
    <>
      <Section title="Line">
        <div className="prop-row">
          <ColorField label="Color" value={shape.stroke.color} onChange={(hex) => patch({ stroke: { ...shape.stroke, color: hex } })} />
        </div>
        <SliderField label="Weight" value={shape.stroke.width} min={1} max={20} suffix=" pt" onChange={(v) => patch({ stroke: { ...shape.stroke, width: v } })} />
        <div className="dash-row">
          {(['solid', 'dash', 'dot', 'dashDot'] as const).map((d) => (
            <button
              key={d}
              className={'seg-btn' + ((shape.stroke.dash ?? 'solid') === d ? ' active' : '')}
              onClick={() => patch({ stroke: { ...shape.stroke, dash: d } })}
            >
              <svg width="44" height="10">
                <line x1="1" y1="5" x2="43" y2="5" stroke="#202124" strokeWidth="2" strokeDasharray={DASHES[d].join(' ') || 'none'} />
              </svg>
            </button>
          ))}
        </div>
        <div className="flip-row">
          <label className="check-row">
            <input type="checkbox" checked={!!shape.arrowStart} onChange={(e) => patch({ arrowStart: e.target.checked })} />
            Start arrow
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!shape.arrowEnd} onChange={(e) => patch({ arrowEnd: e.target.checked })} />
            End arrow
          </label>
        </div>
      </Section>
      <Section title="Size & Position">
        <div className="grid-fields">
          <NumField label="X1" value={shape.x1} onChange={(v) => patch({ x1: v })} />
          <NumField label="Y1" value={shape.y1} onChange={(v) => patch({ y1: v })} />
          <NumField label="X2" value={shape.x2} onChange={(v) => patch({ x2: v })} />
          <NumField label="Y2" value={shape.y2} onChange={(v) => patch({ y2: v })} />
        </div>
      </Section>
      <Section title="Arrange">
        <div className="flip-row">
          <button className="tool-btn" onClick={() => st.getState().duplicateSelected()}>
            <Icon name="duplicate" size={14} /> Duplicate
          </button>
          <button className="tool-btn danger-text" onClick={() => st.getState().deleteSelected()}>
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Image settings
// ---------------------------------------------------------------------------

function ImageSettings({ shape }: { shape: import('../types').ImageShape }) {
  const st = useEditor
  const patch = (p: Partial<import('../types').ImageShape>) => st.getState().patchShape(shape.id, p)
  return (
    <>
      <Section title="Image">
        <div className="prop-row">
          <label className="file-btn">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const src = await fileToDataURL(f)
                patch({ src } as any)
              }}
            />
            Replace image
          </label>
        </div>
        <SliderField label="Transparency" value={100 - (shape.opacity ?? 100)} onChange={(v) => patch({ opacity: 100 - v })} />
      </Section>
      <Section title="Size & Position">
        <div className="grid-fields">
          <NumField label="X" value={shape.x} onChange={(v) => patch({ x: v })} />
          <NumField label="Y" value={shape.y} onChange={(v) => patch({ y: v })} />
          <NumField label="W" value={shape.width} min={1} onChange={(v) => patch({ width: Math.max(1, v) })} />
          <NumField label="H" value={shape.height} min={1} onChange={(v) => patch({ height: Math.max(1, v) })} />
          <NumField label="Rot" value={shape.rotation} min={0} max={360} onChange={(v) => patch({ rotation: ((v % 360) + 360) % 360 })} />
        </div>
        <div className="flip-row">
          <button className="tool-btn" onClick={() => patch({ flipH: !shape.flipH })}>
            <Icon name="arrowLeft" size={14} /> Flip H
          </button>
          <button className="tool-btn" onClick={() => patch({ flipV: !shape.flipV })}>
            <Icon name="arrowUp" size={14} /> Flip V
          </button>
        </div>
      </Section>
      <Section title="Arrange">
        <div className="flip-row">
          <button className="tool-btn" onClick={() => st.getState().duplicateSelected()}>
            <Icon name="duplicate" size={14} /> Duplicate
          </button>
          <button className="tool-btn danger-text" onClick={() => st.getState().deleteSelected()}>
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Multi selection
// ---------------------------------------------------------------------------

function MultiSettings({ shapes }: { shapes: Shape[] }) {
  const st = useEditor
  const patchAll = (p: Partial<Shape>) => st.getState().patchShapes(shapes.map((s) => s.id), p)
  const first = shapes[0]
  const fill = 'fill' in first ? (first.fill as Fill | undefined) : undefined
  const isSolid = !fill || fill.type === 'solid'
  const solidColor = fill?.type === 'solid' ? fill.color : fill?.type === 'gradient' ? fill.stops[0]?.color : '#202124'

  return (
    <>
      <div className="multi-hint">
        {shapes.length} shapes selected
      </div>
      {shapes.every((s) => 'fill' in s) && (
        <Section title="Fill">
          <div className="prop-row">
            <ThemeColors
              onPick={(hex) => patchAll({ fill: { type: 'solid', color: hex } } as any)}
            />
          </div>
          {isSolid && fill?.type === 'solid' && (
            <div className="prop-row">
              <ColorField label="Color" value={solidColor} onChange={(hex) => patchAll({ fill: { ...fill, color: hex } } as any)} />
            </div>
          )}
        </Section>
      )}
      {shapes.every((s) => 'stroke' in s) && (
        <Section title="Border">
          <div className="prop-row">
            <ColorField
              label="Color"
              value={'stroke' in first ? (first.stroke?.color ?? '#202124') : '#202124'}
              onChange={(hex) => patchAll({ stroke: { color: hex, width: 2 } } as any)}
            />
          </div>
        </Section>
      )}
      <Section title="Arrange">
        <div className="flip-row">
          <button className="tool-btn" onClick={() => st.getState().alignSelected('left')}>Left</button>
          <button className="tool-btn" onClick={() => st.getState().alignSelected('center')}>Center</button>
          <button className="tool-btn" onClick={() => st.getState().alignSelected('right')}>Right</button>
          <button className="tool-btn" onClick={() => st.getState().alignSelected('top')}>Top</button>
          <button className="tool-btn" onClick={() => st.getState().alignSelected('middle')}>Middle</button>
          <button className="tool-btn" onClick={() => st.getState().alignSelected('bottom')}>Bottom</button>
        </div>
        <div className="flip-row">
          <button className="tool-btn" onClick={() => st.getState().distributeSelected('horizontal')}>↔ Distribute</button>
          <button className="tool-btn" onClick={() => st.getState().distributeSelected('vertical')}>↕ Distribute</button>
        </div>
        <div className="flip-row">
          <button className="tool-btn" onClick={() => st.getState().bringToFront()}>
            <Icon name="layers" size={14} /> Front
          </button>
          <button className="tool-btn" onClick={() => st.getState().sendToBack()}>
            <Icon name="layers" size={14} /> Back
          </button>
          <button className="tool-btn" onClick={() => st.getState().duplicateSelected()}>
            <Icon name="duplicate" size={14} />
          </button>
          <button className="tool-btn danger-text" onClick={() => st.getState().deleteSelected()}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Slide navigator (when more than one slide)
// ---------------------------------------------------------------------------

function SlideNavigator() {
  const deck = useEditor((s) => s.deck)
  const selectedSlideId = useEditor((s) => s.selectedSlideId)
  const idx = deck.slides.findIndex((s) => s.id === selectedSlideId)
  return (
    <div className="slide-nav">
      <button className="tool-btn" disabled={idx <= 0} onClick={() => useEditor.getState().selectSlide(deck.slides[idx - 1]?.id ?? null)}>
        <Icon name="chevronLeft" size={14} /> Prev
      </button>
      <span>
        Slide {Math.max(0, idx + 1)} of {deck.slides.length}
      </span>
      <button
        className="tool-btn"
        disabled={idx < 0 || idx >= deck.slides.length - 1}
        onClick={() => useEditor.getState().selectSlide(deck.slides[idx + 1]?.id ?? null)}
      >
        Next <Icon name="chevronRight" size={14} />
      </button>
    </div>
  )
}
