// Shared Partners'/Unitholders'/Trust Capital roll-forward and reconciliation math — the
// single source of truth for both the Partnership Agreement & Capital worksheet (P9) and the
// Workbook's Statement of Partners' Capital screen (P10), so the two never drift apart.
import type { Participant } from "@/store/participantsStore";
import { getOverride, type PWWorksheetState } from "@/store/partnershipWorksheetStore";
import { getParticipantCapitalFromTB, getNetIncomeForEngagement } from "@/lib/participantCapitalFromTB";
import { getEntityLabels, hasActualClassSplit, type EntityKind } from "@/lib/entityLabels";
import { getEngagementMeta } from "@/store/engagementsStore";

const MS_PER_DAY = 86400000;

/** Net-income allocation weight for one participant, pro-rated by the portion of the fiscal
 * period they actually held their interest — "admitted mid-year" gets a partial year's share,
 * not a full one. Falls back to the raw (un-prorated) weight whenever the engagement has no
 * recorded period (`periodStart`/`periodEnd` in EngagementMeta) or the dates don't parse, so
 * existing engagements/tests created before this behaved exactly as they did before. Opening
 * capital, contributions, drawings and adjustments are real recorded transactions and are never
 * pro-rated — only the ex-post net-income allocation is. */
function proRatedWeight(p: Participant, periodStart: Date | null, periodEnd: Date | null): number {
 const weight = p.ownershipValue || 0;
 if (!periodStart || !periodEnd || periodEnd < periodStart) return weight;
 const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1;
 if (totalDays <= 0) return weight;
 const admitted = p.admissionDate ? new Date(p.admissionDate) : null;
 const retired = p.retirementDate ? new Date(p.retirementDate) : null;
 const effectiveStart = admitted && admitted > periodStart ? admitted : periodStart;
 const effectiveEnd = retired && retired < periodEnd ? retired : periodEnd;
 if (effectiveEnd < effectiveStart) return 0;
 const heldDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / MS_PER_DAY) + 1;
 return weight * (heldDays / totalDays);
}

/** Largest-remainder allocation: splits `total` across `weights` (percentages that should sum
 * to ~100) so every participant's share is proportional AND the parts sum exactly back to
 * `total` — no silent penny drift from naive per-participant rounding. */
export function allocateByWeight(total: number, weights: number[]): number[] {
 const sumWeights = weights.reduce((s, w) => s + w, 0);
 if (sumWeights <= 0) return weights.map(() => 0);
 const raw = weights.map(w => (total * w) / sumWeights);
 const floors = raw.map(r => Math.trunc(r * 100) / 100);
 let remainder = Math.round((total - floors.reduce((s, f) => s + f, 0)) * 100);
 const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac);
 const result = [...floors];
 for (let k = 0; k < order.length && remainder !== 0; k++) {
 const step = remainder > 0 ? 0.01 : -0.01;
 result[order[k].i] = Math.round((result[order[k].i] + step) * 100) / 100;
 remainder += remainder > 0 ? -1 : 1;
 }
 return result;
}

export interface CapitalRow {
 participant: Participant;
 opening: number;
 contributions: number;
 niAllocated: number;
 // This participant's share of net income, as a % of the total (sums to exactly 100 across all
 // rows via the same largest-remainder allocation used for the dollar amounts) — shown on the
 // face of the Statement of Partners' Capital itself, matching real partnership statements
 // (e.g. "Net income (loss) %"), not just tracked internally for the worksheet's own 100% check.
 niPct: number;
 drawings: number;
 adjustments: number;
 closing: number;
}

/** One participant's PRIOR year — a real roll-forward, not a collapsed totals line: opening
 * (independently recorded), contributions/drawings (from the worksheet's own PY overrides), net
 * income allocated at LAST year's own ownership %, and the closing that roll-forward builds up
 * to. `trueClosing` is what that closing is independently known to equal — this participant's
 * own CURRENT-year opening (last year's ending balance IS this year's beginning balance, always,
 * by definition) — so `variance` is a genuine check, not a number that trivially always agrees
 * with itself. `wasPresent` is false for a partner admitted during the CURRENT year (no
 * `priorYearOwnershipValue`): every figure is 0 and the preview shows a note instead of amounts. */
export interface CapitalRowPy {
 participant: Participant;
 wasPresent: boolean;
 opening: number;
 contributions: number;
 niAllocated: number;
 niPct: number;
 drawings: number;
 closing: number;
 trueClosing: number;
 variance: number;
}

