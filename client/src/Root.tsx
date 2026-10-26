import { useEffect, useRef } from "react";
import { Landing } from "./landing/Landing";
import { isStudioHash } from "./routes";

/**
 * One page: the landing, which turns into the studio around the site model (#studio/directions, /present, /rules). Leaving
 * the studio's hashes (the browser's back button) starts the landing afresh: its globe cannot resume mid-flow.
 */
export function Root() {
  const was = useRef(window.location.hash);
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash;
      if (isStudioHash(was.current) && !isStudioHash(next)) return window.location.reload();
      was.current = next;
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return <Landing />;
}
