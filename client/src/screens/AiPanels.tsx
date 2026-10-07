import { useState, type CSSProperties, type ReactNode } from "react";
import { NO_EXTRACTED, PRIORITY_KEYS, TYPOLOGY_LABELS, fieldByPath, formatValue, getField, type OptionId, type PriorityKey } from "@massing/shared";
import { useAiStore, type Call } from "../state/aiStore";
import { useMassingStore } from "../state/massingStore";
import { useConstraints, useSiteStore } from "../state/siteStore";
import { Slider, heading } from "./controls";

const btn: CSSProperties = { fontFamily: "inherit", fontSize: 12 };
const SHORT: Record<PriorityKey, string> = { units: "Homes", daylight: "Daylight", lowProfile: "Low profile", openSpace: "Open space", simplicity: "Simplicity" };
const note: CSSProperties = { margin: "3px 0", opacity: 0.8 };

function Status({ call, doing }: { call: Call<unknown>; doing: string }) {
  if (call.status === "loading") return <div style={{ ...note, fontStyle: "italic" }}>{doing}… (sliders stay live)</div>;
  if (call.status === "error") return <div style={{ margin: "3px 0", color: "#b00020" }}>{call.error}</div>;
  if (call.status === "done" && call.cached) return <div style={{ ...note, opacity: 0.6 }}>Answer replayed from the offline cache.</div>;
  return null;
}

function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details style={{ margin: "4px 0" }}>
      <summary style={{ cursor: "pointer" }}>{summary}</summary>
      {children}
    </details>
  );
}

/** Brief text, "Interpret brief", priorities and "Generate directions": the only LLM triggers on this screen. */
export function BriefPanel() {
  const { brief, priorities, typologyHints, interpret, directions, setBrief, setPriority, interpretBrief, generateDirections } = useAiStore();
  const busy = directions.status === "loading";
  const r = interpret.result;
  return (
    <>
      <h4 style={{ ...heading, marginTop: 0 }}>Brief (AI)</h4>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="e.g. starter apartments, lots of daylight, keep it low towards the neighbours"
        rows={4}
        style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12, resize: "vertical" }}
      />
      <button onClick={() => void interpretBrief()} disabled={!brief.trim() || interpret.status === "loading"} style={btn}>
        Interpret brief
      </button>
      <Status call={interpret} doing="Reading the brief" />
      {r && (
        <div style={note}>
          <div>{r.summary}</div>
          {r.changes.length > 0 && (
            <Details summary={`Set from the brief (${r.changes.length})`}>
              {r.changes.map((c) => (
                <div key={c.field}>
                  {c.field}: “{c.briefQuote}”
                </div>
              ))}
            </Details>
          )}
          {r.unclear.length > 0 && (
            <Details summary={`Unclear (${r.unclear.length})`}>
              {r.unclear.map((u, i) => (
                <div key={i}>· {u}</div>
              ))}
            </Details>
          )}
          {r.clamps.map((c, i) => (
            <div key={i}>· {c}</div>
          ))}
        </div>
      )}

      <h4 style={heading}>Priorities (0–5, edit freely)</h4>
      {PRIORITY_KEYS.map((k) => (
        <Slider key={k} name={SHORT[k]} value={priorities[k]} min={0} max={5} step={1} onChange={(v) => setPriority(k, v)} />
      ))}
      {typologyHints.length > 0 && <div style={note}>Typology hints: {typologyHints.map((t) => TYPOLOGY_LABELS[t]).join(", ")}</div>}

      <button onClick={() => void generateDirections()} disabled={busy} style={{ ...btn, marginTop: 6, fontWeight: 700 }}>
        Generate directions
      </button>
      <Status call={directions} doing="Generating three directions" />
      {directions.result?.warnings.map((w, i) => (
        <div key={i} style={{ margin: "3px 0", color: "#7a5300" }}>
          ⚠ {w}
        </div>
      ))}
    </>
  );
}

