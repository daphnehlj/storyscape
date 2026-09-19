import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { POST } from './presets.ts'

/** Post-processing = 80% of the "Sky" look. Tame defaults; tuned in Task 17. */
export function Effects() {
  return (
    <EffectComposer resolutionScale={POST.resolutionScale} multisampling={0}>
      <Bloom {...POST.bloom} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette {...POST.vignette} />
    </EffectComposer>
  )
}
