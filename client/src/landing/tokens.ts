import type { CSSProperties } from "react";

/** Colour tokens from the Figma variables (file jKTnLkAYedmlYTsq0HBWpw). The only colours on the landing screen. */
export const TOKENS = {
  blue: "#1447C6",
  black: "#5B5B5B",
  stroke: "#BCBCBC",
  white: "#FFFFFF",
  background: "#F8F8F8",
  gridLine: "#EAEAEA",
} as const;

/** The same tokens as CSS custom properties (--blue, --black, --stroke, --white, --background, --grid-line). */
export const TOKEN_VARS = {
  "--blue": TOKENS.blue,
  "--black": TOKENS.black,
  "--stroke": TOKENS.stroke,
  "--white": TOKENS.white,
  "--background": TOKENS.background,
  "--grid-line": TOKENS.gridLine,
} as CSSProperties;