/** The AI's idea behind an option tab: name, intent, trade-offs and the clamps applied when it was generated. */
export function DirectionCard({ id }: { id: OptionId }) {
  const direction = useAiStore((s) => s.directions.result?.options.find((o) => o.id === id) ?? null);
  const params = useMassingStore((s) => s.options[id]);
  const [open, setOpen] = useState(true);
  if (!direction) return null;
  const edited = (Object.keys(direction.params) as (keyof typeof params)[]).some((k) => direction.params[k] !== params[k]);
  return (
    <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #ddd" }}>
      <div style={{ fontWeight: 700 }}>
        {id} · {direction.name} <span style={{ fontWeight: 400, opacity: 0.6 }}>(AI direction)</span>
      </div>
      {edited && <div style={{ color: "#7a5300" }}>Sliders changed since it was generated.</div>}
      <div style={{ margin: "3px 0" }}>{direction.intent}</div>
      <button onClick={() => setOpen(!open)} style={{ ...btn, fontSize: 11 }}>
        {open ? "Hide" : "Show"} trade-offs
      </button>
      {open && (
        <>
          {direction.tradeOffs.map((t, i) => (
            <div key={i} style={note}>
              − {t}
            </div>
          ))}
          {direction.clamps.length > 0 && (
            <div style={{ ...note, marginTop: 4 }}>
              <i>When generated:</i>
              {direction.clamps.map((c, i) => (
                <div key={i}>· {c}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Constraints screen: "Extract rules" reads the site's plan excerpts and shows a diff before anything is applied. */
export function ExtractRulesPanel() {
  const { rules, extractRules, clearRules } = useAiStore();
  const constraints = useConstraints();
  const overrides = useSiteStore((s) => s.overrides);
  const extracted = useSiteStore((s) => s.extracted);
  const setExtracted = useSiteStore((s) => s.setExtracted);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const result = rules.result;
  const toggle = (key: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const apply = () => {
    if (!result) return;
    const fields = { ...extracted.fields };
    for (const f of result.fields) if (!skipped.has(f.path)) fields[f.path] = f.constrained;
    const notes = [...extracted.notes, ...result.notes.filter((_, i) => !skipped.has(`note.${i}`))];
    setExtracted({ fields, notes });
    setSkipped(new Set());
    clearRules();
  };
  const nExtracted = Object.keys(extracted.fields).length + extracted.notes.length;

  return (
    <div style={{ margin: "8px 0", padding: "6px 8px", border: "1px solid #ddd" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        <b>Extract rules (AI)</b>
        <button onClick={() => void extractRules()} disabled={rules.status === "loading"} style={btn}>
          Extract from plan excerpts
        </button>
        {nExtracted > 0 && (
          <button onClick={() => setExtracted(NO_EXTRACTED)} style={btn} title="Remove every accepted extracted value">
            Discard {nExtracted} extracted
          </button>
        )}
      </div>
      <Status call={rules} doing="Reading the plan text" />
      {result && constraints && (
        <>
          {result.fields.length === 0 && result.notes.length === 0 && <div style={note}>The excerpts state none of the rules this tool can use.</div>}
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 4 }}>
            <tbody>
              {result.fields.map((f) => {
                const field = fieldByPath(f.path);
                const now = getField(constraints, f.path);
                return (
                  <tr key={f.path} style={{ verticalAlign: "top" }}>
                    <td><input type="checkbox" checked={!skipped.has(f.path)} onChange={() => toggle(f.path)} aria-label={`Apply ${field.label}`} /></td>
                    <td style={{ padding: "2px 6px" }}>{field.label}</td>
                    <td style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>
                      <span style={{ opacity: 0.6 }}>{formatValue(field, now?.value)}</span> → <b>{formatValue(field, f.constrained.value)}</b>
                    </td>
                    <td style={{ padding: "2px 6px", opacity: 0.8 }}>
                      <i>“{f.constrained.prov.quote}”</i>
                      {f.path in overrides && <div style={{ color: "#7a5300" }}>You overrode this value; the override stays on top.</div>}
                    </td>
                  </tr>
                );
              })}
              {result.notes.map((n, i) => (
                <tr key={`note.${i}`} style={{ verticalAlign: "top" }}>
                  <td><input type="checkbox" checked={!skipped.has(`note.${i}`)} onChange={() => toggle(`note.${i}`)} aria-label="Add note" /></td>
                  <td style={{ padding: "2px 6px" }}>Note</td>
                  <td style={{ padding: "2px 6px" }}>{n.value}</td>
                  <td style={{ padding: "2px 6px", opacity: 0.8 }}><i>“{n.prov.quote}”</i></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={apply} style={{ ...btn, marginTop: 4 }}>Apply selected</button>{" "}
          <button onClick={clearRules} style={btn}>Dismiss</button>
        </>
      )}
    </div>
  );
}
