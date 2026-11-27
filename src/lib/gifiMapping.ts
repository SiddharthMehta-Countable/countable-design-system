// The real CRA GIFI mapping sheet (Prod_mapping_Nov2026.csv, uploaded directly by the user) — the
// same table production uses for both the Trial Balance's Map No. column and, for Partnership and
// Trust engagements, the Tax Code column (GIFI is the CRA reporting code for T5013/T3 filings too,
// not just T2 — there's no separate "box number" list). Read-only reference data: picking an entry
// in the Map No. / Tax Code tray sets that one row's own field, nothing else — it never touches any
// other row's mapping or the rest of the mock data.
import raw from "@/data/gifiMapping.json";

export interface GifiMappingEntry {
  group: string;
  subGroup: string;
  leadsheetCode: string;
  leadsheetName: string;
  cfCategory: string;
  gifiCode: string;
  mapNo: string;
  description: string;
  excludeNow: boolean;
}

export const GIFI_MAPPING: GifiMappingEntry[] = raw as GifiMappingEntry[];

function norm(s: string): string {
  return s.toLowerCase();
}

/** Free-text search across map no, GIFI code, description, group and sub-group. */
export function searchGifiMapping(query: string, entries: GifiMappingEntry[] = GIFI_MAPPING): GifiMappingEntry[] {
  const q = norm(query.trim());
  if (!q) return entries;
  return entries.filter(e =>
    norm(e.mapNo).includes(q) ||
    norm(e.gifiCode).includes(q) ||
    norm(e.description).includes(q) ||
    norm(e.group).includes(q) ||
    norm(e.subGroup).includes(q) ||
    norm(e.leadsheetName).includes(q)
  );
}

export function formatGifiLabel(e: GifiMappingEntry): string {
  return `GIFI ${e.gifiCode} — ${e.description}`;
}
