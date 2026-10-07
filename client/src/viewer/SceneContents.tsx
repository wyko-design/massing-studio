import { useMemo } from "react";
import { pointInRing, type Envelope, type SiteScene, type Volume } from "@massing/shared";
import { CONTEXT_STYLES, type RenderStyle } from "./renderStyle";
import { ringBounds } from "./geometry";
import { Sun } from "./Sun";
import { Ground, Parcel } from "./Ground";
import { ContextModel } from "./ContextModel";
import { ProposalVolume } from "./ProposalVolume";
import { Effects } from "./Effects";
import { EnvelopeGhost } from "./EnvelopeGhost";

export type SceneProps = {
  scene: SiteScene;
  envelope?: Envelope | null;
  /** Massing to show; replaces `scene.proposal`. The plot's own house is hidden while one is shown. */
  proposal?: Volume[];
  style: RenderStyle;
};

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

  return (
    <>
      <color attach="background" args={[style.background]} />
      <Sun style={style.light} origin={scene.origin} sceneRadius={sceneRadius} maxHeight={maxHeight} />
      <Ground colour={style.background} shadowOpacity={style.light.shadowOpacity} />
      <Parcel ring={scene.parcel.ring} colour={style.parcelColour} shadowOpacity={style.light.shadowOpacity} />
      <ContextModel buildings={context} colour={CONTEXT_STYLES[style.context.style]} />
      {proposal && <ProposalVolume volumes={proposal} style={style.proposal} />}
      {envelope && style.envelope.visible && <EnvelopeGhost envelope={envelope} style={style.envelope} />}
      <Effects ao={style.ao} />
    </>
  );
}
