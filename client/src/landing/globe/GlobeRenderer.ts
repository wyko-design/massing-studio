import { mesh } from "topojson-client";
import type { CountryShape, WorldTopology } from "../countries";
import { buildCountryIndex } from "./countryIndex";
import { DotLayer, zoomLevel } from "./dots";
import { easeCubicInOut, easePolyInOut } from "d3-ease";
import type { MultiPolygon, Position } from "geojson";
import type { CityBoundary, TileData } from "../geoApi";
import { asMultiPolygon, circlePolygon, cleanPolygons, geometryBbox, insideTest } from "./cityGeo";
import { countryCentre, fitScale, mainPolygon, viewBlend, type Rect, type View } from "./geo";
import type { GlobeStyle } from "./globeStyle";
import { SHUFFLE_DEFAULTS } from "../shuffle";
import { perfDraw, perfLaps, perfStage, timed } from "../perf";
import { mergeWater } from "./tileGeometry";
import { cityTilesAsync, countryTilesAsync } from "./tileJobs";
import { basisFor, fillPieces, linePieces, polygonPieces, strokePieces, toVec, type Piece } from "./pieces";
import { EARTH_R, localParcel, plotDots, plotLevel, plotView, toLonLat, type GroundKind, type LocalParcel, type PlotData } from "./plotLayer";

/** OpenFreeMap tiles of one map level (country or city): merged water, its outline, borders, and the area they cover. */
type TileLayer = {
  water: Piece[];
  shore: Piece[];
  borders: Piece[];
  box: { s: number; w: number; n: number; e: number };
  /** The box is `factor` × the final frame; the layer fades in from a view at 1.1 × `factor` × ... see `tileAlpha` (scale `finalScale` is the final one). */
  factor: number;
  finalScale: number;
  /** Fills the frame with the land colour (the city layer; the country view keeps its dots and fills). */
  land: boolean;
  inWater: (lon: number, lat: number) => boolean;
};

/** The chosen plot: parcel outline(s), the buildings around it and the parcel in local metres (for the dot infill). */
type PlotLayer = {
  parcel: Piece[];
  buildings: Piece[];
  /** BGT ground surfaces (roads, water). */
  ground: Record<GroundKind, Piece[]>;
  local: LocalParcel | null;
  /** Scale of the final plot view (buildings fade in towards it). */
  finalScale: number;
};

/** Where the canvas sits and what the two frames are (canvas CSS px unless noted). */
export type GlobePlacement = {
  width: number;
  height: number;
  /** Canvas position on the page (CSS px). */
  left: number;
  top: number;
  dpr: number;
  /** Idle globe: centre, radius and its square frame. */
  idle: { cx: number; cy: number; r: number; clip: Rect };
  /** Country view frame. */
  full: Rect;
};

/** The address bar widens over 600 ms (landing.css); it starts this long before the text starts to resolve. */
const WIDEN_LEAD_MS = 650;

/** Closest the camera gets (px per radian): the lattice has levels up to `maxLevel` only. */
const MAX_SCALE = 2_000_000;

/**
 * One step of a sequence. `run(t)` is called every frame with t ∈ [0, 1] over `ms`; a stage with
 * `until` also ends early once it returns true (a wait that gives up after `ms`).
 */
type Stage = { name?: string; ms: number; run?: (t: number) => void; until?: () => boolean };

/**
 * Orthographic globe on a 2D canvas: water, land as dots fixed to the sphere (drawn in perspective),
 * 1 px borders that fade in with the zoom, and an optional selected country in blue. Owns the spin
 * and the transitions.
 */
export class GlobeRenderer {
  private ctx: CanvasRenderingContext2D;
  private p: GlobePlacement | null = null;
  private dots: DotLayer | null = null;
  /** Land/water edges (110m for the whole globe, 50m zoomed in) and the borders between countries. */
  private coarseCoastPieces: Piece[] = [];
  private coastPieces: Piece[] = [];
  private borderPieces: Piece[] = [];
  /** Every country's polygons, to fill the ones that are not selected. */
  private countryPieces = new Map<string, Piece[]>();
  private selected: CountryShape | null = null;
  /** The selected country's blue outline: its polygon with the map tiles' water cut out, so it follows the same shore as the grey lines. */
  private selectedPieces: Piece[] = [];
  /** The selected country's whole polygon, for the grey fill once a city is chosen (water bodies stay filled, see `draw`). */
  private selectedFill: Piece[] = [];
  /** Point-in-country test of the selected country with its inlets closed (set once its map tiles are in). */
  private selectedInside: ((lon: number, lat: number) => boolean) | null = null;
  private view: View | null = null;
  private spinLon: number;
  /** "spin": idle and turning; "still": parked on a country (or idle with reduced motion). */
  private mode: "spin" | "still" = "spin";
  /** Running sequence (country: pan → blue → zoom; back: zoom out → blue off → pan), and when its current stage began. */
  private stages: Stage[] = [];
  private stageStart = 0;
  private sequenceDone: (() => void) | null = null;
  /** How blue the selected country is (dots and outline), 0–1. */
  private blue = 0;
  /** Selected city: outline pieces, "inside" test for the dots, the geometry (for framing), how blue it is, map details. */
  private cityPieces: Piece[] = [];
  private cityInside: ((lon: number, lat: number) => boolean) | null = null;
  /** The city's boundary as given (water included): only inside it do the city's tiles decide the dots. */
  private cityBoundary: ((lon: number, lat: number) => boolean) | null = null;
  private cityGeometry: MultiPolygon | null = null;
  private cityBlue = 0;
  /** Selected plot (parcel + surrounding buildings) and how blue it is: the parcel's outline and dot infill. */
  private plot: PlotLayer | null = null;
  private plotData: PlotData | null = null;
  private plotBlue = 0;
  private plotToken = 0;
  /** The city's map tiles (OpenFreeMap): water, its outline and municipality borders, once they have arrived. */
  private tiles: TileLayer | null = null;
  /** The country's tiles (coarser zoom), drawn under the city's. */
  private countryTiles: TileLayer | null = null;
  private countryToken = 0;
  /** Dot lookups still to do for the running sequence; worked off in small slices every frame. */
  private warmGens: Generator<void>[] = [];
  /** Start of the dots' pop-in after load (null until the first frame with data). */
  private introStart: number | null = null;
  private raf = 0;
  private last = 0;
  private hiddenAt = 0;
  private reducedMotion = false;
  /** Called once per zoom in, `SHUFFLE_DEFAULTS.durationMs` (+ 100 ms of lead) before the camera stops (the text then resolves in time). */
  resolveCue: (() => void) | null = null;
  private cueFired = false;
  /** Called once per zoom in, `WIDEN_LEAD_MS` before `resolveCue` (the address bar needs that long to widen). */
  widenCue: (() => void) | null = null;
  private widenFired = false;
  /** Duration of the last drawn frame (ms), for checking performance. */
  frameMs = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private style: GlobeStyle,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.spinLon = style.initialCentre[0];
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  setData(topology: WorldTopology, coarse: WorldTopology, shapes: Iterable<CountryShape>) {
    timed("setData", () => this.setDataNow(topology, coarse, shapes));
    this.requestFrame();
  }

