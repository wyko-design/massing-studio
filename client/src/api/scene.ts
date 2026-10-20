import { SiteSceneSchema, type SiteScene } from "@massing/shared";

async function loadScene(url: string): Promise<SiteScene> {
  const res = await fetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error;
    throw new Error(message ?? `scene request failed: ${res.status}`);
  }
  return SiteSceneSchema.parse(body);
}

const recent = new Map<string, { at: number; scene: Promise<SiteScene> }>();
const RECENT_MS = 60_000;

/**
 * Load the site for an address; with no address the server uses its default site. A request in flight or answered within
 * the last minute is shared: the landing asks for the scene as soon as a plot is chosen, the rules window again when it
 * opens (and StrictMode twice in dev). A failure is not kept.
 */
export function fetchScene(address?: string): Promise<SiteScene> {
  const url = address ? `/api/scene?q=${encodeURIComponent(address)}` : "/api/scene";
  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at >= RECENT_MS) recent.delete(k);
  const hit = recent.get(url);
  if (hit) return hit.scene;
  const scene = loadScene(url);
  recent.set(url, { at: now, scene });
  scene.catch(() => recent.get(url)?.scene === scene && recent.delete(url));
  return scene;
}
