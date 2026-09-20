import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Download, Redo2, Trash2, Undo2, X, Check } from 'lucide-react'
import { getStroke } from 'perfect-freehand'

export interface DrawingPreview { src: string; title: string }
interface Props {
  preview: DrawingPreview | null
  onClose: () => void
  onUseDrawing: (src: string) => void
}
type Point = [number, number, number]
interface Stroke { points: Point[]; color: string; size: number }
const COLORS = [
  ['Ink', '#243443'], ['Red', '#dc5c54'], ['Blue', '#347fe1'],
  ['Green', '#65a64d'], ['Yellow', '#eebd32'], ['Violet', '#9367c4'],
]
const BOARD = { width: 960, height: 600 }

function strokePath(stroke: Stroke) {
  const outline = getStroke(stroke.points, { size: stroke.size, simulatePressure: true })
  return outline.length ? `M${outline.map((point) => point.join(',')).join('L')}Z` : ''
}

export function DrawingDialog({ preview, onClose, onUseDrawing }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return <dialog className="drawing-dialog" ref={dialog} aria-labelledby="drawing-title"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header className="drawing-dialog__header">
      <h2 id="drawing-title">{preview?.title ?? 'Whiteboard'}</h2>
      <button className="drawing-tool" type="button" onClick={onClose} aria-label="Close drawing" title="Close drawing"><X size={20} /></button>
    </header>
    {preview ? <>
      <div className="drawing-dialog__preview"><img src={preview.src} alt={preview.title} /></div>
      <footer className="drawing-dialog__footer">
        <a className="story-input__action story-input__action--whiteboard" href={preview.src} download="my-drawing.png"><Download size={18} />Download drawing</a>
      </footer>
    </> : <Whiteboard onUseDrawing={onUseDrawing} />}
  </dialog>
}

function Whiteboard({ onUseDrawing }: Pick<Props, 'onUseDrawing'>) {
  const [color, setColor] = useState(COLORS[0][1])
  const [size, setSize] = useState(8)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redo, setRedo] = useState<Stroke[]>([])
  const [active, setActive] = useState<Stroke | null>(null)
  const activeStroke = useRef<{ stroke: Stroke; pointerId: number } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  function point(event: PointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return [(event.clientX - rect.left) * BOARD.width / rect.width, (event.clientY - rect.top) * BOARD.height / rect.height, event.pressure || 0.5]
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || activeStroke.current || exporting) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke = { points: [point(event)], color, size }
    activeStroke.current = { stroke, pointerId: event.pointerId }
    setActive(stroke)
    setRedo([])
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = activeStroke.current
    if (!current || current.pointerId !== event.pointerId) return
    const stroke = { ...current.stroke, points: [...current.stroke.points, point(event)] }
    activeStroke.current = { ...current, stroke }
    setActive(stroke)
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    const current = activeStroke.current
    if (!current || current.pointerId !== event.pointerId) return
    setStrokes((previous) => [...previous, current.stroke])
    activeStroke.current = null
    setActive(null)
  }
  async function useDrawing() {
    if (!svg.current || !strokes.length) return
    setExporting(true)
    setError('')
    const clone = svg.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(BOARD.width))
    clone.setAttribute('height', String(BOARD.height))
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = BOARD.width
      canvas.height = BOARD.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      if (mounted.current) onUseDrawing(canvas.toDataURL('image/png'))
    } catch {
      if (mounted.current) setError('Your drawing could not open. Please try again.')
    } finally {
      URL.revokeObjectURL(url)
      if (mounted.current) setExporting(false)
    }
  }

  return <>
    <div className="drawing-toolbar">
      <div className="drawing-colors" role="group" aria-label="Pen color">
        {COLORS.map(([name, value]) => <button key={name} type="button" className="drawing-swatch" style={{ backgroundColor: value }} title={name} aria-label={name} aria-pressed={color === value} onClick={() => setColor(value)} />)}
      </div>
      <label className="drawing-size">Size<input type="range" min="2" max="20" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
      <div className="drawing-history">
        <button className="drawing-tool" type="button" title="Undo" aria-label="Undo" disabled={!strokes.length || exporting} onClick={() => { setRedo([...redo, strokes[strokes.length - 1]]); setStrokes(strokes.slice(0, -1)) }}><Undo2 size={19} /></button>
        <button className="drawing-tool" type="button" title="Redo" aria-label="Redo" disabled={!redo.length || exporting} onClick={() => { setStrokes([...strokes, redo[redo.length - 1]]); setRedo(redo.slice(0, -1)) }}><Redo2 size={19} /></button>
        <button className="drawing-tool" type="button" title="Clear drawing" aria-label="Clear drawing" disabled={!strokes.length || exporting} onClick={() => { if (window.confirm('Clear your drawing?')) { setStrokes([]); setRedo([]) } }}><Trash2 size={19} /></button>
      </div>
    </div>
    <svg className="drawing-board" ref={svg} viewBox={`0 0 ${BOARD.width} ${BOARD.height}`} role="img" aria-label="Drawing canvas"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      <rect width={BOARD.width} height={BOARD.height} fill="white" />
      {[...strokes, ...(active ? [active] : [])].map((stroke, index) => <path key={index} d={strokePath(stroke)} fill={stroke.color} />)}
    </svg>
    {error && <p className="story-input__error" role="alert">{error}</p>}
    <footer className="drawing-dialog__footer">
      <button type="button" className="story-input__action story-input__action--whiteboard" disabled={!strokes.length || exporting} onClick={() => void useDrawing()}><Check size={18} />{exporting ? 'Opening...' : 'Use drawing'}</button>
    </footer>
  </>
}
