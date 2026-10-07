import { useState, type CSSProperties } from "react";
import {
  CONSTRAINT_FIELDS,
  formatValue,
  getField,
  polygonWithHolesArea,
  type ConstraintField,
  type Constrained,
  type Envelope,
} from "@massing/shared";
import { useConstraints, useEnvelope, useSiteStore } from "../state/siteStore";
import { ExtractRulesPanel } from "./AiPanels";
import { panel } from "./panel";

type Badge = "verified" | "extracted" | "assumed" | "user_override" | "unknown";

const BADGE_COLOURS: Record<Badge, { bg: string; fg: string }> = {
  verified: { bg: "#d6efd9", fg: "#185c26" },
  extracted: { bg: "#d8e6f7", fg: "#1d4a80" },
  assumed: { bg: "#fbe7b5", fg: "#7a5300" },
  user_override: { bg: "#e8dcf5", fg: "#53287f" },
  unknown: { bg: "#e4e4e4", fg: "#555" },
};

/** Status shown for a value: null always reads as unknown, whatever its provenance. */
const badgeOf = (c: Constrained<unknown> | undefined): Badge => (!c || c.value === null ? "unknown" : c.prov.status);

function StatusBadge({ badge }: { badge: Badge }) {
  const { bg, fg } = BADGE_COLOURS[badge];
  return (
    <span style={{ background: bg, color: fg, padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>
      {badge.replace("_", " ")}
    </span>
  );
}

/** Field-specific input checks; null = valid. */
function validate(field: ConstraintField, value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a number";
  if (field.path === "streetSide") return value < 0 || value >= 360 ? "0–359°" : null;
  if (value < 0) return "Must be ≥ 0";
  if (field.path === "maxCoverage" && value > 1) return "0–1 (60 % = 0.6)";
  return null;
}

function OverrideCell({ field, overridden }: { field: ConstraintField; overridden: boolean }) {
  const { setOverride, clearOverride } = useSiteStore();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editable = field.kind === "number" || field.kind === "list";

  const apply = () => {
    if (field.kind === "list") {
      const items = text.split(",").map((s) => s.trim()).filter(Boolean);
      if (!items.length) return setError("Enter values, comma-separated");
      setOverride(field.path, items);
    } else {
      const value = Number(text.replace(",", "."));
      const problem = text.trim() === "" ? "Enter a number" : validate(field, value);
      if (problem) return setError(problem);
      setOverride(field.path, value);
    }
    setError(null);
    setText("");
  };

  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
      {editable && (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder={field.kind === "list" ? "a, b" : field.unit ?? "value"}
            aria-label={`Override ${field.label}`}
            style={{ width: 56, fontFamily: "inherit", fontSize: 11 }}
          />
          <button onClick={apply} style={btn}>
            Set
          </button>
        </>
      )}
      <button onClick={() => setOverride(field.path, null)} style={btn} title="Mark this value as unknown">
        Unknown
      </button>
      {overridden && (
        <button onClick={() => clearOverride(field.path)} style={btn} title="Back to the fixture value">
          Reset
        </button>
      )}
      {error && <span style={{ color: "#b00020", width: "100%" }}>{error}</span>}
    </div>
  );
}

const btn: CSSProperties = { fontFamily: "inherit", fontSize: 11, padding: "0 4px" };
const cell: CSSProperties = { padding: "4px 6px", borderTop: "1px solid #ddd", verticalAlign: "top" };

function EnvelopeSummary({ envelope }: { envelope: Envelope }) {
  const rings = envelope.footprint.coordinates;
  const area = rings.length ? polygonWithHolesArea(rings) : 0;
  return (
    <div style={{ marginTop: 10, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700 }}>Buildable envelope</div>
      <div>
        From <b>{envelope.source}</b> · footprint {Math.round(area)} m² · max height{" "}
        {envelope.maxHeight === null ? "unknown" : `${envelope.maxHeight} m`} · <StatusBadge badge={envelope.prov.status} />
      </div>
      <div style={{ opacity: 0.7 }}>{envelope.prov.source}</div>
      {envelope.notes.map((n) => (
        <div key={n}>· {n}</div>
      ))}
    </div>
  );
}

/** Screen 2: rules with provenance, status badges and overrides; envelope ghost in the viewer (SPEC §9). */
export function ConstraintsScreen() {
  const scene = useSiteStore((s) => s.scene);
  const overrides = useSiteStore((s) => s.overrides);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const constraints = useConstraints();
  const envelope = useEnvelope();
  if (!scene || !constraints) return null;

  const fixtureId = scene.zoning?.fixtureId ?? null;

  return (
    <div
      style={{
        ...panel,
        right: 12,
        top: 48,
        bottom: 12,
        width: 600,
        maxWidth: "calc(100% - 24px)",
        overflowY: "auto",
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Constraints · parcel {scene.parcel.id}</div>
        <label>
          <input type="checkbox" checked={showEnvelope} onChange={(e) => setShowEnvelope(e.target.checked)} /> Show envelope
        </label>
      </div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {fixtureId ? `Site fixture: data/sites/${fixtureId}.json` : "No site fixture for this parcel: every rule is unknown."}{" "}
        Indicative only, not a permit check.
      </div>

      <ExtractRulesPanel />

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={cell}>Rule</th>
            <th style={cell}>Value</th>
            <th style={cell}>Source / quote</th>
            <th style={cell}>Status</th>
            <th style={cell}>Override</th>
          </tr>
        </thead>
        <tbody>
          {CONSTRAINT_FIELDS.map((field) => {
            const c = getField(constraints, field.path);
            return (
              <tr key={field.path}>
                <td style={cell}>
                  <div>{field.label}</div>
                  {field.term && <div style={{ opacity: 0.6, fontStyle: "italic" }}>{field.term}</div>}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatValue(field, c?.value)}</td>
                <td style={{ ...cell, maxWidth: 200 }}>
                  <div>{c?.prov.source ?? "Not in the site fixture"}</div>
                  {c?.prov.quote && <div style={{ opacity: 0.7, fontStyle: "italic" }}>“{c.prov.quote}”</div>}
                </td>
                <td style={cell}>
                  <StatusBadge badge={badgeOf(c)} />
                </td>
                <td style={cell}>
                  <OverrideCell field={field} overridden={field.path in overrides} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {constraints.notes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Notes</div>
          {constraints.notes.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 2 }}>
              <StatusBadge badge={badgeOf(n)} />
              <span>
                {n.value ?? "unknown"} <span style={{ opacity: 0.6 }}>({n.prov.source})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {envelope && <EnvelopeSummary envelope={envelope} />}
    </div>
  );
}
