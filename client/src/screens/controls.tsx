import type { CSSProperties } from "react";

export const label: CSSProperties = { display: "grid", gridTemplateColumns: "92px 1fr 56px", gap: 6, alignItems: "center", margin: "3px 0" };
export const heading: CSSProperties = { margin: "10px 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.6 };

type SliderProps = { name: string; value: number; min: number; max: number; step: number; unit?: string; format?: (v: number) => string; onChange: (v: number) => void };

export function Slider({ name, value, min, max, step, unit = "", format, onChange }: SliderProps) {
  return (
    <label style={label}>
      <span>{name}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ textAlign: "right" }}>
        {format ? format(value) : value}
        {unit}
      </span>
    </label>
  );
}
