import { z } from "zod";
import { SiteConstraintsSchema, constrained } from "./constraints";
import { ComplianceSchema, MassingParamsSchema, ProgrammeSchema, TypologySchema } from "./massing";
import { PlanExcerptSchema, PlanTextRefSchema } from "./siteFixture";
import { RingSchema } from "./site";

// ---- Priorities (SPEC §7 brief interpreter → strategy generator) ----

export const PRIORITY_KEYS = ["units", "daylight", "lowProfile", "openSpace", "simplicity"] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const PRIORITY_LABELS: Record<PriorityKey, string> = {
  units: "Number of homes",
  daylight: "Daylight and sun",
  lowProfile: "Low profile / fit with neighbours",
  openSpace: "Open space on the plot",
  simplicity: "Simple, buildable form",
};

const weight = z.number().int().min(0).max(5);
/** Design priorities, 0 (doesn't matter) – 5 (essential). Choices, not planning values. */
export const PrioritiesSchema = z.object({
  units: weight,
  daylight: weight,
  lowProfile: weight,
  openSpace: weight,
  simplicity: weight,
});
export type Priorities = z.infer<typeof PrioritiesSchema>;
export const DEFAULT_PRIORITIES: Priorities = { units: 3, daylight: 3, lowProfile: 3, openSpace: 3, simplicity: 3 };

// ---- Shared envelope for every AI endpoint ----

export const AiErrorKindSchema = z.enum(["unavailable", "refusal", "truncated", "invalid_output", "bad_request"]);
export type AiErrorKind = z.infer<typeof AiErrorKindSchema>;

export const AiErrorSchema = z.object({
  kind: AiErrorKindSchema,
  message: z.string(),
  /** Validation problems, one per line, when kind is invalid_output or bad_request. */
  details: z.array(z.string()),
});
export type AiError = z.infer<typeof AiErrorSchema>;

export const AiMetaSchema = z.object({
  model: z.string(),
  promptVersion: z.string(),
  /** 1, or 2 when the first answer failed validation and was retried. */
  attempts: z.number().int().positive(),
  /** Estimated cost reported by the SDK; null when replayed from the cache. */
  costUsd: z.number().nullable(),
  /** True when the answer was replayed from data/cache (offline mode). */
  cached: z.boolean(),
});
export type AiMeta = z.infer<typeof AiMetaSchema>;

export const aiResponse = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data, meta: AiMetaSchema }),
    z.object({ ok: z.literal(false), error: AiErrorSchema }),
  ]);

// ---- Constraint interpreter ----

/** Constraint fields the interpreter may fill from plan text. Geometry and the street side are never asked for. */
export const EXTRACTABLE_PATHS = [
  "allowedFunctions",
  "maxHeight",
  "maxGutterHeight",
  "setbacks.street",
  "setbacks.side",
  "setbacks.rear",
  "maxCoverage",
  "maxFAR",
  "parkingNorm",
] as const;
export const ExtractablePathSchema = z.enum(EXTRACTABLE_PATHS);
export type ExtractablePath = z.infer<typeof ExtractablePathSchema>;

export const ExtractRulesRequestSchema = z.object({
  /** Plan text to read; omitted = the excerpts of the active site fixture. */
  excerpts: z.array(PlanExcerptSchema).optional(),
  /** Links to plan articles (from `scene.zoning.textRefs`); the server fetches the text itself. Used when `excerpts` is omitted. */
  textRefs: z.array(PlanTextRefSchema).max(5).optional(),
  /** Text (XML) of the municipal parking policy (`scene.parking.textUrl`), read in addition when its norm table could not be parsed. */
  policyUrl: z.string().url().optional(),
});
export type ExtractRulesRequest = z.infer<typeof ExtractRulesRequestSchema>;

export const ExtractRulesResultSchema = z.object({
  /** Proposed values, status "extracted", each with its verbatim quote. Not applied until the user accepts them. */
  fields: z.array(
    z.object({
      path: ExtractablePathSchema,
      constrained: constrained(z.union([z.number(), z.array(z.string())])),
    }),
  ),
  /** Rules the generator cannot use but the user must see. */
  notes: z.array(constrained(z.string())),
});
export type ExtractRulesResult = z.infer<typeof ExtractRulesResultSchema>;

// ---- Brief interpreter ----

