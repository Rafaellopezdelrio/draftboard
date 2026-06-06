import { describe, it, expect } from "vitest";
import es from "./locales/es.json";
import en from "./locales/en.json";

/** Flatten a nested translation object into dot-notation leaf keys. */
function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatKeys(v as Record<string, unknown>, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

describe("i18n locale parity", () => {
  const esKeys = flatKeys(es).sort();
  const enKeys = flatKeys(en).sort();

  it("es and en have identical key sets (no missing translations)", () => {
    const missingInEn = esKeys.filter((k) => !enKeys.includes(k));
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k));
    expect({ missingInEn, missingInEs }).toEqual({
      missingInEn: [],
      missingInEs: [],
    });
  });

  it("no leaf value is empty in either locale", () => {
    const emptyEs = flatKeys(es).filter((k) => resolve(es, k).trim() === "");
    const emptyEn = flatKeys(en).filter((k) => resolve(en, k).trim() === "");
    expect({ emptyEs, emptyEn }).toEqual({ emptyEs: [], emptyEn: [] });
  });
});

function resolve(obj: Record<string, unknown>, dotted: string): string {
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    cur = (cur as Record<string, unknown>)[part];
  }
  return String(cur);
}
