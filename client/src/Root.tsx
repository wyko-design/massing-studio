import { Suspense, lazy, useEffect, useState } from "react";
import { Landing } from "./landing/Landing";

// the studio (three.js, R3F) loads only when it is opened
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

const STUDIO_HASH = "#studio";

/** Landing screen by default; the existing studio flow at #studio. */
export function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (hash === STUDIO_HASH) {
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );
  }
  return <Landing />;
}
