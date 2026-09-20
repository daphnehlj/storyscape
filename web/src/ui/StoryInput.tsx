import { useEffect, useRef, useState } from 'react'
import './StoryInput.css'
import iconUpload from '../assets/icon-upload.svg'
import iconPencil from '../assets/icon-pencil.svg'
import group1 from '../assets/group-1-new.svg'
import group3 from '../assets/group-3-new.svg'
import group4 from '../assets/group-4-new.svg'
import image9 from '../assets/image-9-new.png'
import image10 from '../assets/image-10-new.png'
import image11 from '../assets/image-11-new.png'
import { InteractiveBook } from './InteractiveBook'
import { ProgressiveBackdrop } from './ProgressiveBackdrop'
import { DrawingDialog, type DrawingPreview } from './DrawingDialog'

const BOOKS = [
  { id: 'family', title: 'Our family', cover: group1, drawing: image9 },
  { id: 'park', title: 'A day at the park', cover: group4, drawing: image10 },
  { id: 'house', title: 'My dream house', cover: group3, drawing: image11 },
] as const

export default function StoryInput() {
  const galleryRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadOperation = useRef(0)
  const [preview, setPreview] = useState<DrawingPreview | null>(null)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return
    const update = () => gallery.style.setProperty('--art-scale', String(gallery.clientWidth / 1440))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(gallery)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { uploadOperation.current++ }, [])
  useEffect(() => () => {
    if (preview?.src.startsWith('blob:')) URL.revokeObjectURL(preview.src)
  }, [preview])

  async function openDrawing(file: File) {
    const operation = ++uploadOperation.current
    setError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      setError('Choose a PNG, JPG, or WebP drawing smaller than 10 MB.')
      return
    }
    setOpening(true)
    const src = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = src
      await image.decode()
      if (operation !== uploadOperation.current) { URL.revokeObjectURL(src); return }
      setPreview({ src, title: file.name })
    } catch {
      URL.revokeObjectURL(src)
      if (operation === uploadOperation.current) setError('This picture could not open. Try another drawing.')
    } finally {
      if (operation === uploadOperation.current) setOpening(false)
    }
  }

  return (
    <main className="story-input-viewport">
      <ProgressiveBackdrop />
      <section className="story-input__form" aria-labelledby="story-heading">
        <h1 className="story-input__prompt" id="story-heading">Breathe your imagination to life.</h1>
        <div className="story-input__actions">
          <input ref={uploadInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a drawing" disabled={opening}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void openDrawing(file)
              event.currentTarget.value = ''
            }} />
          <button className="story-input__action story-input__action--upload" type="button" disabled={opening} onClick={() => uploadInputRef.current?.click()}>
            <img src={iconUpload} alt="" /><span>{opening ? 'Opening...' : 'Upload Drawing'}</span>
          </button>
          <button className="story-input__action story-input__action--whiteboard" type="button" onClick={() => setWhiteboardOpen(true)}>
            <img src={iconPencil} alt="" /><span>Whiteboard</span>
          </button>
        </div>
        {error && <p className="story-input__error" role="alert">{error}</p>}
      </section>
      <div className="book-gallery" ref={galleryRef}>
        <div className="book-gallery__frame">
          {BOOKS.map((book) => <InteractiveBook key={book.id} {...book} onOpen={() => setPreview({ src: book.drawing, title: book.title })} />)}
        </div>
      </div>
      {(preview || whiteboardOpen) && <DrawingDialog preview={preview}
        onClose={() => { setPreview(null); setWhiteboardOpen(false) }}
        onUseDrawing={(src) => { setPreview({ src, title: 'My drawing' }); setWhiteboardOpen(false) }} />}
    </main>
  )
}
