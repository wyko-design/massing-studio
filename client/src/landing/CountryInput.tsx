import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import arrowUrl from "./assets/arrow.svg";
import { boxStyle, type Grid, type LandingLayout } from "./grid";
import { useLandingStore } from "./landingStore";
import { ShuffleText, useShuffledString, type TextPart } from "./ShuffleText";
import { fetchAddressSuggestions, loadCities, type AddressSuggestion, type Cities } from "./geoApi";
import { loadWorld, type World } from "./world";

/** Gap between the label's 12 px line box and the field's top border. */
const LABEL_GAP = 4;
const LABEL_LINE = 12;

/** Rows in the suggestion list above the field, and the pause after the last key before asking the server. */
const LIST_ROWS = 6;
const ROW_H = 24;
const SUGGEST_DELAY_MS = 120;

/** Label, field (with ghost completion) and arrow button of the input band: country, city, then address step. */
export function CountryInput({ grid, layout }: { grid: Grid; layout: LandingLayout }) {
  const step = useLandingStore((s) => s.step);
  const phase = useLandingStore((s) => s.phase);
  const resolving = useLandingStore((s) => s.resolving);
  const country = useLandingStore((s) => s.country);
  const city = useLandingStore((s) => s.city);
  const selectCountry = useLandingStore((s) => s.selectCountry);
  const selectCity = useLandingStore((s) => s.selectCity);
  const address = useLandingStore((s) => s.address);
  const selectAddress = useLandingStore((s) => s.selectAddress);
  const [value, setValue] = useState("");
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [cities, setCities] = useState<Cities | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
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
  }, [step]);

  // address suggestions: asked for after a short pause in typing, inside the municipality of the chosen city; an answer to an
  // older text is dropped, and the list stays while the next one loads
  const cityLat = city?.lat;
  const cityLon = city?.lon;
  useEffect(() => {
    if (!addressStep || !enabled || value.trim().length < 2 || cityLat === undefined || cityLon === undefined) {
      setSuggestions([]);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetchAddressSuggestions(value.trim(), cityLat, cityLon, ctl.signal).then(
        (items) => {
          setSuggestions(items.slice(0, LIST_ROWS));
          setActive(-1);
        },
        () => undefined,
      );
    }, SUGGEST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [addressStep, enabled, value, cityLat, cityLon]);
  useEffect(() => {
    if (enabled) input.current?.focus();
  }, [enabled]);

  const matcher = countryStep ? world?.matcher : cityStep ? cities?.matcher : undefined;
  const suggestion = enabled && matcher ? matcher.suggest(value) : null;
  // address step: the highlighted (else the first) suggestion; its text completes what is typed, else it shows as "→ name"
  const picked = addressStep && enabled ? (suggestions[active] ?? suggestions[0] ?? null) : null;
  const completes = !!picked && value.length > 0 && picked.label.toLowerCase().startsWith(value.toLowerCase());
  const ghost = picked
    ? completes
      ? picked.label.slice(value.length)
      : `  → ${picked.label}`
    : suggestion
      ? suggestion.kind === "complete"
        ? suggestion.rest
        : `  → ${suggestion.name}`
      : "";

  // the arrow stays grey until the text is something the field can take (the same test Enter uses)
  const acceptable = !!(enabled && value.trim() && (addressStep ? picked : matcher && (matcher.match(value) || suggestion)));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!enabled || !value.trim()) return;
    if (addressStep) {
      if (!picked) {
        setNoMatch(value.trim());
        input.current?.focus();
        return;
      }
      selectAddress({ id: picked.id, label: picked.label, lon: picked.lon, lat: picked.lat });
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
        setValue(picked.label);
        setNoMatch(null);
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
      ? [{ text: "Plot at " }, { text: address.label, className: "accent" }]
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
  const placeholder = useShuffledString(countryStep ? "[Country]" : cityStep ? "[City]" : "[Address]", true, flying);

  const field = boxStyle(grid, layout.field);
  const listBox = boxStyle(grid, { ...layout.field, c0: layout.field.c0 - 1, c1: layout.button.c1 + 1 });
  const listH = suggestions.length * ROW_H + 2;
  const button = boxStyle(grid, layout.button);
  const labelStyle: CSSProperties = {
    left: field.left,
    top: field.top - LABEL_GAP - LABEL_LINE,
    height: LABEL_LINE,
    whiteSpace: "pre",
  };

  return (
    <form onSubmit={submit} style={{ display: "contents" }}>
      <label className="box t-semimono t-label" htmlFor="landing-input" style={labelStyle} aria-live="polite">
        <ShuffleText parts={labelParts} scrambling={flying} />
      </label>
      <div className="box field" style={field}>
        <input
          id="landing-input"
          ref={input}
          className="t-semimono t-input"
          value={value}
          placeholder={placeholder}
          disabled={!enabled}
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
          style={{ left: listBox.left, width: listBox.width, height: listH, top: field.top - LABEL_GAP - LABEL_LINE - 6 - listH }}
        >
          {suggestions.map((a, i) => (
            <li
              key={a.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : undefined}
              style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: the field must not lose focus before the choice is made
              onMouseDown={(e) => {
                e.preventDefault();
                selectAddress({ id: a.id, label: a.label, lon: a.lon, lat: a.lat });
              }}
            >
              {a.label}
            </li>
          ))}
        </ul>
      )}
      <button type="submit" className={`box go${acceptable ? " ready" : ""}`} style={button} disabled={!enabled} aria-label="Go">
        <img src={arrowUrl} alt="" />
      </button>
    </form>
  );
}
