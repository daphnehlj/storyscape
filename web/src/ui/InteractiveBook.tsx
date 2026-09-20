import { useEffect, useState, type PointerEvent } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

/* ANIMATION STORYBOARD
 *   0ms  hover or focus: book lifts; pointer gently tilts the whole spread
 *  90ms  drawing follows with a small lift above the paper
 *  exit  book and drawing spring back into their original composition
 */
const TIMING = { drawingLift: 90 } // Follow-through after the book starts moving.
const BOOK = {
  restY: 0, liftY: -24, restScale: 1, liftedScale: 1.035,
  maxTilt: 4, perspective: 1100,
  spring: { type: 'spring' as const, stiffness: 260, damping: 24, mass: 0.8 },
}
const DRAWING = {
  restY: 0, liftY: -7,
  spring: { type: 'spring' as const, stiffness: 230, damping: 22 },
}
interface BookProps {
  id: 'family' | 'park' | 'house'
  title: string
  cover: string
  drawing: string
  onOpen: () => void
  replayTrigger?: number
}

export function InteractiveBook({ id, title, cover, drawing, onOpen, replayTrigger = 0 }: BookProps) {
  const [stage, setStage] = useState(0)
  const [engagement, setEngagement] = useState(0)
  const reduced = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(x, BOOK.spring)
  const rotateY = useSpring(y, BOOK.spring)

  useEffect(() => {
    if (!engagement || reduced) { setStage(0); return }
    setStage(1)
    const timer = window.setTimeout(() => setStage(2), TIMING.drawingLift)
    return () => window.clearTimeout(timer)
  }, [engagement, reduced, replayTrigger])

  function tilt(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'mouse' || reduced) return
    const box = event.currentTarget.getBoundingClientRect()
    x.set(-((event.clientY - box.top) / box.height - 0.5) * BOOK.maxTilt * 2)
    y.set(((event.clientX - box.left) / box.width - 0.5) * BOOK.maxTilt * 2)
  }

  return (
    <div className={`storybook storybook--${id}${engagement ? ' is-engaged' : ''}`} data-stage={stage}>
      <motion.div className="storybook__motion" style={{ rotateX, rotateY, transformPerspective: BOOK.perspective }}
        initial={false} animate={{ y: stage >= 1 ? BOOK.liftY : BOOK.restY, scale: stage >= 1 ? BOOK.liftedScale : BOOK.restScale }}
        transition={reduced ? { duration: 0 } : BOOK.spring}>
        <div className="storybook__cover"><img src={cover} alt="" draggable={false} /></div>
        <motion.div className="storybook__art" initial={false}
          animate={{ y: stage >= 2 ? DRAWING.liftY : DRAWING.restY }} transition={reduced ? { duration: 0 } : DRAWING.spring}>
          <div className="storybook__art-inner"><img src={drawing} alt="" draggable={false} /></div>
        </motion.div>
      </motion.div>
      <button className="storybook__hit" type="button" aria-label={`Open ${title} drawing`} onClick={onOpen}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setEngagement((value) => value | 1) }}
        onPointerMove={tilt}
        onPointerLeave={() => { setEngagement((value) => value & ~1); x.set(0); y.set(0) }}
        onFocus={() => setEngagement((value) => value | 2)}
        onBlur={() => { setEngagement((value) => value & ~2); x.set(0); y.set(0) }} />
    </div>
  )
}
