import { Composition } from "remotion";
import { Main, totalFrames } from "./Main";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="Demo" component={Main} durationInFrames={totalFrames()} fps={30} width={1920} height={1080} />
  );
};