  private setDataNow(topology: WorldTopology, coarse: WorldTopology, shapes: Iterable<CountryShape>) {
    const list = [...shapes];
    this.dots = new DotLayer(buildCountryIndex(list));
    this.countryPieces = new Map(list.map((c) => [c.id, polygonPieces(c.geometry)]));
    const countries = topology.objects.countries;
    this.coastPieces = linePieces(mesh(topology, countries, (a, b) => a === b));
    this.coarseCoastPieces = linePieces(mesh(coarse, coarse.objects.countries, (a, b) => a === b));
    this.borderPieces = linePieces(mesh(topology, countries, (a, b) => a !== b));
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced && this.stages.length) this.skipSequence();
    this.requestFrame();
  }

  place(p: GlobePlacement) {
    const changed =
      !this.p ||
      this.p.width !== p.width ||
      this.p.height !== p.height ||
      this.p.dpr !== p.dpr ||
      this.p.left !== p.left ||
      this.p.top !== p.top;
    this.p = p;
    if (!changed) return;
    const W = Math.round(p.width * p.dpr);
    const H = Math.round(p.height * p.dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    // the frame moved: re-aim a parked country view, keep a running animation as it is
    if (!this.stages.length) this.view = this.plot && this.plotBlue >= 1 ? this.plotViewOf() : this.cityGeometry ? this.cityView() : this.selected ? this.countryView(this.selected) : this.idleView();
    this.requestFrame();
  }

  /**
   * Country chosen: the globe pans over it (nothing blue yet) while every dot of the coming zoom is
   * looked up, then the country turns blue, then a rapid zoom in from straight above.
   */
  toCountry(shape: CountryShape, done: () => void, tiles: (bbox: CityBoundary["bbox"]) => Promise<TileData | null>) {
    this.cueFired = false;
    this.widenFired = false;
    this.selected = shape;
    this.selectedPieces = this.selectedFill = polygonPieces(shape.geometry);
    this.selectedInside = null;
    this.mode = "still";
    this.blue = 0;
    const from = this.view ?? this.idleView();
    const target = this.countryView(shape);
    const above: View = { ...from, centre: target.centre }; // the idle globe, turned to face the country
    const pan = viewBlend(from, above);
    const zoom = viewBlend(above, target);
    this.warmFor(zoom);
    // the country's map tiles (coast and borders from OpenStreetMap), fetched during the pan: they cover 1.5 × the final frame
    // and fade in at the end of the zoom, so the 50m lines are never swapped for a different map at the city step
    const token = ++this.countryToken;
    let tilesSettled = false;
    const box = this.frameBox(target, 1.5);
    void tiles(box)
      .then(async (data) => {
        if (token !== this.countryToken || !data) return;
        const pxDeg = ((180 / Math.PI) * 1) / target.scale;
        // no water inside the country at this level (estuaries, lakes, rivers): only the water outside its polygon is kept, so
        // the grey shore along the country is the polygon's own edge, which is also what the blue outline is
        // inlets, estuaries and gaps up to ~12 px wide at the final frame are closed first: they read as land
        // (in a worker: the unions and differences take ~400 ms, which froze the pan)
        const { closed, water } = await countryTilesAsync(asMultiPolygon(shape.geometry), data.water, pxDeg);
        if (token !== this.countryToken) return;
        this.selectedPieces = this.selectedFill = polygonPieces(closed);
        const closedIndex = buildCountryIndex([{ id: "closed", name: "closed", geometry: closed }]);
        this.selectedInside = (lon, lat) => closedIndex.lookup(lon, lat) >= 0;
        this.countryTiles = timed("makeLayer", () => this.makeLayer(data, box, 1.5, false, target.scale, water));
        timed("applyOverride", () => this.applyOverride());
        this.warmFor(zoom);
      })
      .catch(() => undefined)
      .finally(() => {
        tilesSettled = true;
      });
    const st = this.style;
    this.runSequence(
      [
        { name: "pan", ms: st.panMs, run: (t) => (this.view = pan(easeCubicInOut(t), 0)) },
        { name: "blue", ms: st.blueMs, run: (t) => (this.blue = easeCubicInOut(t)) },
        { name: "hold", ms: st.holdMs }, // a beat on the blue country before the zoom
        { name: "waitTiles", ms: 4000, until: () => tilesSettled }, // the tiles of the zoom (normally long here already)
        { name: "warmDots", ms: st.warmWaitMs, until: () => this.warmDone() },
        {
          name: "zoom",
          ms: st.zoomMs,
          run: (t) => {
            this.view = zoom(1, easePolyInOut.exponent(4)(t));
            this.cueResolve(t, st.zoomMs);
          },
        },
      ],
      () => {
        this.blue = 1;
        this.view = target;
        done();
      },
      () => {
        this.view = target;
        this.blue = 1;
      },
    );
  }

  /** Back to the idle globe: rapid zoom out, the country loses its blue, the globe pans back and spins again. */
  toIdle(done: () => void) {
    if (!this.selected) return done();
    const from = this.view ?? this.countryView(this.selected);
    const shape = this.selected;
    const above: View = { ...this.idleView(), centre: countryCentre(shape.geometry) };
    // from a plot: zoom out to the city first and swap the blue back to the city; the rest is the same as from the city
    const fromPlot = this.plot !== null && this.cityGeometry !== null;
    const cityFrom = fromPlot ? this.cityView() : from;
    const plotZoom = fromPlot ? viewBlend(from, cityFrom) : null;
    const plotBlue0 = this.plotBlue;
    const zoom = viewBlend(cityFrom, above);
    const blue0 = this.blue;
    const cityBlue0 = fromPlot ? 1 : this.cityBlue;
    const finish = () => {
      this.selected = null;
      this.clearCity();
      this.countryToken++;
      this.countryTiles = null;
      this.applyOverride();
      this.blue = 0;
      this.mode = "spin";
      this.view = this.idleView();
      done();
    };
    const st = this.style;
    this.runSequence(
      [
        ...(plotZoom
          ? [
              { name: "zoomOut", ms: st.plotZoomMs, run: (t: number) => this.zoomOut(plotZoom, t) },
              {
                name: "blue",
          ms: st.blueMs,
                run: (t: number) => {
                  const e = easeCubicInOut(t);
                  this.plotBlue = plotBlue0 * (1 - e);
                  this.cityBlue = e;
                },
              },
            ]
          : []),
        { name: "zoomOut", ms: st.zoomMs, run: (t) => this.zoomOut(zoom, t) },
        {
          name: "blue",
          ms: st.blueMs,
          run: (t) => {
            this.blue = blue0 * (1 - easeCubicInOut(t));
            this.cityBlue = cityBlue0 * (1 - easeCubicInOut(t));
          },
        },
        {
          ms: st.panMs,
          run: (t) => {
            // the spin target is read at the end of the sequence's last stage, so it always lands on the idle globe
            this.view = viewBlend(above, this.idleView())(easeCubicInOut(t), 0);
          },
        },
      ],
      finish,
      finish,
    );
  }

  /** Back arrow from a plot: zoom out to the city and swap the blue back from the parcel to the city. */
  backToCity(done: () => void) {
    if (!this.plot || !this.cityGeometry) return done();
    const zoom = viewBlend(this.view ?? this.plotViewOf(), this.cityView());
    const plotBlue0 = this.plotBlue;
    const st = this.style;
    const finish = () => {
      this.plot = null;
      this.plotData = null;
      this.plotBlue = 0;
      this.plotToken++;
      this.cityBlue = 1;
      this.applyOverride();
      this.view = this.cityView();
      done();
    };
    this.runSequence(
      [
        { name: "zoomOut", ms: st.plotZoomMs, run: (t) => this.zoomOut(zoom, t) },
        {
          name: "blue",
          ms: st.blueMs,
          run: (t) => {
            const e = easeCubicInOut(t);
            this.plotBlue = plotBlue0 * (1 - e);
            this.cityBlue = e;
          },
        },
      ],
      finish,
      finish,
    );
  }

  /** Back arrow from a city: zoom out to the country, the blue moves from the city back to the whole country. */
  backToCountry(done: () => void) {
    if (!this.selected || !this.cityGeometry) return done();
    const target = this.countryView(this.selected);
    const zoom = viewBlend(this.view ?? this.cityView(), target);
    const cityBlue0 = this.cityBlue;
    const st = this.style;
    const finish = () => {
      this.clearCity();
      this.blue = 1;
      this.view = target;
      done();
    };
    this.runSequence(
      [
        { name: "zoomOut", ms: st.zoomMs, run: (t) => this.zoomOut(zoom, t) },
        {
          name: "blue",
          ms: st.blueMs,
          run: (t) => {
            const e = easeCubicInOut(t);
            this.cityBlue = cityBlue0 * (1 - e);
            this.blue = e;
          },
        },
      ],
      finish,
      finish,
    );
  }

  private zoomOut(zoom: (turn: number, zoom: number) => View, t: number) {
    const e = easePolyInOut.exponent(4)(t);
    this.view = zoom(e, e);
  }

  private clearCity() {
    this.cityPieces = [];
    this.cityInside = null;
    this.cityBoundary = null;
    this.cityGeometry = null;
    this.cityBlue = 0;
    this.tiles = null;
    this.plot = null;
    this.plotData = null;
    this.plotBlue = 0;
    this.plotToken++;
    this.dots?.dropStagedOverride();
    this.applyOverride();
    this.cityToken++;
  }

  private plotViewOf(): View {
    return plotView(this.plotData!, this.p!.full);
  }

  /**
   * Address chosen (the city is on screen): the camera pans to the address, the blue moves from the city to the
   * parcel, then a rapid zoom in shows the parcel (blue outline, dot infill) with the buildings around it.
   * `failed` is called when the plot cannot be loaded; the globe then pans back over the city.
   */
  toPlot(point: [number, number], data: Promise<PlotData | null>, done: () => void, failed: () => void) {
    this.cueFired = false;
    this.widenFired = false;
    const token = ++this.plotToken;
    const from = this.view ?? this.cityView();
    const above: View = { ...from, centre: point };
    const pan = viewBlend(from, above);
    const st = this.style;
    let ready: { zoom: (turn: number, zoom: number) => View; target: View } | null = null;
    let broken = false;

    void data
      .then((d) => {
        if (token !== this.plotToken) return;
        if (!d) throw new Error("no plot");
        this.plotData = d;
        const target = plotView(d, this.p!.full);
        const polys = d.parcel?.polygons ?? [];
        this.plot = timed("plotPieces", () => ({
          parcel: polys.flatMap((p) => polygonPieces({ type: "Polygon", coordinates: p })),
          ground: Object.fromEntries(
            (Object.keys(d.ground) as GroundKind[]).map((k) => [k, d.ground[k].length ? polygonPieces({ type: "MultiPolygon", coordinates: d.ground[k] }) : []]),
          ) as Record<GroundKind, Piece[]>,
          buildings: d.buildings.flatMap((b) => polygonPieces({ type: "Polygon", coordinates: [[...b.ring, b.ring[0]!]] })),
          local: polys.length ? localParcel(polys, target.centre) : null,
          finalScale: target.scale,
        }));
        ready = { zoom: viewBlend(above, target), target };
      })
      .catch(() => {
        if (token === this.plotToken) broken = true;
      });

    // the plot could not be loaded: pan back over the city and give the step back
    const abort = () => {
      ++this.plotToken; // an answer that still arrives after this is dropped
      this.plot = null;
      this.plotData = null;
      this.plotBlue = 0;
      this.cityBlue = 1;
      this.stages = [{ ms: 700, run: (t) => (this.view = pan(1 - easeCubicInOut(t), 0)) }];
      this.stageStart = performance.now();
      this.sequenceDone = () => {
        this.view = from;
        failed();
      };
      this.requestFrame();
    };
    const finish = () => {
      if (ready) this.view = ready.target;
      this.cityBlue = 0;
      this.plotBlue = 1;
    };
    this.runSequence(
      [
        { name: "pan", ms: st.cityPanMs, run: (t) => (this.view = pan(easeCubicInOut(t), 0)) },
        // a large plot can take a while the first time (nothing cached yet): wait longer than for a city, and if it still
        // has not come, give the step back rather than "zoom" without a target
        { name: "waitData", ms: st.plotWaitMs, until: () => ready !== null || broken },
        {
          name: "blue",
          ms: st.blueMs,
          run: (t) => {
            if (broken || !ready) return abort();
            const e = easeCubicInOut(t);
            this.cityBlue = 1 - e;
            this.plotBlue = e;
          },
        },
        { name: "hold", ms: st.holdMs },
        {
          name: "zoom",
          ms: st.plotZoomMs,
          run: (t) => {
            if (ready) this.view = ready.zoom(easePolyInOut.exponent(4)(t), easePolyInOut.exponent(4)(t));
            this.cueResolve(t, st.plotZoomMs);
          },
        },
      ],
      () => {
        finish();
        done();
      },
      finish,
    );
  }

  /** Guards the asynchronous city data against a newer selection or a reset. */
  private cityToken = 0;

  /** Camera for the selected city: its boundary fills `countryFill` of the frame. */
  private cityView(): View {
    const p = this.p!;
    const g = this.cityGeometry!;
    const b = geometryBbox(g);
    const centre: [number, number] = [(b.w + b.e) / 2, (b.s + b.n) / 2];
    const fit = fitScale(mainPolygon(g), centre, p.full, this.style.countryFill);
    return { centre, scale: Math.min(MAX_SCALE, Math.max(p.idle.r, fit)), cx: p.full.x + p.full.w / 2, cy: p.full.y + p.full.h / 2, clip: p.full };
  }

  /**
   * City chosen (the country is on screen): the camera pans to the city, the blue moves from the
   * whole country to the city's boundary, then a rapid zoom in reveals the map details. The
   * boundary and details come from the server; the zoom waits for the boundary, the details fade in
   * whenever they arrive.
   */
  toCity(
    city: { lon: number; lat: number; population: number },
    boundary: Promise<CityBoundary | null>,
    tiles: (bbox: CityBoundary["bbox"]) => Promise<TileData | null>,
    done: () => void,
  ) {
    this.cueFired = false;
    this.widenFired = false;
    const token = ++this.cityToken;
    this.dots?.dropStagedOverride(); // one left by a flight that was cut short
    const from = this.view ?? this.idleView();
    const above: View = { ...from, centre: [city.lon, city.lat] };
    const pan = viewBlend(from, above);
    const st = this.style;
    let ready: { zoom: (turn: number, zoom: number) => View; target: View } | null = null;
    let failed = false;

    // the boundary first, then the map tiles of the frame (the city box grown by its own size on every side, so the frame is always covered); the zoom waits for both
    void boundary
      .then(async (b) => {
        if (token !== this.cityToken) return;
        const polygon = b?.polygon ?? circlePolygon(city.lon, city.lat, city.population);
        const geometry = asMultiPolygon(polygon);
        // the tiles cover twice the final frame (centred on it): they fade in over the last doubling of the zoom,
        // while the frame is inside them, so the map is only ever refined, never swapped
        this.cityGeometry = geometry;
        const final = this.cityView();
        const box = this.frameBox(final, 2);
        const data = await tiles(box);
        if (token !== this.cityToken) return;
        this.cityPieces = polygonPieces(geometry);
        this.cityInside = insideTest(geometry);
        this.cityBoundary = this.cityInside;
        if (data) {
          const pxDeg = ((180 / Math.PI) * 1) / final.scale;
          // the water merged and the city cut to its land, in a worker (see tileJobs.ts)
          const { water, land } = await cityTilesAsync(geometry, data.water, pxDeg);
          if (token !== this.cityToken) return;
          // the dots keep following the country's map until the blue snaps onto the city (see the blue stage below)
          this.tiles = timed("makeLayer", () => this.makeLayer(data, box, 2, true, final.scale, water));
          // the boundary runs out to sea and over lakes: the city is its land (water cut out, so its outline follows the shore
          // and goes round lakes and rivers, and no dots land on water)
          this.cityGeometry = land;
          this.cityPieces = polygonPieces(land);
          this.cityInside = insideTest(land);
        }
        const target = this.cityView();
        const zoom = viewBlend(above, target);
        this.stageCityOverride();
        this.warmFor(zoom, true); // the centre drifts to the city's middle during the zoom
        ready = { zoom, target };
      })
      .catch(() => {
        failed = true;
      });

    const blue0 = this.blue;
    let overridden = false;
    const finish = () => {
      if (!overridden) this.commitCityOverride();
      if (ready) this.view = ready.target;
      this.blue = 0;
      this.cityBlue = 1;
    };
    this.runSequence(
      [
        { name: "pan", ms: st.cityPanMs, run: (t) => (this.view = pan(easeCubicInOut(t), 0)) },
        { name: "waitData", ms: st.cityWaitMs, until: () => ready !== null || failed },
        {
          name: "blue",
          ms: st.blueMs,
          run: (t) => {
            if (!overridden) {
              overridden = true;
              this.commitCityOverride();
            }
            const e = easeCubicInOut(t);
            this.blue = blue0 * (1 - e);
            this.cityBlue = e;
          },
        },
        { name: "hold", ms: st.holdMs },
        { name: "warmDots", ms: st.warmWaitMs, until: () => this.warmDone() },
        {
          name: "zoom",
          ms: st.cityZoomMs,
          run: (t) => {
            if (ready) this.view = ready.zoom(easePolyInOut.exponent(4)(t), easePolyInOut.exponent(4)(t));
            this.cueResolve(t, st.cityZoomMs);
          },
        },
      ],
      () => {
        finish();
        done();
      },
      finish,
    );
  }

  /**
   * Lon/lat bounds of `factor` × the frame of `view`: the frame's outline is unprojected from the screen onto the sphere,
   * so a tall frame on a country at high latitude is covered, and the box is centred on the view.
   */
  private frameBox(view: View, factor: number) {
    const b = basisFor(view);
    const { clip } = view;
    const centre = view.centre;
    let hLon = 0;
    let hLat = 0;
    const N = 24;
    for (let i = 0; i < 4 * N; i++) {
      const t = (i % N) / N;
      const side = Math.floor(i / N);
      const x = side === 0 ? clip.x + t * clip.w : side === 1 ? clip.x + clip.w : side === 2 ? clip.x + clip.w - t * clip.w : clip.x;
      const y = side === 0 ? clip.y : side === 1 ? clip.y + t * clip.h : side === 2 ? clip.y + clip.h : clip.y + clip.h - t * clip.h;
      const u = (x - b.cx) / b.s;
      const v = -(y - b.cy) / b.s;
      const r2 = Math.min(0.9999, u * u + v * v);
      const w = Math.sqrt(1 - r2);
      const px = b.c[0] * w + b.e[0] * u + b.n[0] * v;
      const py = b.c[1] * w + b.e[1] * u + b.n[1] * v;
      const pz = b.c[2] * w + b.e[2] * u + b.n[2] * v;
      const lon = (Math.atan2(py, px) * 180) / Math.PI;
      const lat = (Math.asin(Math.max(-1, Math.min(1, pz))) * 180) / Math.PI;
      let dLon = lon - centre[0];
      dLon -= 360 * Math.round(dLon / 360);
      hLon = Math.max(hLon, Math.abs(dLon));
      hLat = Math.max(hLat, Math.abs(lat - centre[1]));
    }
    hLon *= factor;
    hLat *= factor;
    return { s: Math.max(-85, centre[1] - hLat), n: Math.min(85, centre[1] + hLat), w: Math.max(-180, centre[0] - hLon), e: Math.min(180, centre[0] + hLon) };
  }

  /** A tile layer from decoded tiles: pieces to draw and a land/water test (a strip index, fast on coasts with 100 000 points). */
  private makeLayer(
    data: TileData,
    box: TileLayer["box"],
    factor: number,
    land: boolean,
    finalScale: number,
    merged = mergeWater(data.water, ((180 / Math.PI) * 1) / finalScale),
  ): TileLayer {
    const water: MultiPolygon = asMultiPolygon({ type: "MultiPolygon", coordinates: merged });
    const index = buildCountryIndex([{ id: "water", name: "water", geometry: water }]);
    const inWater = (lon: number, lat: number) => index.lookup(lon, lat) >= 0;
    // borders do not run over water (rivers, lakes, the sea): the parts inside notable water are cut out
    const borders = clipToLand(data.borders.map((b) => b.p), inWater, (4 * 180) / Math.PI / finalScale);
    return {
      water: polygonPieces(water),
      shore: linePieces({ type: "MultiLineString", coordinates: outlineChains(merged) }),
      borders: borders.flatMap((b) => linePieces({ type: "LineString", coordinates: b })),
      box,
      factor,
      finalScale,
      land,
      inWater,
    };
  }

  /**
   * The dots follow the tiles' water: water is never land; a dot the country polygons put in the sea but the map calls
   * land belongs to the selected country (city tiles only). The city's tiles decide inside their box, the country's elsewhere.
   */
  private applyOverride() {
    const o = this.overrideFor();
    if (o) this.dots!.setOverride(o.box, o.fn);
    else this.dots?.clearOverride();
  }

  private overrideFor(): { box: TileLayer["box"]; fn: (lon: number, lat: number, c: number) => number } | null {
    const country = this.countryTiles;
    const city = this.tiles;
    const outer = country ?? city;
    if (!outer || !this.dots) return null;
    const selected = this.selected ? this.dots.countryNumber(this.selected.id) : -1;
    const inside = (b: TileLayer["box"], lon: number, lat: number) => lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n;
    return {
      box: outer.box,
      fn: (lon, lat, c) => {
        const layer = city && inside(city.box, lon, lat) && this.cityBoundary?.(lon, lat) ? city : country ?? city!;
        if (layer.inWater(lon, lat)) return -1;
        if (c < 0 && this.selectedInside?.(lon, lat)) return selected;
        // only the city's tiles are exact enough to turn sea (by the country polygons) into land
        return c < 0 && layer === city ? selected : c;
      },
    };
  }

  /**
   * The city's override, prepared while the camera pans (`warmFor` fills its cache) and switched on at the blue: applied
   * there at once, it tested every dot in one frame (~50 ms).
   */
  private stageCityOverride() {
    const o = this.overrideFor();
    if (o) this.dots!.stageOverride(o.box, o.fn);
  }

  private commitCityOverride() {
    if (!this.dots?.commitOverride()) this.applyOverride();
  }

  /** Warms the dots along `zoom` (40 sampled views), in time slices spread over the following frames. */
  private warmFor(zoom: (turn: number, zoom: number) => View, drift = false) {
    const dots = this.dots;
    if (!dots) return void (this.warmGens = []);
    const steps = 40;
    // a selected city: its inside test (and the staged override) are warmed too, so the blue and the zoom only read caches
    const selected = this.selected ? dots.countryNumber(this.selected.id) : -1;
    const city = this.cityInside && selected >= 0 ? { selected, inside: this.cityInside } : undefined;
    this.warmGens = Array.from({ length: steps + 1 }, (_, i) => dots.warm(zoom(drift ? i / steps : 1, i / steps), this.style.dots, 1500, city));
  }

  private cueResolve(t: number, ms: number) {
    // a little early (React render + timer drift cost ~ 80 ms): readable at the moment the camera stops, not after
    if (!this.widenFired && ms * (1 - t) <= SHUFFLE_DEFAULTS.durationMs + 100 + WIDEN_LEAD_MS) {
      this.widenFired = true;
      this.widenCue?.();
    }
    if (this.cueFired || ms * (1 - t) > SHUFFLE_DEFAULTS.durationMs + 100) return;
    this.cueFired = true;
    this.resolveCue?.();
  }

  private warmDone() {
    return this.warmGens.length === 0;
  }

  /** Runs generator slices for up to `budgetMs`. */
  private warmSome(budgetMs: number) {
    const t0 = performance.now();
    while (this.warmGens.length && performance.now() - t0 < budgetMs) {
      if (this.warmGens[0]!.next().done) this.warmGens.shift();
    }
  }

  private runSequence(stages: Stage[], done: () => void, skip: () => void) {
    this.stages = stages;
    this.stageStart = performance.now();
    this.sequenceDone = done;
    this.skip = skip;
    if (this.reducedMotion) return this.skipSequence();
    this.requestFrame();
  }
  private skip: (() => void) | null = null;

  /** Reduced motion: jump to the end state. */
  private skipSequence() {
    const done = this.sequenceDone;
    this.stages = [];
    this.sequenceDone = null;
    this.warmGens = [];
    this.skip?.();
    done?.();
    this.requestFrame();
  }

  private idleView(): View {
    const p = this.p!;
    return {
      centre: [this.spinLon, this.style.initialCentre[1]],
      scale: p.idle.r,
      cx: p.idle.cx,
      cy: p.idle.cy,
      clip: p.full, // the globe is never clipped to its own square: it may grow past it while flying
    };
  }

  private countryView(shape: CountryShape): View {
    const p = this.p!;
    const centre = countryCentre(shape.geometry);
    const fit = fitScale(mainPolygon(shape.geometry), centre, p.full, this.style.countryFill);
    const scale = Math.min(p.idle.r * this.style.maxZoom, Math.max(p.idle.r * this.style.minZoom, fit));
    return { centre, scale, cx: p.full.x + p.full.w / 2, cy: p.full.y + p.full.h / 2, clip: p.full };
  }

  private spinning() {
    return this.mode === "spin" && !this.stages.length && !this.reducedMotion;
  }

  private requestFrame() {
    if (!this.raf && document.visibilityState !== "hidden") {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.p) return;
    const dt = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    if (this.stages.length) {
      this.advanceStages(now);
    } else if (this.spinning()) {
      this.spinLon = (((this.spinLon - (this.style.spinDegPerSec * dt) / 1000 + 180) % 360) + 360) % 360 - 180;
      this.view = this.idleView();
    }
    this.draw();
    if (this.stages.length || this.spinning() || this.dots?.pending || this.introActive()) this.raf = requestAnimationFrame(this.tick);
  };

  private introActive() {
    return this.introStart !== null && !this.reducedMotion && performance.now() - this.introStart < this.style.introMs;
  }

  private advanceStages(now: number) {
    // look up dots a little every frame while the globe pans / turns blue, a lot while waiting for them
    const stage = this.stages[0]!;
    perfStage(stage.name ?? "stage");
    this.warmSome(stage.until ? 10 : 6);
    const t = stage.ms <= 0 ? 1 : Math.min(1, (now - this.stageStart) / stage.ms);
    stage.run?.(t);
    if (this.stages[0] !== stage) return; // the stage replaced the running sequence (an aborted flight)
    if (t >= 1 || stage.until?.()) {
      this.stages.shift();
      this.stageStart = now;
      if (!this.stages.length) {
        perfStage("");
        const done = this.sequenceDone;
        this.sequenceDone = null;
        done?.();
      }
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.hiddenAt = performance.now();
    } else {
      // resume where it paused: no jump in the spin or the transition
      this.stageStart += performance.now() - this.hiddenAt;
      this.requestFrame();
    }
  };

  /**
   * 0–1: how far the zoom has got towards the view a tile layer was made for. The box is `factor` × the final frame, so the
   * frame is inside it from scale `finalScale / factor` on (with a 10 % margin for the sphere's distortion): the layer fades
   * in between there and `finalScale`.
   */
  private tileAlpha(view: View, t: TileLayer | null): number {
    if (!t) return 0;
    const from = (t.finalScale / t.factor) * 1.1;
    const x = Math.max(0, Math.min(1, (view.scale - from) / (t.finalScale - from)));
    return x * x * (3 - 2 * x);
  }

  private scratch: HTMLCanvasElement | null = null;
  private scratch2: HTMLCanvasElement | null = null;

  /** An offscreen canvas the size of the main one (a second one on request), for lines that are trimmed before they are drawn. */
  private scratchCanvas(second = false): HTMLCanvasElement {
    const s = second ? (this.scratch2 ??= document.createElement("canvas")) : (this.scratch ??= document.createElement("canvas"));
    if (s.width !== this.canvas.width || s.height !== this.canvas.height) {
      s.width = this.canvas.width;
      s.height = this.canvas.height;
    }
    return s;
  }

  /** Width of a crisp 1 px line in CSS px: a whole number of device pixels. */
  private hairline() {
    return Math.max(1, Math.floor(this.p!.dpr)) / this.p!.dpr;
  }

  private draw() {
    const p = this.p;
    const view = this.view;
    if (!p || !view) return;
    const t0 = performance.now();
    const lap = perfLaps("draw");
    const { ctx, style } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.clip.x, view.clip.y, view.clip.w, view.clip.h);
    ctx.clip();

    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.scale, 0, 2 * Math.PI);
    ctx.fillStyle = style.water;
    ctx.fill();

    // first frame with data: look up the dots of the idle globe at once, then pop them in
    let intro = 1;
    if (this.dots && !this.reducedMotion) {
      if (this.introStart === null) {
        for (const _ of this.dots.warm(view, style.dots, Infinity)) void _;
        this.introStart = performance.now();
      }
      intro = Math.min(1, (performance.now() - this.introStart) / style.introMs);
    }
    const selected = this.selected && this.dots ? this.dots.countryNumber(this.selected.id) : -1;
    // zoomed into a country: the other countries get a solid fill instead of dots
    const zoomedIn = Math.max(0, Math.min(1, (zoomLevel(view, style.dots) - style.fillFade[0]) / (style.fillFade[1] - style.fillFade[0])));
    const fill = this.selected ? Math.max(zoomedIn, this.blue) : 0;
    if (fill > 0) {
      ctx.globalAlpha = fill;
      ctx.fillStyle = style.otherFill;
      for (const [id, pieces] of this.countryPieces) if (id !== this.selected!.id) fillPieces(ctx, pieces, view);
      // the neighbours' coarse outlines reach over the selected country's coast (Zeeland, the estuaries): it stays white on top
      ctx.fillStyle = style.water;
      fillPieces(ctx, this.selectedFill, view);
      ctx.globalAlpha = 1;
    }
    // a city selected: everything but the city is filled (and it stays filled once a plot is chosen)
    const cityMode = Math.max(this.cityBlue, this.plotBlue);
    if (this.selected && cityMode > 0 && this.cityGeometry) {
      ctx.globalAlpha = cityMode;
      ctx.fillStyle = style.otherFill;
      fillPieces(ctx, this.selectedFill, view);
      ctx.globalAlpha = 1;
    }
    // the map tiles fade in as the frame gets inside them (the country's, then the city's over them): the city's fill the
    // frame with land (Background), both paint water white
    const aCountry = this.tileAlpha(view, this.countryTiles);
    const aCity = this.tileAlpha(view, this.tiles);
    // the country's water bodies would show as white holes in the grey fill the moment a city is chosen (the blue fades out
    // and they are suddenly the only thing that is not grey): they come back with the zoom, together with the city's own
    const aCountryWater = aCountry * (1 - cityMode * (1 - aCity));
    for (const [layer, a, aWater] of [[this.countryTiles, aCountry, aCountryWater], [this.tiles, aCity, aCity]] as const) {
      if (!layer || a <= 0) continue;
      if (layer.land) {
        ctx.globalAlpha = a;
        ctx.fillStyle = style.otherFill;
        ctx.fillRect(view.clip.x, view.clip.y, view.clip.w, view.clip.h);
      }
      ctx.globalAlpha = aWater;
      ctx.fillStyle = style.water;
      fillPieces(ctx, layer.water, view);
    }
    ctx.globalAlpha = 1;
    if (this.selected && this.cityBlue > 0 && this.cityGeometry) {
      ctx.globalAlpha = this.cityBlue;
      ctx.fillStyle = style.water;
      fillPieces(ctx, this.cityPieces, view);
      ctx.globalAlpha = 1;
    }
    // the plot: the parcel is white, the buildings around it (the footprints the 3D model is built from) are outlined
    const plot = this.plot;
    const aBuildings = plot ? this.buildingAlpha(view, plot) : 0;
    if (plot && this.plotBlue > 0) {
      ctx.globalAlpha = this.plotBlue;
      ctx.fillStyle = style.water;
      fillPieces(ctx, plot.parcel, view);
    }
    if (plot && aBuildings > 0) {
      // BGT roads and water under the buildings
      ctx.globalAlpha = aBuildings;
      ctx.fillStyle = style.plot.roadFill;
      fillPieces(ctx, plot.ground.road, view, 128);
      ctx.fillStyle = style.plot.waterFill;
      fillPieces(ctx, plot.ground.water, view, 128);
    }
    if (plot && aBuildings > 0) {
      ctx.globalAlpha = aBuildings;
      ctx.fillStyle = style.water;
      fillPieces(ctx, plot.buildings, view, 128);
    }
    ctx.globalAlpha = 1;
    lap("fills");
    const tilesGone = 1 - Math.max(aCountry, aCity);
    if (this.plotBlue < 1) {
      this.dots?.draw(ctx, view, style.dots, selected, {
        otherAlpha: 1 - fill,
        blue: this.blue,
        inside: this.cityInside ?? undefined,
        outsideAlpha: 1 - cityMode,
        reveal: intro,
        alpha: 1 - this.plotBlue,
      });
    }
    if (plot?.local && this.plotBlue > 0) this.drawPlotDots(view, plot.local, this.plotBlue);
    lap("dots");

    // coastlines always, simplified on the whole globe; country borders always or only once zoomed in
    const zoom = zoomLevel(view, style.dots);
    const ramp = ([z0, z1]: [number, number]) => Math.max(0, Math.min(1, (zoom - z0) / (z1 - z0)));
    const detail = ramp(style.coastDetailFade);
    const borders = style.idleBorders ? 1 : ramp(style.bordersFade);
    // once the map tiles are in, the blue outline is those very grey lines (the part within a few px of the country's or
    // city's polygon, recoloured) and the polygon's own outline fades out: one source, so nothing can run beside them
    const countryMix = aCountry * (1 - aCity);
    const outlines: [Piece[], number][] = [];
    if (this.selected && this.blue > 0 && countryMix > 0) outlines.push([this.selectedPieces, this.blue]);
    if (this.cityBlue > 0 && aCity > 0) outlines.push([this.cityPieces, this.cityBlue]);
    ctx.lineWidth = this.hairline();
    const drawGrey = (c: CanvasRenderingContext2D) => {
      c.lineWidth = this.hairline();
      c.strokeStyle = style.border;
      for (const [pieces, alpha] of [
        [this.coarseCoastPieces, 1 - detail],
        [this.coastPieces, detail * tilesGone],
        [this.borderPieces, borders * tilesGone],
      ] as const) {
        if (alpha <= 0) continue;
        c.globalAlpha = alpha;
        strokePieces(c, pieces, view, style.minLoopPx);
      }
      // water outlines and borders of the tiles replace the 50m lines (the city's own outline, with its water cut out, is
      // drawn blue on top); the country's give way to the city's as these fade in
      c.strokeStyle = style.border;
      for (const [layer, a] of [[this.countryTiles, aCountry * (1 - aCity)], [this.tiles, aCity]] as const) {
        if (!layer || a <= 0) continue;
        c.globalAlpha = a;
        strokePieces(c, layer.shore, view, 0, 128);
        strokePieces(c, layer.borders, view, 0, 128);
      }
      c.globalAlpha = 1;
    };
    const scratch = outlines.length ? this.scratchCanvas() : null;
    if (scratch) {
      const sc = scratch.getContext("2d")!;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, scratch.width, scratch.height);
      sc.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
      drawGrey(sc);
      sc.globalCompositeOperation = "source-atop";
      sc.strokeStyle = style.selectedBorder;
      sc.lineWidth = 12;
      for (const [pieces, a] of outlines) {
        sc.globalAlpha = a;
        strokePieces(sc, pieces, view);
      }
      sc.globalAlpha = 1;
      sc.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
    } else drawGrey(ctx);
    lap(scratch ? "linesScratch" : "lines");
    ctx.globalAlpha = 1;
    if (plot && aBuildings > 0) {
      ctx.globalAlpha = aBuildings;
      for (const [pieces, colour] of [
        [plot.ground.road, style.plot.roadLine],
        [plot.ground.water, style.plot.waterLine],
      ] as const) {
        ctx.strokeStyle = colour;
        strokePieces(ctx, pieces, view, 0, 128);
      }
      ctx.strokeStyle = style.plot.waterLine;
      strokePieces(ctx, plot.buildings, view, 0, 128);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.selectedBorder;
    if (plot && this.plotBlue > 0) {
      ctx.globalAlpha = this.plotBlue;
      strokePieces(ctx, plot.parcel, view);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = this.hairline();
    // the polygon outlines stay, but not where a tile line (recoloured blue above) runs within the band: one line there, and
    // no gap where the tiles have no line along the boundary
    const polygonOutline = (pieces: Piece[], alpha: number, mix: number, layer: TileLayer | null) => {
      if (mix <= 0 || !layer) {
        ctx.globalAlpha = alpha;
        strokePieces(ctx, pieces, view);
        return;
      }
      const sc = this.scratchCanvas(true).getContext("2d")!;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, sc.canvas.width, sc.canvas.height);
      sc.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
      sc.lineWidth = this.hairline();
      sc.strokeStyle = style.selectedBorder;
      sc.globalAlpha = alpha;
      strokePieces(sc, pieces, view);
      sc.globalCompositeOperation = "destination-out";
      sc.strokeStyle = "#000";
      sc.lineWidth = 12;
      sc.globalAlpha = mix;
      strokePieces(sc, layer.shore, view, 0, 128);
      strokePieces(sc, layer.borders, view, 0, 128);
      sc.globalCompositeOperation = "source-over";
      sc.globalAlpha = 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(sc.canvas, 0, 0);
      ctx.restore();
    };
    if (this.selected && this.blue > 0) polygonOutline(this.selectedPieces, this.blue, countryMix, this.countryTiles);
    if (this.cityBlue > 0) polygonOutline(this.cityPieces, this.cityBlue, aCity, this.tiles);
    lap("plotAndOutline");
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.scale, 0, 2 * Math.PI);
    ctx.strokeStyle = style.outline;
    ctx.stroke();

    // zoomed in: the frame's edges blur to white, inwards
    const [v0, v1] = style.vignetteFade;
    const vig = Math.max(0, Math.min(1, (zoom - v0) / (v1 - v0)));
    if (vig > 0) this.vignette(view.clip, style.vignetteWidth, vig);
    ctx.restore();
    lap("vignette");
    this.frameMs = performance.now() - t0;
    perfDraw("globe", this.frameMs);
  }

  /** Buildings fade in over the last three doublings of the zoom to the plot (before that they are specks). */
  private buildingAlpha(view: View, plot: PlotLayer): number {
    const x = (Math.log2(view.scale / plot.finalScale) + 3) / 2.5;
    return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  }

  /**
   * Blue dots over the parcel, fixed to the ground: a staggered lattice in metres whose spacing stays between 1× and 2×
   * the nominal screen spacing, the finer level fading in at the end of each doubling (as the globe's lattice does).
   */
  private drawPlotDots(view: View, parcel: LocalParcel, alpha: number) {
    const { ctx, style } = this;
    const { level, fade } = plotLevel(view.scale / EARTH_R, style.dots.spacingPx);
    const { coarse, fine } = plotDots(parcel, level, fade > 0.01);
    const b = basisFor(view);
    const r = style.dots.radiusPx;
    ctx.fillStyle = style.dots.selectedColour;
    for (const [dots, a] of [[coarse, alpha], [fine, alpha * fade]] as const) {
      if (!dots.length || a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i < dots.length; i += 2) {
        const [lon, lat] = toLonLat(parcel.local, dots[i]!, dots[i + 1]!);
        const [x, y, z] = toVec(lon, lat);
        const sx = b.cx + b.s * (b.e[0] * x + b.e[1] * y + b.e[2] * z);
        const sy = b.cy - b.s * (b.n[0] * x + b.n[1] * y + b.n[2] * z);
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, 2 * Math.PI);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** White (the white token) gradient along each inner edge of the frame, `width` px deep, at opacity `alpha` at the edge. */
  private vignette(r: Rect, width: number, alpha: number) {
    const ctx = this.ctx;
    const w = Math.min(width, r.w / 2, r.h / 2);
    const edges: [number, number, number, number, number, number, number, number][] = [
      [r.x, r.y, r.x, r.y + w, r.x, r.y, r.w, w],
      [r.x, r.y + r.h, r.x, r.y + r.h - w, r.x, r.y + r.h - w, r.w, w],
      [r.x, r.y, r.x + w, r.y, r.x, r.y, w, r.h],
      [r.x + r.w, r.y, r.x + r.w - w, r.y, r.x + r.w - w, r.y, w, r.h],
    ];
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      // eased falloff (quadratic) so the blur has no visible start line
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        grad.addColorStop(t, `rgba(255,255,255,${(alpha * (1 - t) * (1 - t)).toFixed(4)})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rw, rh);
    }
  }
}

/**
 * Outlines of polygons as lines, without the segments that run along the outer edge of the data (the merged tiles'
 * buffer edge in the sea, which is no shore): a segment whose two ends share the extreme lon or lat of all the points.
 */
function outlineChains(polys: Position[][][]): Position[][] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const rings of polys)
    for (const ring of rings)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x!);
        maxX = Math.max(maxX, x!);
        minY = Math.min(minY, y!);
        maxY = Math.max(maxY, y!);
      }
  const onEdge = (a: Position, b: Position) =>
    (a[0] === b[0] && (a[0] === minX || a[0] === maxX)) || (a[1] === b[1] && (a[1] === minY || a[1] === maxY));
  const chains: Position[][] = [];
  for (const rings of polys) {
    for (const ring of rings) {
      let cur: Position[] = [];
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!;
        const b = ring[i]!;
        if (onEdge(a, b)) {
          if (cur.length > 1) chains.push(cur);
          cur = [];
        } else {
          if (!cur.length) cur.push(a);
          cur.push(b);
        }
      }
      if (cur.length > 1) chains.push(cur);
    }
  }
  return chains;
}

/**
 * The parts of the lines that are not in water: every segment is sampled every `step` degrees (about 4 px at the final
 * frame, at most 400 samples) and the runs of dry samples are kept, ends placed on the sample next to the water.
 */
function clipToLand(lines: [number, number][][], inWater: (lon: number, lat: number) => boolean, step: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (const line of lines) {
    let cur: [number, number][] = [];
    const flush = () => {
      if (cur.length > 1) out.push(cur);
      cur = [];
    };
    for (let i = 0; i < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1];
      const n = b ? Math.max(1, Math.min(400, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))) : 1;
      for (let k = 0; k < n; k++) {
        const p: [number, number] = b ? [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] : a;
        if (inWater(p[0], p[1])) flush();
        else cur.push(p);
      }
    }
    flush();
  }
  return out;
}