export interface CapitalClassTotal {
 key: string;
 label: string;
 count: number;
 pctTotal: number;
 opening: number;
 contributions: number;
 ni: number;
 niPct: number;
 drawings: number;
 adjustments: number;
 closing: number;
}

export interface ReconciliationRow {
 label: string;
 worksheetVal: number;
 tbVal: number;
 diff: number;
 agrees: boolean;
}

export interface CapitalStatementData {
 rows: CapitalRow[];
 totals: { opening: number; contributions: number; ni: number; niPct: number; drawings: number; adjustments: number; closing: number };
 // Real per-participant prior-year roll-forward — see CapitalRowPy's own comment.
 rowsPy: CapitalRowPy[];
 totalsPy: { opening: number; contributions: number; ni: number; niPct: number; drawings: number; closing: number; trueClosing: number; variance: number };
 classTotals: CapitalClassTotal[];
 reconciliation: ReconciliationRow[];
 pctTotal: number;
 pctOK: boolean;
 recOK: boolean;
 netIncome: number;
 balanceSheetCapital: number;
 // This year's own roll-forward closing vs. the independently known Balance Sheet capital —
 // the same comparison the preview's bottom-of-statement line already made, now also exposed by
 // name so the preview can show it inline within the current-year section too, matching how
 // variance (the prior-year equivalent) is shown inline within the prior-year section.
 varianceCy: number;
}

const sumField = <T,>(list: T[], f: (r: T) => number) => list.reduce((s, r) => s + f(r), 0);

