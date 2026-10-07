import { SiteSceneSchema, type SiteScene } from "@massing/shared";

/** Load the site for an address; with no address the server uses its default site. */
export async function fetchScene(address?: string): Promise<SiteScene> {
  const url = address ? `/api/scene?q=${encodeURIComponent(address)}` : "/api/scene";
  const res = await fetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error;
    throw new Error(message ?? `scene request failed: ${res.status}`);
  }
  return SiteSceneSchema.parse(body);
}