export const InterpretBriefRequestSchema = z.object({
  brief: z.string().trim().min(1).max(4000),
  programme: ProgrammeSchema,
  /** Current rules (with overrides) so the model knows what the site allows. */
  constraints: SiteConstraintsSchema.optional(),
});
export type InterpretBriefRequest = z.infer<typeof InterpretBriefRequestSchema>;

export const ProgrammeFieldSchema = z.enum(["targetUnits", "avgUnitSize", "netToGross"]);

export const InterpretBriefResultSchema = z.object({
  /** The request's programme with the values the brief states, clamped to the input ranges. */
  programme: ProgrammeSchema,
  /** What the brief changed, with the words it was read from. */
  changes: z.array(z.object({ field: ProgrammeFieldSchema, briefQuote: z.string() })),
  priorities: PrioritiesSchema,
  typologyHints: z.array(TypologySchema),
  summary: z.string(),
  /** Things the brief leaves open or contradicts. */
  unclear: z.array(z.string()),
  /** Brief values outside the input ranges. */
  clamps: z.array(z.string()),
});
export type InterpretBriefResult = z.infer<typeof InterpretBriefResultSchema>;

// ---- Strategy generator ----

/** The fixed strategies, one tab each; code sets their params from the site (`presetParams`). */
export const PRESET_IDS = ["homes", "daylight", "garden", "low"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
/** Every option tab: the presets, then the one the AI proposes from the brief. */
export const OPTION_IDS = [...PRESET_IDS, "custom"] as const;
export const OptionIdSchema = z.enum(OPTION_IDS);
export type OptionId = z.infer<typeof OptionIdSchema>;

/** Proposal colour per option tab; assigned by code, not by the model. */
export const OPTION_COLOURS: Record<OptionId, string> = { homes: "#c23350", daylight: "#2f6fb0", garden: "#3f8f4f", low: "#d98a1f", custom: "#7a4fb0" };

export const GenerateDirectionsRequestSchema = z.object({
  /** Constraints in the local frame, with the user's overrides applied. */
  constraints: SiteConstraintsSchema,
  parcel: z.object({ ring: RingSchema, areaM2: z.number().positive() }),
  programme: ProgrammeSchema,
  priorities: PrioritiesSchema,
  typologyHints: z.array(TypologySchema).optional(),
  brief: z.string().max(4000).optional(),
});
export type GenerateDirectionsRequest = z.infer<typeof GenerateDirectionsRequestSchema>;

export const DirectionSchema = z.object({
  id: OptionIdSchema,
  name: z.string(),
  intent: z.string(),
  tradeOffs: z.array(z.string()),
  /** Params after clamping to the input ranges: what the option tab starts from. */
  params: MassingParamsSchema,
  /** Range clamps, then every clamp generateMassing applied. */
  clamps: z.array(z.string()),
  metrics: z.object({
    footprint: z.number(),
    gfa: z.number(),
    far: z.number(),
    coverage: z.number(),
    height: z.number(),
    floors: z.number(),
    estUnits: z.number(),
    facadeSunScore: z.number(),
  }),
  compliance: z.array(ComplianceSchema),
});
export type Direction = z.infer<typeof DirectionSchema>;

export const GenerateDirectionsResultSchema = z.object({
  /** The custom option: one direction from the brief and the priorities (id "custom"). */
  option: DirectionSchema,
  /** E.g. the option does not fit the envelope at all. */
  warnings: z.array(z.string()),
});
export type GenerateDirectionsResult = z.infer<typeof GenerateDirectionsResultSchema>;

// ---- Report writer (stub until P10) ----

export const REPORT_SECTION_IDS = ["site", "constraints", "options", "comparison", "limitations"] as const;
export const ReportSectionIdSchema = z.enum(REPORT_SECTION_IDS);

export const WriteReportRequestSchema = z.object({
  address: z.string(),
  parcelId: z.string(),
  parcelAreaM2: z.number().positive(),
  constraints: SiteConstraintsSchema,
  options: z.array(DirectionSchema.pick({ id: true, name: true, intent: true, tradeOffs: true, params: true, clamps: true, metrics: true })).min(1).max(OPTION_IDS.length),
});
export type WriteReportRequest = z.infer<typeof WriteReportRequestSchema>;

export const WriteReportResultSchema = z.object({
  /** Narrative with every number filled in by code from computed values. */
  sections: z.array(z.object({ id: ReportSectionIdSchema, title: z.string(), text: z.string() })),
});
export type WriteReportResult = z.infer<typeof WriteReportResultSchema>;
