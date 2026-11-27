// Entity-aware Trial Balance Grouping / Sub Grouping options (P7). Corporation keeps today's
// options unchanged; Partnership/Trust remove Share capital and (for Partnership) Income taxes
// payable, add the three participant-scoped equity sub-groupings, and Trust keeps an Accumulated
// income row instead of Retained earnings.

export const PARTICIPANT_SCOPED_SUBGROUPINGS = new Set([
 "Partners' capital",
 "Drawings / Distributions",
 "Contributions",
]);

export function isParticipantScoped(subGrouping: string): boolean {
 return PARTICIPANT_SCOPED_SUBGROUPINGS.has(subGrouping);
}

const CORPORATION_GROUPINGS: Record<string, string[]> = {
 Assets: ["Current assets", "Non-current assets", "Fixed assets"],
 Liabilities: ["Current liabilities", "Long-term liabilities", "Income taxes payable"],
 Equity: ["Share capital", "Retained earnings"],
 Revenue: ["Operating revenue", "Other income"],
 Expenses: ["Operating expenses", "Admin expenses", "Finance costs"],
};

export function getGroupingOptions(entityType: string): Record<string, string[]> {
 if (entityType === "Partnership") {
 return {
 ...CORPORATION_GROUPINGS,
 Liabilities: ["Current liabilities", "Long-term liabilities"],
 Equity: ["Partners' capital", "Drawings / Distributions", "Contributions"],
 };
 }
 if (entityType === "Trust") {
 return {
 ...CORPORATION_GROUPINGS,
 // Income taxes payable is conditional for a trust (kept, not removed).
 Equity: ["Accumulated income", "Partners' capital", "Drawings / Distributions", "Contributions"],
 };
 }
 return CORPORATION_GROUPINGS;
}

export function getSubGroupingOptions(entityType: string, grouping: string): string[] {
 return getGroupingOptions(entityType)[grouping] ?? [];
}

// Tax code column (P7). Corporation keeps its existing plain numeric GIFI value (no change).
// Partnership/Trust now pick from the real GIFI mapping sheet (src/lib/gifiMapping.ts, the same
// one the Map No. column uses) via GifiMappingTray — GIFI is the CRA reporting code for T5013/T3
// filings too, not just T2, so there's no separate box-number list to source. This label is just
// for the tray's own title (e.g. "Select a GIFI code — T5013").
export function getTaxCodeSetLabel(entityType: string, country: string): string {
 if (entityType === "Partnership") return country === "us" ? "1065" : "T5013";
 if (entityType === "Trust") return country === "us" ? "1041" : "T3";
 return "T2/GIFI";
}
