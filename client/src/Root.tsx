import { Suspense, lazy, useEffect, useState } from "react";
import { Landing } from "./landing/Landing";
import { isStudioHash } from "./routes";

// the studio (three.js, R3F) loads only when it is opened
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

/** Landing screen by default; the existing studio flow at #studio, its Directions screen at #studio/directions. */
export function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (isStudioHash(hash)) {
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );
  }
  return <Landing />;
}
