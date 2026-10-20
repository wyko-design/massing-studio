import { useEffect, useRef } from "react";
import { GlobeRenderer, type GlobePlacement } from "./GlobeRenderer";
import { globeStyle } from "./globeStyle";
import { loadWorld } from "../world";
import { fetchBoundary, fetchPlot, fetchTiles } from "../geoApi";
import type { PlotData } from "./plotLayer";
import type { SelectedAddress, SelectedCity, SelectedCountry } from "../landingStore";

type Props = {
  placement: GlobePlacement;
  country: SelectedCountry | null;
  city: SelectedCity | null;
  address: SelectedAddress | null;
  onSettled: () => void;
  /** The camera is 0.4 s from the end of its zoom in. */
  onResolve: () => void;
  /** A little earlier than `onResolve`: the address bar starts to widen. */
  onWiden: () => void;
  /** The plot of the chosen address could not be loaded. */
  onPlotFailed: () => void;
  /** The plot of the chosen address arrived. */
  onPlot: (plot: PlotData) => void;
  /** The site model has taken over: the map fades out over its 3D copy. */
  faded?: boolean;
};

/** Canvas host for GlobeRenderer; React only passes placement and the selected country. */
export function Globe({ placement, country, city, address, onSettled, onResolve, onWiden, onPlotFailed, onPlot, faded = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GlobeRenderer | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const resolve = useRef(onResolve);
  resolve.current = onResolve;
  const widen = useRef(onWiden);
  widen.current = onWiden;
  const plotFailed = useRef(onPlotFailed);
  plotFailed.current = onPlotFailed;
  const gotPlot = useRef(onPlot);
  gotPlot.current = onPlot;

  useEffect(() => {
    const r = new GlobeRenderer(canvas.current!, globeStyle);
    renderer.current = r;
    r.resolveCue = () => resolve.current();
    r.widenCue = () => widen.current();
    if (import.meta.env.DEV) (window as unknown as { __globe?: GlobeRenderer }).__globe = r; // frame-time checks
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => r.setReducedMotion(motion.matches);
    onMotion();
    motion.addEventListener("change", onMotion);
    let live = true;
    void loadWorld().then((w) => live && r.setData(w.topology, w.coarse, w.shapes.values()));
    return () => {
      live = false;
      motion.removeEventListener("change", onMotion);
      r.destroy();
      renderer.current = null;
    };
  }, []);

  useEffect(() => renderer.current?.place(placement), [placement]);

  const id = country?.id ?? null;
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const done = () => settled.current();
    if (!id) return r.toIdle(done);
    let live = true;
    void loadWorld().then((w) => {
      const shape = w.shapes.get(id);
      if (live && shape) r.toCountry(shape, done, (bbox) => fetchTiles(bbox, 2).catch(() => null));
    });
    return () => {
      live = false;
    };
  }, [id]);

  // a city was chosen: pan to it, switch the blue to its boundary, zoom in. Data comes from the server; a failure falls back to a circle / no details.
  const cityKey = city ? `${city.cc}|${city.name}|${city.lon}|${city.lat}` : null;
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    // the back arrow cleared the city: zoom out to the country
    if (!city) return r.backToCountry(() => settled.current());
    const cc = city.cc;
    r.toCity(
      { lon: city.lon, lat: city.lat, population: city.population },
      fetchBoundary({ n: city.name, a: [], y: city.lat, x: city.lon, p: city.population }, cc).catch(() => null),
      (bbox) => fetchTiles(bbox).catch(() => null),
      () => settled.current(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey]);

  // an address was chosen: pan to it, switch the blue to its parcel, zoom in. The plot comes from the server; a failure pans back.
  const addressId = address?.id ?? null;
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    // the back arrow cleared the address: zoom out to the city (a no-op after a failed plot, which pans back by itself)
    if (!address) return r.backToCity(() => settled.current());
    r.toPlot([address.lon, address.lat], fetchPlot(address.id).then(
        (p) => {
          gotPlot.current(p);
          return p;
        },
        () => null,
      ), () => settled.current(), () => plotFailed.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

  return (
    <canvas
      ref={canvas}
      className="globe"
      aria-label={address ? `Plot at ${address.label}` : city ? `Map of ${city.name}` : country ? `Map of ${country.name}` : "Spinning globe"}
      role="img"
      style={{ left: placement.left, top: placement.top, width: placement.width, height: placement.height, opacity: faded ? 0 : 1, pointerEvents: faded ? "none" : undefined }}
    />
  );
}
