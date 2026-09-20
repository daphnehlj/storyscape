import { useId } from 'react'

const FRAME = { width: 1440, height: 1024 }
const BLUR_STEPS = [0, 4, 10, 18, 28, 40, 55, 75, 100]
// Original Ellipse 2 geometry supplied by Figma, in frame coordinates.
const SHAPE = 'M1492 136C2068 1368 1266.22 1221 627.5 1221C-324.5 1355.5 -91.5004 785.599 -91.5004 586.5C-91.5004 387.401 233.782 487.5 872.5 487.5C1511.22 487.5 1492 -63.0988 1492 136Z'

export function ProgressiveBackdrop() {
  const id = useId()
  return (
    <svg className="story-input__backdrop" viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <path id={`${id}-shape`} d={SHAPE} fill="#F0ECFF" fillOpacity="0.7" />
        {BLUR_STEPS.map((blur, index) => {
          const position = index / (BLUR_STEPS.length - 1)
          const step = 1 / (BLUR_STEPS.length - 1)
          return <g key={blur}>
            <filter id={`${id}-blur-${index}`} x="-300" y="-300" width="2200" height="1900" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation={blur} /></filter>
            <linearGradient id={`${id}-weight-${index}`} x1="0" x2={FRAME.width} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              {index > 0 && <stop offset={position - step} stopColor="black" />}
              <stop offset={position} stopColor="white" />
              {index < BLUR_STEPS.length - 1 && <stop offset={position + step} stopColor="black" />}
            </linearGradient>
            <mask id={`${id}-mask-${index}`} x="0" y="0" width={FRAME.width} height={FRAME.height} maskUnits="userSpaceOnUse" style={{ maskType: 'luminance' }}>
              <rect width={FRAME.width} height={FRAME.height} fill={`url(#${id}-weight-${index})`} />
            </mask>
          </g>
        })}
      </defs>
      {/* Complementary weights sum to one; additive blending preserves the fill opacity. */}
      <g style={{ isolation: 'isolate' }}>
        {BLUR_STEPS.map((blur, index) => <g key={blur} mask={`url(#${id}-mask-${index})`} style={{ mixBlendMode: 'plus-lighter' }}>
          <use href={`#${id}-shape`} filter={`url(#${id}-blur-${index})`} />
        </g>)}
      </g>
    </svg>
  )
}
