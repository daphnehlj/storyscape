'use client'

import { useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'

export interface DrawingPreview { src: string; title: string }
interface Props {
  preview: DrawingPreview
  onClose: () => void
}

/** A look at one of the sample drawings. Drawing happens at /draw. */
export function DrawingDialog({ preview, onClose }: Props) {
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
      <h2 id="drawing-title">{preview.title}</h2>
      <button className="drawing-tool" type="button" onClick={onClose} aria-label="Close drawing" title="Close drawing"><X size={20} /></button>
    </header>
    <div className="drawing-dialog__preview"><img src={preview.src} alt={preview.title} /></div>
    <footer className="drawing-dialog__footer">
      <a className="story-input__action story-input__action--whiteboard" href={preview.src} download="my-drawing.png"><Download size={18} />Download drawing</a>
    </footer>
  </dialog>
}
