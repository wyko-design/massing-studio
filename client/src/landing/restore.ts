import { fetchAddressSuggestions, fetchPlot } from "./geoApi";
import { useLandingStore } from "./landingStore";
import { useSiteStore } from "../state/siteStore";

/**
 * The studio opened directly (a reload on #studio/…): there is no globe flow to come from, so the site (the server's
 * default site) is loaded, its address looked up for the plot the site model is built from, and the landing's state set
 * as if the user had just clicked "Start exploring", with the intro already played.
 */
export async function restoreStudio(): Promise<void> {
  const site = useSiteStore.getState();
  if (!site.scene) await site.load();
  const { scene, address, error } = useSiteStore.getState();
  if (!scene) throw new Error(error ?? "Could not load the site.");
  const label = scene.meta?.address ?? address;
  if (!label) throw new Error("The site has no address to build the model from.");
  const hit = (await fetchAddressSuggestions(label, scene.origin.lat, scene.origin.lon))[0];
  if (!hit) throw new Error(`No address found for ${label}.`);
  const plot = await fetchPlot(hit.id);
  useLandingStore.setState({
    address: hit,
    plot,
    step: "plot",
    phase: "plot",
    panelOpen: true,
    model: "on",
    modelPrepared: true,
    modelStart: performance.now() - 1e6,
  });
}
