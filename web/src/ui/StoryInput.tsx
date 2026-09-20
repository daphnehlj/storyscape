import { useEffect, useRef } from 'react'
import './StoryInput.css'
import ellipse2 from '../assets/ellipse-2.svg'
import iconUpload from '../assets/icon-upload.svg'
import iconPencil from '../assets/icon-pencil.svg'
import group1 from '../assets/group-1-new.svg'
import group3 from '../assets/group-3-new.svg'
import group4 from '../assets/group-4-new.svg'
import image9 from '../assets/image-9-new.png'
import image10 from '../assets/image-10-new.png'
import image11 from '../assets/image-11-new.png'

const FRAME_WIDTH = 1440

export default function StoryInput() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Scale the 1440-wide Figma frame to the viewport width so it fills edge to edge.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      el.style.setProperty('--scale', String(el.clientWidth / FRAME_WIDTH))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="story-input-viewport" ref={viewportRef}>
      <div className="story-input">
        <div className="story-input__glow" aria-hidden="true">
          <img src={ellipse2} alt="" />
        </div>

        <div className="story-input__form">
          <p className="story-input__prompt">What do you dream of?</p>
        </div>

        <div className="story-input__actions">
          <input ref={uploadInputRef} className="story-input__file-input" type="file" accept="image/*" />
          <button className="story-input__action story-input__action--upload" type="button" onClick={() => uploadInputRef.current?.click()}>
            <img src={iconUpload} alt="" />
            <span>Upload Drawing</span>
          </button>
          <button className="story-input__action story-input__action--whiteboard" type="button">
            <img src={iconPencil} alt="" />
            <span>Whiteboard</span>
          </button>
        </div>

        <div className="story-input__book story-input__book--left">
          <div className="story-input__book-inner">
            <img alt="" src={group1} />
          </div>
        </div>

        <div className="story-input__book story-input__book--right">
          <div className="story-input__book-inner">
            <img alt="" src={group4} />
          </div>
        </div>

        <div className="story-input__drawing story-input__drawing--family">
          <div className="story-input__drawing-inner">
            <img alt="" src={image9} />
          </div>
        </div>

        <div className="story-input__drawing story-input__drawing--park">
          <div className="story-input__drawing-inner">
            <div className="story-input__drawing-crop">
              <img alt="" src={image10} />
            </div>
          </div>
        </div>

        <div className="story-input__book story-input__book--center">
          <div className="story-input__book-inner">
            <img alt="" src={group3} />
          </div>
        </div>

        <div className="story-input__drawing story-input__drawing--house">
          <div className="story-input__drawing-inner">
            <img alt="" src={image11} />
          </div>
        </div>
      </div>
    </div>
  )
}
