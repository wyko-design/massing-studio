import { useEffect, useRef } from "react";
import { GlobeRenderer, type GlobePlacement } from "./GlobeRenderer";
import { globeStyle } from "./globeStyle";
import { loadWorld } from "../world";
import { fetchBoundary, fetchPlot, fetchTiles } from "../geoApi";
import type { SelectedAddress, SelectedCity, SelectedCountry } from "../landingStore";

type Props = {
  placement: GlobePlacement;
  country: SelectedCountry | null;
  city: SelectedCity | null;
  address: SelectedAddress | null;
  onSettled: () => void;
  /** The camera is 0.4 s from the end of its zoom in. */
  onResolve: () => void;
  /** The plot of the chosen address could not be loaded. */
  onPlotFailed: () => void;
};

/** Canvas host for GlobeRenderer; React only passes placement and the selected country. */
export function Globe({ placement, country, city, address, onSettled, onResolve, onPlotFailed }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GlobeRenderer | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const resolve = useRef(onResolve);
  resolve.current = onResolve;
  const plotFailed = useRef(onPlotFailed);
  plotFailed.current = onPlotFailed;

  useEffect(() => {
    const r = new GlobeRenderer(canvas.current!, globeStyle);
    renderer.current = r;
    r.resolveCue = () => resolve.current();
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
    if (!r || !city) return;
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
    if (!r || !address) return;
    r.toPlot([address.lon, address.lat], fetchPlot(address.id).catch(() => null), () => settled.current(), () => plotFailed.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

  return (
    <canvas
      ref={canvas}
      className="globe"
      aria-label={address ? `Plot at ${address.label}` : city ? `Map of ${city.name}` : country ? `Map of ${country.name}` : "Spinning globe"}
      role="img"
      style={{ left: placement.left, top: placement.top, width: placement.width, height: placement.height }}
    />
  );
}