export function buildCapitalStatement(
 engagementId: string,
 entityType: EntityKind,
 participants: Participant[],
 worksheet: PWWorksheetState,
 trustVariant: "unit" | "other" = "other",
 // From the Statement of Income (Loss)'s own netIncomePy (revenue.pyTotal - expenses.pyTotal) —
 // passed in rather than recomputed here, so the two statements can never show a different
 // prior-year net income for the same engagement.
 netIncomePy = 0,
): CapitalStatementData {
 const labels = getEntityLabels(entityType, trustVariant);
 const netIncome = getNetIncomeForEngagement(engagementId, entityType, participants);
 const tbCapital = getParticipantCapitalFromTB(engagementId, entityType, participants);

 const pctTotal = participants.reduce((s, p) => s + (p.ownershipValue || 0), 0);
 const pctOK = participants.length > 0 && Math.abs(pctTotal - 100) < 0.01;

 // pctTotal/pctOK above check the AGREED allocation percentages sum to 100% — unaffected by who
 // was there for how long this year. Net income itself is allocated by time-weighted ownership.
 const meta = getEngagementMeta(engagementId);
 const periodStart = meta.periodStart ? new Date(meta.periodStart) : null;
 const periodEnd = meta.periodEnd ? new Date(meta.periodEnd) : null;
 const validPeriod = periodStart && periodEnd && !isNaN(periodStart.getTime()) && !isNaN(periodEnd.getTime()) ? { periodStart, periodEnd } : { periodStart: null, periodEnd: null };
 const weights = participants.map(p => proRatedWeight(p, validPeriod.periodStart, validPeriod.periodEnd));
 const niAllocations = allocateByWeight(netIncome, weights);
 // Same allocation (same weights, same largest-remainder rounding) applied to a total of 100
 // instead of the dollar figure, so the displayed % always matches exactly what each partner's
 // dollar share actually was — never a separately-rounded number that drifts from the $ column.
 const niPcts = allocateByWeight(100, weights);

 const rows: CapitalRow[] = participants.map((p, idx) => {
 const override = getOverride(worksheet, p.id);
 const opening = p.openingCapital ?? 0;
 const niAllocated = niAllocations[idx] ?? 0;
 const closing = opening + override.contributions + niAllocated + override.adjustments - override.drawings;
 return { participant: p, opening, contributions: override.contributions, niAllocated, niPct: niPcts[idx] ?? 0, drawings: override.drawings, adjustments: override.adjustments, closing };
 });

 const isGeneral = (p: Participant) => p.participantClass === "general";
 const generalRows = rows.filter(r => isGeneral(r.participant));
 const limitedRows = rows.filter(r => !isGeneral(r.participant));
 // labels.hasClassSplit only says this ENTITY TYPE is capable of a General/Limited split —
 // show it only when this engagement's own partners actually have one (see
 // hasActualClassSplit's own comment).
 const showClassSplit = hasActualClassSplit(labels, participants);

 const classRowTotal = (key: string, label: string, list: CapitalRow[]): CapitalClassTotal => ({
 key, label,
 count: list.length,
 pctTotal: sumField(list, r => r.participant.ownershipValue || 0),
 opening: sumField(list, r => r.opening),
 contributions: sumField(list, r => r.contributions),
 ni: sumField(list, r => r.niAllocated),
 niPct: sumField(list, r => r.niPct),
 drawings: sumField(list, r => r.drawings),
 adjustments: sumField(list, r => r.adjustments),
 closing: sumField(list, r => r.closing),
 });

 const classTotals: CapitalClassTotal[] = showClassSplit
 ? [classRowTotal("general", labels.classGeneral, generalRows), classRowTotal("limited", labels.classLimited, limitedRows)].filter(c => c.count > 0)
 : [classRowTotal("all", labels.classGeneral, rows)].filter(c => c.count > 0);

 const totals = {
 opening: sumField(rows, r => r.opening),
 contributions: sumField(rows, r => r.contributions),
 ni: sumField(rows, r => r.niAllocated),
 niPct: sumField(rows, r => r.niPct),
 drawings: sumField(rows, r => r.drawings),
 adjustments: sumField(rows, r => r.adjustments),
 closing: sumField(rows, r => r.closing),
 };

 // Prior-year net-income weights use LAST year's own ownership % (priorYearOwnershipValue), not
 // this year's — a partner admitted this year has none (undefined), so defaults to 0 rather than
 // falling back to their current-year %, correctly giving them no share of a year they weren't a
 // partner for yet. No pro-ration here: the period-based pro-ration above is for a partial *this*
 // year, not a historical one we have no admission/retirement dates to pro-rate against.
 const weightsPy = participants.map(p => p.priorYearOwnershipValue ?? 0);
 const niAllocationsPy = allocateByWeight(netIncomePy, weightsPy);
 const niPctsPy = allocateByWeight(100, weightsPy);

 const rowsPy: CapitalRowPy[] = participants.map((p, idx) => {
 const wasPresent = (p.priorYearOwnershipValue ?? 0) > 0;
 if (!wasPresent) {
 return { participant: p, wasPresent, opening: 0, contributions: 0, niAllocated: 0, niPct: 0, drawings: 0, closing: 0, trueClosing: 0, variance: 0 };
 }
 const override = getOverride(worksheet, p.id);
 const opening = p.openingCapitalPy ?? 0;
 const niAllocated = niAllocationsPy[idx] ?? 0;
 const contributions = override.contributionsPy ?? 0;
 const drawings = override.drawingsPy ?? 0;
 const closing = opening + contributions + niAllocated - drawings;
 // The one PY figure that's independently KNOWN for certain, not built up from the (separately
 // recorded, possibly imperfect) PY opening/activity above — this participant's own CURRENT
 // year opening IS last year's closing, always, by definition of a roll-forward.
 const trueClosing = p.openingCapital ?? 0;
 return { participant: p, wasPresent, opening, contributions, niAllocated, niPct: niPctsPy[idx] ?? 0, drawings, closing, trueClosing, variance: closing - trueClosing };
 });

 const totalsPy = {
 opening: sumField(rowsPy, r => r.opening),
 contributions: sumField(rowsPy, r => r.contributions),
 ni: sumField(rowsPy, r => r.niAllocated),
 niPct: sumField(rowsPy, r => r.niPct),
 drawings: sumField(rowsPy, r => r.drawings),
 closing: sumField(rowsPy, r => r.closing),
 // Same "independently known, not built up" logic as each row's own trueClosing — the sum of
 // everyone's current-year opening, which is exactly this year's own totals.opening.
 trueClosing: totals.opening,
 variance: sumField(rowsPy, r => r.variance),
 };

 const tbOpeningFor = (list: CapitalRow[]) =>
 list.reduce((s, r) => s + (tbCapital[r.participant.id]?.openingFromTB ?? 0), 0);
 const balanceSheetCapital = rows.reduce((s, r) => s + (tbCapital[r.participant.id]?.closingFromTB ?? 0), 0);
 const drawingsFromTB = rows.reduce((s, r) => s + (tbCapital[r.participant.id]?.drawingsFromTB ?? 0), 0);
 const contributionsFromTB = rows.reduce((s, r) => s + (tbCapital[r.participant.id]?.contributionsFromTB ?? 0), 0);
 const varianceCy = totals.closing - balanceSheetCapital;

 // Trust/other single-class entities (and a Partnership with no real General/Limited split —
 // see showClassSplit) have no "general"/"limited" split — isGeneral is meaningless there, so
 // generalRows would be empty and silently show a trivial 0-vs-0 "agrees" AND a spurious
 // "Opening – limited partners vs. TB" row for partners who have no limited-partner concept at
 // all. Group by the same all-vs-split logic classTotals above already uses, instead of raw
 // generalRows/limitedRows, so this line always reflects every participant somewhere.
 const openingGroups = showClassSplit
 ? [{ label: labels.classGeneral, list: generalRows }, { label: labels.classLimited, list: limitedRows }]
 : [{ label: labels.classGeneral, list: rows }];

 const reconciliation: ReconciliationRow[] = [
 ...openingGroups.map(g => ({
 label: `Opening – ${g.label.toLowerCase()} vs. TB`,
 worksheetVal: sumField(g.list, r => r.opening),
 tbVal: tbOpeningFor(g.list),
 })),
 { label: `${labels.contributions} vs. TB`, worksheetVal: totals.contributions, tbVal: contributionsFromTB },
 { label: `${labels.drawings} vs. TB`, worksheetVal: totals.drawings, tbVal: drawingsFromTB },
 { label: "Net income allocated vs. Statement of Income (Loss)", worksheetVal: totals.ni, tbVal: netIncome },
 { label: `Closing vs. ${labels.capitalLabel} on Balance Sheet`, worksheetVal: totals.closing, tbVal: balanceSheetCapital },
 ].map(r => ({ ...r, diff: r.worksheetVal - r.tbVal, agrees: Math.abs(r.worksheetVal - r.tbVal) < 0.005 }));

 const recOK = reconciliation.every(r => r.agrees) && pctOK;

 return { rows, totals, rowsPy, totalsPy, classTotals, reconciliation, pctTotal, pctOK, recOK, netIncome, balanceSheetCapital, varianceCy };
}

