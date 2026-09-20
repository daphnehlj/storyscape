'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DRAWING_MAX_BYTES, DRAWING_MIME_TYPES } from '@app/shared'
import { createWorld } from '@/api/worlds'
import './StoryInput.css'
const iconUpload = '/landing/icon-upload.svg'
const iconPencil = '/landing/icon-pencil.svg'
const group1 = '/landing/group-1-new.svg'
const group3 = '/landing/group-3-new.svg'
const group4 = '/landing/group-4-new.svg'
const image9 = '/landing/image-9-new.png'
const image10 = '/landing/image-10-new.png'
const image11 = '/landing/image-11-new.png'
import { InteractiveBook } from './InteractiveBook'
import { ProgressiveBackdrop } from './ProgressiveBackdrop'
import { DrawingDialog, type DrawingPreview } from './DrawingDialog'

const BOOKS = [
  { id: 'family', title: 'Our family', cover: group1, drawing: image9 },
  { id: 'park', title: 'A day at the park', cover: group4, drawing: image10 },
  { id: 'house', title: 'My dream house', cover: group3, drawing: image11 },
] as const

export default function StoryInput() {
  const router = useRouter()
  const galleryRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadOperation = useRef(0)
  const [preview, setPreview] = useState<DrawingPreview | null>(null)
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

  // Same path as pressing Done on /draw: the image goes to the server and we
  // follow the world it becomes.
  async function buildWorldFrom(file: File) {
    const operation = ++uploadOperation.current
    setError('')
    if (!DRAWING_MIME_TYPES.includes(file.type as (typeof DRAWING_MIME_TYPES)[number]) || !file.size) {
      setError('Choose a PNG, JPG, WebP, or GIF drawing.')
      return
    }
    if (file.size > DRAWING_MAX_BYTES) {
      setError(`Choose a drawing smaller than ${DRAWING_MAX_BYTES / 1024 / 1024} MB.`)
      return
    }
    setOpening(true)
    try {
      const worldId = await createWorld(file)
      if (operation !== uploadOperation.current) return
      router.push(`/world/${worldId}`)
    } catch (cause) {
      if (operation !== uploadOperation.current) return
      setError(cause instanceof Error ? cause.message : 'That drawing could not be sent. Try again.')
      setOpening(false)
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
              if (file) void buildWorldFrom(file)
              event.currentTarget.value = ''
            }} />
          <button className="story-input__action story-input__action--upload" type="button" disabled={opening} onClick={() => uploadInputRef.current?.click()}>
            <img src={iconUpload} alt="" /><span>{opening ? 'Sending...' : 'Upload Drawing'}</span>
          </button>
          <button className="story-input__action story-input__action--whiteboard" type="button" onClick={() => router.push('/draw')}>
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
      {preview && <DrawingDialog preview={preview} onClose={() => setPreview(null)} />}
    </main>
  )
}
