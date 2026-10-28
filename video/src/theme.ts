import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// The app's colour tokens (client/src/landing/tokens.ts) and its label font (IBM Plex Mono).
export const T = {
  blue: "#1447C6",
  black: "#5B5B5B",
  ink: "#222222",
  stroke: "#BCBCBC",
  white: "#FFFFFF",
  background: "#F8F8F8",
  gridLine: "#EAEAEA",
};

export const MONO = "Plex Mono";
loadFont({ family: MONO, url: staticFile("fonts/ibm-plex-mono-400.ttf"), weight: "400" });
loadFont({ family: MONO, url: staticFile("fonts/ibm-plex-mono-600.ttf"), weight: "600" });

export const CELL = 48;
export const gridBackground = {
  backgroundColor: T.background,
  backgroundImage: `linear-gradient(${T.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${T.gridLine} 1px, transparent 1px)`,
  backgroundSize: `${CELL}px ${CELL}px`,
  backgroundPosition: "-1px -1px",
} as const;