/** A capital row stripped to name + the roll-forward numbers only — never `taxIdentifier`,
 * `admissionDate`, `retirementDate`, or any other field on `Participant`. Anything that renders a
 * capital statement for an audience outside the firm (the Workbook preview, the Partner package
 * PDF export — P14) should consume this type, not `CapitalRow`/`Participant` directly, so a
 * sensitive field can't leak onto a statement by accident. */
export interface PublicCapitalEntity {
 /** Present for an individual participant's row; omitted for a class/total rollup, which has no
 * single participant to key on. */
 id?: string;
 name: string;
 opening: number;
 contributions: number;
 ni: number;
 niPct: number;
 drawings: number;
 adjustments: number;
 closing: number;
}

export function toPublicEntities(rows: CapitalRow[]): PublicCapitalEntity[] {
 return rows.map(r => ({
 id: r.participant.id,
 name: r.participant.name || "Unnamed",
 opening: r.opening,
 contributions: r.contributions,
 ni: r.niAllocated,
 niPct: r.niPct,
 drawings: r.drawings,
 adjustments: r.adjustments,
 closing: r.closing,
 }));
}

/** The prior-year equivalent of `PublicCapitalEntity` — same stripping rationale, plus
 * `wasPresent`/`trueClosing`/`variance` so a consumer can render "not yet admitted" and the
 * inline variance check without reaching back into `CapitalRowPy`/`Participant` directly. */
export interface PublicCapitalEntityPy {
 id?: string;
 name: string;
 wasPresent: boolean;
 opening: number;
 contributions: number;
 ni: number;
 niPct: number;
 drawings: number;
 closing: number;
 trueClosing: number;
 variance: number;
}

export function toPublicEntitiesPy(rows: CapitalRowPy[]): PublicCapitalEntityPy[] {
 return rows.map(r => ({
 id: r.participant.id,
 name: r.participant.name || "Unnamed",
 wasPresent: r.wasPresent,
 opening: r.opening,
 contributions: r.contributions,
 ni: r.niAllocated,
 niPct: r.niPct,
 drawings: r.drawings,
 closing: r.closing,
 trueClosing: r.trueClosing,
 variance: r.variance,
 }));
}
