import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import arrowUrl from "./assets/arrow.svg";
import { SUGGEST_ROWS, boxStyle, type Grid, type LandingLayout } from "./grid";
import { useLandingStore } from "./landingStore";
import { ShuffleText, useShuffledString, type TextPart } from "./ShuffleText";
import { fetchAddressSuggestions, fetchBoundary, fetchPlot, loadCities, shortAddress, type AddressSuggestion, type Cities } from "./geoApi";
import type { PlotData } from "./globe/plotLayer";
import { loadWorld, type World } from "./world";

/** Gap between the label's 12 px line box and the field's top border. */
const LABEL_GAP = 4;
const LABEL_LINE = 12;

/** The pause after the last key before asking the server. */
const SUGGEST_DELAY_MS = 120;

/** The plot field's text: parcel number and area (read-only). Empty until the parcel has arrived. */
export function plotText(plot: PlotData | null): string {
  if (!plot) return "";
  if (!plot.parcel) return "Plot # unknown";
  const number = plot.parcel.id.split(" ").pop() || "unknown";
  const area = plot.parcel.areaM2;
  return `Plot #${number} · ${area === null ? "area unknown" : `${Math.round(area).toLocaleString("en-US")} m²`}`;
}

/** Label, field (with ghost completion) and arrow button of the input band: country, city, then address step. */
export function CountryInput({ grid, layout }: { grid: Grid; layout: LandingLayout }) {
  const step = useLandingStore((s) => s.step);
  const phase = useLandingStore((s) => s.phase);
  const resolving = useLandingStore((s) => s.resolving);
  const widen = useLandingStore((s) => s.widen);
  const country = useLandingStore((s) => s.country);
  const city = useLandingStore((s) => s.city);
  const selectCountry = useLandingStore((s) => s.selectCountry);
  const selectCity = useLandingStore((s) => s.selectCity);
  const address = useLandingStore((s) => s.address);
  const selectAddress = useLandingStore((s) => s.selectAddress);
  const back = useLandingStore((s) => s.back);
  const plot = useLandingStore((s) => s.plot);
  const openPanel = useLandingStore((s) => s.openPanel);
  const panelOpen = useLandingStore((s) => s.panelOpen);
  const [value, setValue] = useState("");
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [cities, setCities] = useState<Cities | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  // the suggestion put into the field by picking it; it only counts while the field still shows its text
  const [chosen, setChosen] = useState<AddressSuggestion | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void loadWorld().then((w) => live && setWorld(w));
    return () => {
      live = false;
    };
  }, []);

  const countryStep = step === "country";
  const cityStep = step === "city";
  const addressStep = step === "address";
  // plots (parcels, buildings) come from Dutch open data: the address step works in the Netherlands only for now
  const addressSupported = city?.cc === "NL";
  // the field takes input on the country step, and on the city / address step once the globe has landed
  const enabled = countryStep || (cityStep && phase === "country") || (addressStep && phase === "city" && addressSupported);

  // the city list of the chosen country (the file is small and local)
  const cc = country?.alpha2 ?? null;
  useEffect(() => {
    setCities(null);
    if (!cc) return;
    let live = true;
    loadCities(cc).then(
      (c) => live && setCities(c),
      () => live && setCities({ rows: [], entries: [], matcher: world!.matcher }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc]);

  // a new step (country chosen, city chosen, back to the start): empty field
  useEffect(() => {
    setValue("");
    setNoMatch(null);
    setSuggestions([]);
    setActive(-1);
    setChosen(null);
  }, [step]);

  // address suggestions: asked for after a short pause in typing, inside the municipality of the chosen city; an answer to an
  // older text is dropped, and the list stays while the next one loads
  const cityLat = city?.lat;
  const cityLon = city?.lon;
  useEffect(() => {
    if (!addressStep || !enabled || value.trim().length < 2 || cityLat === undefined || cityLon === undefined || (chosen && value === shortAddress(chosen.label))) {
      setSuggestions([]);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetchAddressSuggestions(value.trim(), cityLat, cityLon, ctl.signal).then(
        (items) => {
          setSuggestions(items.slice(0, SUGGEST_ROWS));
          setActive(-1);
        },
        () => undefined,
      );
    }, SUGGEST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [addressStep, enabled, value, cityLat, cityLon, chosen]);
  useEffect(() => {
    if (enabled) input.current?.focus();
  }, [enabled]);

  const matcher = countryStep ? world?.matcher : cityStep ? cities?.matcher : undefined;
  const suggestion = enabled && matcher ? matcher.suggest(value) : null;
  // address step: the highlighted (else the first) suggestion; its text completes what is typed, else it shows as "→ name"
  const locked = addressStep && !!chosen && value === shortAddress(chosen.label);
  const picked = addressStep && enabled && !locked ? (suggestions[active] ?? suggestions[0] ?? null) : null;
  // the likely next step is asked for ahead (geoApi shares the request with the globe's own): the boundary of the city the
  // typed name points at, the plot of a picked or highlighted address; both after a short pause, so typing does not fire requests
  const likelyCity = cityStep && enabled && cities ? (cities.matcher.match(value)?.entry ?? suggestion?.entry ?? null) : null;
  const cityRow = likelyCity ? cities?.rows[Number(likelyCity.id)] : undefined;
  useEffect(() => {
    if (!cityRow || !cc) return;
    const id = setTimeout(() => void fetchBoundary(cityRow, cc).catch(() => undefined), 300);
    return () => clearTimeout(id);
  }, [cityRow, cc]);
  const plotAhead = addressStep && enabled ? (locked ? chosen : (suggestions[active] ?? null)) : null;
  const plotAheadId = plotAhead?.id ?? null;
  useEffect(() => {
    if (!plotAheadId) return;
    const id = setTimeout(() => void fetchPlot(plotAheadId).catch(() => undefined), 300);
    return () => clearTimeout(id);
  }, [plotAheadId]);

  const pickedText = picked ? shortAddress(picked.label) : "";
  const completes = !!picked && value.length > 0 && pickedText.toLowerCase().startsWith(value.toLowerCase());
  const ghost = picked
    ? completes
      ? pickedText.slice(value.length)
      : `  → ${pickedText}`
    : suggestion
      ? suggestion.kind === "complete"
        ? suggestion.rest
        : `  → ${suggestion.name}`
      : "";

  // the arrow stays grey until the text is something the field can take (the same test Enter uses)
  const plotStep = step === "plot";
  const acceptable = plotStep || !!(enabled && value.trim() && (addressStep ? locked || picked : matcher && (matcher.match(value) || suggestion)));

  /** Puts a suggestion into the field without proceeding. */
  const pickInto = (a: AddressSuggestion) => {
    setChosen(a);
    setValue(shortAddress(a.label));
    setSuggestions([]);
    setActive(-1);
    setNoMatch(null);
    input.current?.focus();
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    // plot step: the arrow opens the rules window right away, whether or not the parcel has arrived yet
    if (plotStep) return openPanel();
    if (!enabled || !value.trim()) return;
    if (addressStep) {
      // a highlighted suggestion is picked into the field first; the next Enter (or the arrow) proceeds
      if (!locked && active >= 0 && suggestions[active]) return pickInto(suggestions[active]!);
      const target = locked ? chosen : picked;
      if (!target) {
        setNoMatch(value.trim());
        input.current?.focus();
        return;
      }
      selectAddress({ id: target.id, label: target.label, lon: target.lon, lat: target.lat });
      return;
    }
    const m = countryStep ? (world ?? (await loadWorld())).matcher : cities?.matcher;
    if (!m) return;
    // the exact / alias / typo match first, else the best suggestion (the same one the ghost shows)
    const hit = m.match(value);
    const entry = hit?.entry ?? m.suggest(value)?.entry;
    if (!entry) {
      setNoMatch(value.trim());
      input.current?.focus();
      return;
    }
    // the label and the field switch (shuffle) right away; the label shows the proper name
    if (countryStep) {
      selectCountry({ id: entry.id, name: entry.name, alpha2: entry.alpha2 });
    } else if (cities && cc) {
      const row = cities.rows[Number(entry.id)];
      if (row) selectCity({ name: row.n, cc, lon: row.x, lat: row.y, population: row.p });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
    if (addressStep && suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = suggestions.length;
        setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
        return;
      }
      if (picked && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) {
        e.preventDefault();
        pickInto(picked);
        return;
      }
    }
    if (suggestion && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) {
      e.preventDefault();
      setValue(suggestion.kind === "complete" ? value + suggestion.rest : suggestion.name);
      setNoMatch(null);
    }
  };

  // the label's text, in parts so that the accent colour survives the shuffle effect
  const labelParts: TextPart[] =
    step === "plot" && address
      ? [{ text: [shortAddress(address.label), city?.name, city?.cc].filter(Boolean).join(", "), className: "accent" }]
      : step === "address" && city && !addressSupported
        ? [{ text: "Plots work in the " }, { text: "Netherlands only", className: "accent" }, { text: " for now" }]
        : step === "address" && city && noMatch === null
          ? [{ text: "Where in " }, { text: `${city.name}, ${city.cc}?`, className: "accent" }]
      : !countryStep && country && noMatch === null
        ? [{ text: "Where in " }, { text: `${country.name}?`, className: "accent" }]
      : noMatch === null
        ? [{ text: "Where on " }, { text: "earth?", className: "accent" }]
        : [{ text: `No match for "${noMatch}"` }];
  // while the camera flies the label and the placeholder keep scrambling; they become readable once it has fully zoomed in
  // (the last 0.4 s of the zoom already resolve it, so that it is readable the moment the camera stops)
  const flying = (phase === "toCountry" || phase === "toCity" || phase === "toPlot") && !resolving;
  const placeholder = useShuffledString(countryStep ? "[Country]" : cityStep ? "[City]" : plotStep ? "[Plot]" : "[Address]", true, flying);

  // the bar is two cells wider for the address (it starts to grow just before the final pass of the text animation, so the label resolves in the widened bar): one cell more on each side, the button moves out
  const wide = step === "plot" || (step === "address" && (phase === "city" || phase === "backToCity" || widen || resolving));
  const f = wide ? { ...layout.field, c0: layout.field.c0 - 1, c1: layout.field.c1 + 1 } : layout.field;
  const field = boxStyle(grid, f);
  // the list hangs from the field's bottom line, as wide as the field, one grid row per suggestion
  const listBox = boxStyle(grid, { c0: f.c0, c1: f.c1, r0: f.r1, r1: f.r1 + suggestions.length });
  const button = boxStyle(grid, wide ? { ...layout.button, c0: layout.button.c0 + 1, c1: layout.button.c1 + 1 } : layout.button);
  // the back arrow sits one cell left of the field and moves with it; it fades in with the bar's expansion
  // (once the camera has landed, or at the widen / resolve cues just before)
  const backShown = !countryStep && (widen || resolving || (phase !== "toCountry" && phase !== "toCity" && phase !== "toPlot"));
  const backCanClick = phase === "country" || phase === "city" || phase === "plot";
  const backBox = boxStyle(grid, { ...layout.button, c0: f.c0 - 1, c1: f.c0 });
  const labelStyle: CSSProperties = {
    left: field.left,
    top: field.top - LABEL_GAP - LABEL_LINE,
    height: LABEL_LINE,
    whiteSpace: "pre",
  };

  // the rules window is open: the whole bottom section of the globe window is gone, the map has the full height
  if (panelOpen) return null;

  return (
    <form onSubmit={submit} style={{ display: "contents" }}>
      <label className="box t-semimono t-label" htmlFor="landing-input" style={labelStyle} aria-live="polite">
        <ShuffleText parts={labelParts} scrambling={flying} />
      </label>
      <div className={`box field${plotStep ? " found" : ""}`} style={field}>
        {plotStep ? (
          <div className="found-row t-semimono t-input">
            <span className="found-label">
              <ShuffleText parts={[{ text: "Found:" }]} scrambling={flying} />
            </span>
            {/* the plot chip comes in (shuffling) once "Found:" is legible */}
            {plot && !flying && (
              <span className="chip">
                <ShuffleText parts={[{ text: plotText(plot) }]} />
              </span>
            )}
          </div>
        ) : (
        <input
          id="landing-input"
          ref={input}
          className="t-semimono t-input"
          value={plotStep ? plotText(plot) : value}
          readOnly={plotStep}
          placeholder={placeholder}
          disabled={!enabled && !plotStep}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          onChange={(e) => {
            // first letter always a capital
            const v = e.target.value;
            setValue(v.charAt(0).toUpperCase() + v.slice(1));
            setNoMatch(null);
          }}
          onKeyDown={onKeyDown}
        />
        )}
        {ghost && (
          <div className="ghost t-semimono t-input" aria-hidden>
            <span className="typed">{value}</span>
            <span className="rest">{ghost}</span>
          </div>
        )}
      </div>
      {addressStep && enabled && suggestions.length > 0 && (
        <ul
          className="box suggest t-semimono t-input"
          role="listbox"
          aria-label="Address suggestions"
          style={{ left: listBox.left, width: listBox.width, height: listBox.height - 1, top: listBox.top + 1 }}
        >
          {suggestions.map((a, i) => (
            <li
              key={a.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : undefined}
              style={{ height: grid.cell, lineHeight: `${grid.cell}px` }}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: the field must not lose focus before the choice is made
              onMouseDown={(e) => {
                e.preventDefault();
                pickInto(a);
              }}
            >
              {shortAddress(a.label)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`box back${backShown ? " shown" : ""}`} style={backBox} disabled={!backShown || !backCanClick} aria-hidden={!backShown} aria-label="Back" onClick={back}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ display: "block", transform: "scaleX(-1)" }}>
          <path d="M3.33333 8H12.6667" stroke="var(--stroke)" strokeLinejoin="round" />
          <path d="M8 3.33333L12.6667 8L8 12.6667" stroke="var(--stroke)" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="submit" className={`box go${acceptable ? " ready" : ""}`} style={button} disabled={!enabled && !plotStep} aria-label="Go">
        <img src={arrowUrl} alt="" />
      </button>
    </form>
  );
}
