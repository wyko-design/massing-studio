import { EffectComposer, N8AO } from "@react-three/postprocessing";
import type { RenderStyle } from "./renderStyle";

/**
 * Post-processing: N8AO ambient occlusion (world-space radius in metres).
 * The composer stays mounted when AO is off: it blends the shadow layer in linear space,
 * so unmounting it would make ground shadows noticeably darker.
 */
export function Effects({ ao }: { ao: RenderStyle["ao"] }) {
  return (
    <EffectComposer multisampling={4}>
      <N8AO
        enabled={ao.enabled}
        aoRadius={ao.radius}
        distanceFalloff={ao.distanceFalloff}
        intensity={ao.intensity}
        color={ao.colour}
        quality={ao.quality}
      />
    </EffectComposer>
  );
}
