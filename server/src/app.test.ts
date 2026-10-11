import path from "node:path";
import { describe, expect, it } from "vitest";
import { SiteSceneSchema, centroid, unknownConstraints, type ContextBuilding, type Parcel, type SiteConstraints } from "@massing/shared";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { CacheMissError } from "./cache/diskCache";
import type { SceneProviders } from "./scene";

const config = loadConfig({ SITE_ID: "demo", SITE_ADDRESS: "Demo 1, Delft" });

// A 10 × 10 m parcel with its centroid at RD (85630, 446610), plus one building next to it.
const parcel: Parcel = {
  id: "DEL00 K 1",
  areaM2: 100,
  indicative: true,
  ring: [
    [85625, 446605],
    [85635, 446605],
    [85635, 446615],
    [85625, 446615],
  ],
};
const building: ContextBuilding = {
  id: "b1",
  height: 9,
  ring: [
    [85640, 446605],
    [85650, 446605],
    [85650, 446615],
    [85640, 446615],
  ],
};

// Fixture constraints in RD, with a bouwvlak covering the west half of the parcel.
const fixtureConstraints: SiteConstraints = {
  ...unknownConstraints("fixture"),
  maxHeight: { value: 12, unit: "m", prov: { source: "plan", status: "verified" } },
  bouwvlak: {
    value: { type: "Polygon", coordinates: [[[85625, 446605], [85630, 446605], [85630, 446615], [85625, 446615], [85625, 446605]]] },
    prov: { source: "plan map", status: "verified" },
  },
};

function fakeProviders(overrides: Partial<SceneProviders> = {}): SceneProviders {
  return {
    geocoder: { geocode: async (q) => (q.includes("nowhere") ? null : { label: q, point: { x: 85630, y: 446610 } }) },
    parcels: { parcelAt: async () => parcel },
    context: { buildingsNear: async () => [building] },
    zoning: { constraintsFor: async (p) => (p.id === parcel.id ? { fixtureId: "demo", constraints: fixtureConstraints } : null) },
    skippedContext: () => 2,
    ...overrides,
  };
}

describe("server", () => {
  it("answers health", async () => {
    const app = createApp({ config });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
  });

  it("serves a valid sample scene", async () => {
    const app = createApp({ config });
    const res = await app.request("/api/scene/sample");
    const body: unknown = await res.json();
    expect(() => SiteSceneSchema.parse(body)).not.toThrow();
  });

  it("builds a local-frame scene around the parcel centroid", async () => {
    const dirs: string[] = [];
    const app = createApp({
      config,
      providersFor: (dir) => (dirs.push(dir), fakeProviders()),
    });
    const res = await app.request("/api/scene");
    expect(res.status).toBe(200);
    const scene = SiteSceneSchema.parse(await res.json());
    const [cx, cy] = centroid(scene.parcel.ring);
    expect(Math.hypot(cx, cy)).toBeLessThan(1e-6);
    expect(scene.parcel.ring[0]).toEqual([-5, -5]);
    expect(scene.context[0]!.ring[0]).toEqual([10, -5]);
    expect(scene.origin.lat).toBeGreaterThan(51.9);
    expect(scene.origin.lat).toBeLessThan(52.1);
    expect(scene.origin.lon).toBeGreaterThan(4.2);
    expect(scene.origin.lon).toBeLessThan(4.5);
    expect(scene.meta).toMatchObject({ address: "Demo 1, Delft", contextCount: 1, skippedContext: 2 });
    expect(dirs).toEqual(["demo"]);
  });

  it("attaches the site fixture's constraints in the local frame", async () => {
    const app = createApp({ config, providersFor: () => fakeProviders() });
    const scene = SiteSceneSchema.parse(await (await app.request("/api/scene")).json());
    expect(scene.zoning?.fixtureId).toBe("demo");
    expect(scene.zoning?.constraints.maxHeight.value).toBe(12);
    expect(scene.zoning?.constraints.bouwvlak?.value?.coordinates[0]?.[0]).toEqual([-5, -5]);
    expect(scene.meta?.sources.at(-1)).toMatch(/data\/sites\/demo\.json/);
  });

  it("marks every constraint unknown when no fixture matches the parcel", async () => {
    const app = createApp({
      config,
      providersFor: () => fakeProviders({ parcels: { parcelAt: async () => ({ ...parcel, id: "DEL00 K 2" }) } }),
    });
    const scene = SiteSceneSchema.parse(await (await app.request("/api/scene")).json());
    expect(scene.zoning?.fixtureId).toBeNull();
    expect(scene.zoning?.constraints.maxHeight).toMatchObject({ value: null, prov: { status: "assumed" } });
    expect(scene.zoning?.constraints.maxHeight.prov.source).toMatch(/No site fixture for parcel DEL00 K 2/);
  });

  it("caches only the demo address under the site directory", async () => {
    const dirs: string[] = [];
    const app = createApp({ config, providersFor: (dir) => (dirs.push(dir), fakeProviders()) });
    await app.request("/api/scene?q=Demo%201,%20Delft");
    await app.request("/api/scene?q=Elsewhere%202");
    expect(dirs).toEqual(["demo", "_adhoc"]);
  });

  it("maps failures to statuses", async () => {
    const q = (s: string) => `/api/scene?q=${encodeURIComponent(s)}`;
    const app = createApp({ config, providersFor: () => fakeProviders() });
    expect((await app.request(q("nowhere"))).status).toBe(404);

    const noParcel = createApp({ config, providersFor: () => fakeProviders({ parcels: { parcelAt: async () => null } }) });
    const res = await noParcel.request("/api/scene");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/parcel/i);

    const offline = createApp({
      config,
      providersFor: () =>
        fakeProviders({
          geocoder: {
            geocode: async () => {
              throw new CacheMissError("https://x");
            },
          },
        }),
    });
    expect((await offline.request("/api/scene")).status).toBe(503);
  });

  it("resolves the cache root inside the repo", () => {
    expect(config.cacheRoot.endsWith(path.join("data", "cache"))).toBe(true);
  });
});

describe("config", () => {
  it("rejects an unknown cache mode", () => {
    expect(() => loadConfig({ CACHE_MODE: "sometimes" })).toThrow(/CACHE_MODE/);
  });
});

describe("hosted mode", () => {
  const basic = (pw: string) => ({ authorization: `Basic ${Buffer.from(`massing:${pw}`).toString("base64")}` });

  it("asks for the shared password, except on the health check", async () => {
    const app = createApp({ config: { ...config, accessPassword: "secret" } });
    expect((await app.request("/api/scene/sample")).status).toBe(401);
    expect((await app.request("/api/scene/sample", { headers: basic("wrong") })).status).toBe(401);
    expect((await app.request("/api/scene/sample", { headers: basic("secret") })).status).toBe(200);
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("caps AI calls per hour", async () => {
    const app = createApp({ config: { ...config, aiHourlyLimit: 1 } });
    const post = () => app.request("/api/ai/interpret-brief", { method: "POST", body: "{}" });
    expect((await post()).status).not.toBe(503);
    const second = await post();
    expect(second.status).toBe(503);
    expect(((await second.json()) as { error: { message: string } }).error.message).toMatch(/hourly AI limit/);
  });
});
