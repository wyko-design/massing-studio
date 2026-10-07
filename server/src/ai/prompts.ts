import { readFileSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "..", "prompts");

export type Prompt = { version: string; system: string; user: string };

/**
 * Load `server/src/prompts/<name>.<version>.md`. The file holds a system part and a user
 * template, split by the `<!-- system -->` and `<!-- user -->` markers.
 */
export function loadPrompt(name: string, version: string): Prompt {
  const text = readFileSync(path.join(PROMPTS_DIR, `${name}.${version}.md`), "utf8").replace(/\r\n/g, "\n");
  const m = /<!-- system -->\n([\s\S]*?)<!-- user -->\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`Prompt ${name}.${version} needs <!-- system --> and <!-- user --> sections`);
  return { version: `${name}.${version}`, system: m[1]!.trim(), user: m[2]!.trim() };
}

/** Fill `{{key}}` placeholders. Every placeholder needs a value and every value must be used. */
export function render(template: string, vars: Record<string, string>): string {
  const used = new Set<string>();
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`Prompt placeholder {{${key}}} has no value`);
    used.add(key);
    return v;
  });
  const unused = Object.keys(vars).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`Prompt values not used by the template: ${unused.join(", ")}`);
  return out;
}
