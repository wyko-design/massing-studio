import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { pointInRing, type Envelope, type SiteScene, type Volume } from "@massing/shared";
import { CONTEXT_STYLES, type RenderStyle } from "./renderStyle";
import { ringBounds } from "./geometry";
import { Sun } from "./Sun";
import { Ground, Parcel } from "./Ground";
import { ContextModel } from "./ContextModel";
import { ProposalLight, ProposalVolume } from "./ProposalVolume";
import { Effects } from "./Effects";
import { EnvelopeGhost } from "./EnvelopeGhost";

export type SceneProps = {
  scene: SiteScene;
  envelope?: Envelope | null;
  /** Massing to show; replaces `scene.proposal`. The plot's own house is hidden while one is shown. */
  proposal?: Volume[];
  style: RenderStyle;
};

/**
 * Draws the frame itself. The label layer (priority 2) takes the render loop over from R3F; in the sun look the effect
 * composer then renders, in the line look (no composer) this does, before the labels.
 */
function RenderPass() {
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 1);
  return null;
}

/** Everything inside the Canvas except the camera: shared by the on-screen viewer and the export render. */
export function SceneContents({ scene, envelope, proposal: proposalProp, style }: SceneProps) {
  const proposal = proposalProp ?? scene.proposal;
  const showsOwnProposal = proposalProp !== undefined;
  // the existing house on the parcel is replaced by the proposal: drop context whose centre lies on the parcel
  const context = useMemo(
    () =>
      showsOwnProposal
        ? scene.context.filter((c) => {
            const n = c.ring.length;
            const mid: [number, number] = [c.ring.reduce((s, p) => s + p[0], 0) / n, c.ring.reduce((s, p) => s + p[1], 0) / n];
            return !pointInRing(mid, scene.parcel.ring);
          })
        : scene.context,
    [scene, showsOwnProposal],
  );
  const { sceneRadius, maxHeight } = useMemo(() => {
    const b = ringBounds([scene.parcel.ring, ...scene.context.map((c) => c.ring)]);
    const heights = [...scene.context.map((c) => c.height), ...(proposal ?? []).map((v) => v.zBase + v.height + (v.roof?.ridgeHeight ?? 0))];
    return {
      sceneRadius: Math.hypot(Math.max(-b.minX, b.maxX), Math.max(-b.minY, b.maxY)),
      maxHeight: Math.max(0, ...heights),
    };
  }, [scene, proposal]);
  const sun = style.look === "sun";

  return (
    <>
      <color attach="background" args={[style.background]} />
      {sun ? <Sun style={style.light} origin={scene.origin} sceneRadius={sceneRadius} maxHeight={maxHeight} /> : <ProposalLight />}
      <Ground colour={style.background} shadowOpacity={style.light.shadowOpacity} shadows={sun} />
      <Parcel ring={scene.parcel.ring} colour={style.parcelColour} line={style.parcelLine} shadowOpacity={style.light.shadowOpacity} look={style.look} />
      <ContextModel buildings={context} colour={CONTEXT_STYLES[style.context.style]} edges={style.context.edges} look={style.look} />
      {proposal && <ProposalVolume volumes={proposal} style={style.proposal} look={style.look} />}
      {envelope && style.envelope.visible && <EnvelopeGhost envelope={envelope} style={style.envelope} />}
      {/* the line look is flat: no ambient occlusion, no composer */}
      {sun ? <Effects ao={style.ao} /> : <RenderPass />}
    </>
  );
}
