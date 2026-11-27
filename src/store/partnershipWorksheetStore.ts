// Partnership Agreement & Capital worksheet state (P9) — the questionnaire, roll-forward
// adjustments, reconciliation comments, and conclude/reopen status. Partner register data
// itself lives in participantsStore.ts (shared with the TB Participant column and the
// Partners' Capital preview); this store holds only what's specific to the worksheet.
export interface PWQuestionnaire {
 generalPartnerId: string; // participant id of the general/managing partner
 whoSigns: string; // free text — name + title
 basis: string; // one of ALLOCATION_BASIS_OPTIONS
 changeSincePriorYear: boolean;
 changeDetail: string;
 changeEffectiveDate: string;
 priorityReturns: boolean;
 priorityDetail: string;
 drawingsLimited: boolean;
 drawingsLimitedDetail: string;
 negativeCapitalAllowed: boolean;
}

export const ALLOCATION_BASIS_OPTIONS = [
 "Fixed profit-sharing ratios per agreement",
 "Capital account balances",
 "Equal shares regardless of capital",
 "Other (describe in comments)",
];

export function blankQuestionnaire(): PWQuestionnaire {
 return {
 generalPartnerId: "",
 whoSigns: "",
 basis: "",
 changeSincePriorYear: false,
 changeDetail: "",
 changeEffectiveDate: "",
 priorityReturns: false,
 priorityDetail: "",
 drawingsLimited: false,
 drawingsLimitedDetail: "",
 negativeCapitalAllowed: false,
 };
}

export interface PartnerCapitalOverride {
 contributions: number;
 drawings: number;
 adjustments: number;
 // Prior-year contributions/drawings — independently recorded, same as the current-year fields
 // above, powering the Statement of Partners' Capital preview's real per-partner PY roll-forward
 // (P10) instead of a single collapsed totals line. Optional so older stored worksheets (saved
 // before these existed) still parse; getOverride defaults them to 0.
 contributionsPy?: number;
 drawingsPy?: number;
}

export interface PWWorksheetState {
 questionnaire: PWQuestionnaire;
 overridesByParticipantId: Record<string, PartnerCapitalOverride>;
 comments: string;
 concluded: boolean;
 copiedFromEngagementId?: string;
}

export function blankWorksheetState(): PWWorksheetState {
 return {
 questionnaire: blankQuestionnaire(),
 overridesByParticipantId: {},
 comments: "",
 concluded: false,
 };
}

const PW_KEY = (engagementId: string) => `cds_pw_worksheet_${engagementId}`;

// Same mock drawings/contributions figures as src/pages/TrialBalance.tsx's
// MOCK_PARTICIPANT_DRAWINGS/MOCK_PARTICIPANT_CONTRIBUTIONS, seeded here too so the capital
// statement's own "Drawings"/"Contributions" lines (sourced from this worksheet, not the TB)
// show the same numbers — demonstrating both flowing TB → mapping → worksheet → capital
// statement, not just sitting inert on the TB screen.
// PY figures below are independently seeded (not derived to force a perfect tie) — same
// principle as the real B&C Health Partnership statement's own small, unexplained variances —
// so the Statement of Partners' Capital preview's per-year inline variance check has something
// genuine to compare against, not a number that trivially always agrees with itself. Priya
// Nandan has none: she wasn't a partner last year (admitted 2024-07-01).
const WCP_DRAWINGS_OVERRIDES: PWWorksheetState["overridesByParticipantId"] = {
 "WCP-ALEX": { contributions: 50000, drawings: 120000, adjustments: 0, contributionsPy: 20000, drawingsPy: 60000 },
 "WCP-MORGAN": { contributions: 30000, drawings: 75000, adjustments: 0, contributionsPy: 10000, drawingsPy: 35000 },
 "WCP-PRIYA": { contributions: 10000, drawings: 15000, adjustments: 0 },
};
const BFT_DRAWINGS_OVERRIDES: PWWorksheetState["overridesByParticipantId"] = {
 "BFT-TAYLOR": { contributions: 40000, drawings: 150000, adjustments: 0, contributionsPy: 15000, drawingsPy: 50000 },
 "BFT-JORDAN": { contributions: 20000, drawings: 95000, adjustments: 0, contributionsPy: 8000, drawingsPy: 30000 },
};
// B&C Health Partnership's real drawings, straight from the client-provided statement; no
// contributions that year for either partner (matching the statement's own "-"). PY figures are
// our own invented demo data (the real statement only gave us one year).
const BCH_DRAWINGS_OVERRIDES: PWWorksheetState["overridesByParticipantId"] = {
 "BCH-ALAN": { contributions: 0, drawings: 325602, adjustments: 0, contributionsPy: 0, drawingsPy: 180000 },
 "BCH-BACCHIOCHI": { contributions: 0, drawings: 350357, adjustments: 0, contributionsPy: 0, drawingsPy: 190000 },
};
const SEED_PW_WORKSHEETS: Record<string, PWWorksheetState> = {
 "COM-WCP-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: WCP_DRAWINGS_OVERRIDES },
 "REV-WCP-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: WCP_DRAWINGS_OVERRIDES },
 "T5013-WCP-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: WCP_DRAWINGS_OVERRIDES },
 "COM-BFT-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: BFT_DRAWINGS_OVERRIDES },
 "REV-BFT-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: BFT_DRAWINGS_OVERRIDES },
 "T3-BFT-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: BFT_DRAWINGS_OVERRIDES },
 "COM-BCH-Dec312024": { ...blankWorksheetState(), overridesByParticipantId: BCH_DRAWINGS_OVERRIDES },
};

export function loadPWWorksheet(engagementId: string): PWWorksheetState {
 try {
 const raw = localStorage.getItem(PW_KEY(engagementId));
 if (raw) return { ...blankWorksheetState(), ...JSON.parse(raw) };
 } catch { /* fall through */ }
 return SEED_PW_WORKSHEETS[engagementId] ?? blankWorksheetState();
}

export function savePWWorksheet(engagementId: string, state: PWWorksheetState): void {
 try { localStorage.setItem(PW_KEY(engagementId), JSON.stringify(state)); } catch { /* ignore */ }
}

export function getOverride(state: PWWorksheetState, participantId: string): PartnerCapitalOverride {
 // Defaults merged in (not just a fallback for a missing id) so a worksheet saved before
 // contributionsPy/drawingsPy existed still returns a complete, non-optional shape.
 return { contributions: 0, drawings: 0, adjustments: 0, contributionsPy: 0, drawingsPy: 0, ...state.overridesByParticipantId[participantId] };
}
