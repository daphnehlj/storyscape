import { useEffect, useRef } from 'react'
import './StoryInput.css'
import group1 from '../assets/group-1.svg'
import group3 from '../assets/group-3.svg'
import group4 from '../assets/group-4.svg'
import image9 from '../assets/image-9.png'
import image10 from '../assets/image-10.png'
import image11 from '../assets/image-11.png'

const FRAME_WIDTH = 1440

export default function StoryInput() {
  const viewportRef = useRef<HTMLDivElement>(null)

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
        {/* Blurred gradient blob (node 16:220) */}
        <svg
          className="story-input__glow"
          viewBox="0 0 1440 1024"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g filter="url(#filter0_f_16_220)">
            <path
              d="M1492 136C2068 1368 1266.22 1221 627.5 1221C-324.5 1355.5 -91.5004 785.599 -91.5004 586.5C-91.5004 387.401 233.782 487.5 872.5 487.5C1511.22 487.5 1492 -63.0988 1492 136Z"
              fill="#F0ECFF"
              fillOpacity="0.7"
            />
          </g>
          <defs>
            <filter
              id="filter0_f_16_220"
              x="-216.664"
              y="-7.39453"
              width="2006.61"
              height="1348.71"
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur_16_220" />
            </filter>
          </defs>
        </svg>

        <div className="story-input__form">
          <p className="story-input__prompt">What do you dream of?</p>
          <div className="story-input__row">
            <input
              className="story-input__field"
              type="text"
              placeholder="Start typing here..."
            />
            <button className="story-input__button" type="button">
              Generate
            </button>
          </div>
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
