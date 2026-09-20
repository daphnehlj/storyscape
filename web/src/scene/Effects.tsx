import { Bloom, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { UnsignedByteType } from 'three'
import { POST } from './presets.ts'

/** Post-processing = 80% of the "Sky" look. Tame defaults; tuned in Task 17. */
export function Effects() {
  return (
    // frameBufferType: with the default half-float buffers, Bloom produces occasional single-frame black bands
    // (Chrome on Apple GPUs; measured ~1 frame per 8 s). 8-bit buffers don't. Cost: no HDR headroom in the composer.
    <EffectComposer resolutionScale={POST.resolutionScale} multisampling={0} frameBufferType={UnsignedByteType}>
      <Bloom {...POST.bloom} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={POST.saturation} />
      <Vignette {...POST.vignette} />
    </EffectComposer>
  )
}
