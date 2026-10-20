import { describe, expect, it } from "vitest";
import { unknownConstraints } from "./overrides";
import { applyParking, parkingNormFrom, rowFor, type ParkingPolicy, type ParkingRow } from "./parking";

const row = (label: string, fromM2: number | null, toM2: number | null, rest: [number, number], bin: [number, number], kind: ParkingRow["kind"] = "size"): ParkingRow => ({
  label,
  kind,
  fromM2,
  toM2,
  values: { rest: { residents: rest[0], visitors: rest[1] }, binnenstad: { residents: bin[0], visitors: bin[1] } },
});

const policy: ParkingPolicy = {
  municipality: "Delft",
  regulation: { title: "Beleidsregels Parkeernormen Delft 2023", id: "CVDR714401_1", date: "2024-01-26", url: "https://lokaleregelgeving.overheid.nl/CVDR714401/1" },
  zones: [
    { id: "binnenstad", label: "Binnenstad Delft", basis: "maximum" },
    { id: "rest", label: "Rest bebouwde kom Delft", basis: "norm" },
  ],
  rows: [
    row("Woning kleiner dan 50 m2 GO", null, 50, [0.2, 0.1], [0.1, 0.1]),
    row("Woning tussen 50 tot 75 m2 GO", 50, 75, [0.5, 0.1], [0.3, 0.1]),
    row("Woning groter dan 125 m2 GO", 125, null, [1, 0.1], [0.8, 0.1]),
    row("Zorgwoning", null, null, [0.1, 0.1], [0, 0.1], "care"),
  ],
  suggestedZone: { id: "rest", reason: "r" },
  notes: [],
  textUrl: "https://example.org/x.xml",
};

describe("rowFor", () => {
  it("picks the band by floor area, lower bound inclusive, upper exclusive", () => {
    expect(rowFor(policy, 30)!.label).toMatch(/kleiner dan 50/);
    expect(rowFor(policy, 49.9)!.label).toMatch(/kleiner dan 50/);
    expect(rowFor(policy, 50)!.label).toMatch(/tussen 50 tot 75/);
    expect(rowFor(policy, 74.9)!.label).toMatch(/tussen 50 tot 75/);
    expect(rowFor(policy, 200)!.label).toMatch(/groter dan 125/);
  });

  it("has no band for a size the table leaves out, and never picks a care row", () => {
    expect(rowFor(policy, 75)).toBeNull();
    expect(rowFor({ ...policy, rows: [policy.rows[3]!] }, 60)).toBeNull();
  });
});

describe("parkingNormFrom", () => {
  it("adds residents and visitors and words the quote", () => {
    const n = parkingNormFrom(policy, "rest", 65)!;
    expect(n.value).toBe(0.6);
    expect(n.quote).toBe("Woning tussen 50 tot 75 m2 GO, Rest bebouwde kom Delft: 0,5 bewoners + 0,1 bezoekers per woning");
  });

  it("marks a maximum zone, and returns null for an unknown zone or size", () => {
    expect(parkingNormFrom(policy, "binnenstad", 65)!.quote).toMatch(/\(maximum\)$/);
    expect(parkingNormFrom(policy, "nergens", 65)).toBeNull();
    expect(parkingNormFrom(policy, "rest", 80)).toBeNull();
  });

  it("does not drift on floating point sums", () => {
    expect(parkingNormFrom({ ...policy, rows: [row("x", null, null, [0.1, 0.2], [0, 0])].map((r) => ({ ...r, fromM2: 0 })) }, "rest", 10)!.value).toBe(0.3);
  });
});

describe("applyParking", () => {
  const base = unknownConstraints("test");

  it("fills an unknown norm; a zone the user chose is extracted, a guess stays assumed", () => {
    const chosen = applyParking(base, policy, "rest", true, 65).parkingNorm!;
    expect(chosen).toMatchObject({ value: 0.6, unit: "spaces/unit", prov: { status: "extracted" } });
    expect(chosen.prov.source).toContain("CVDR714401_1");
    const guess = applyParking(base, policy, "rest", false, 65).parkingNorm!;
    expect(guess.prov.status).toBe("assumed");
    expect(guess.prov.source).toMatch(/zone is a guess/);
  });

  it("follows the unit size", () => {
    expect(applyParking(base, policy, "rest", true, 40).parkingNorm!.value).toBe(0.3);
    expect(applyParking(base, policy, "rest", true, 150).parkingNorm!.value).toBe(1.1);
  });

  it("never replaces an extracted, verified or user-set norm", () => {
    for (const status of ["extracted", "verified", "user_override"] as const) {
      const set = { ...base, parkingNorm: { value: 2, unit: "spaces/unit", prov: { source: "s", status } } };
      expect(applyParking(set, policy, "rest", true, 65).parkingNorm!.value).toBe(2);
    }
  });

  it("replaces an assumed value, and changes nothing without a policy, a zone or a matching row", () => {
    const assumed = { ...base, parkingNorm: { value: 2, unit: "spaces/unit", prov: { source: "s", status: "assumed" as const } } };
    expect(applyParking(assumed, policy, "rest", true, 65).parkingNorm!.value).toBe(0.6);
    expect(applyParking(base, undefined, "rest", true, 65)).toBe(base);
    expect(applyParking(base, policy, null, true, 65)).toBe(base);
    expect(applyParking(base, policy, "rest", true, 80)).toBe(base);
  });
});
