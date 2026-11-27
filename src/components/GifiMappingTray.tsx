import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { GIFI_MAPPING, searchGifiMapping, type GifiMappingEntry } from "@/lib/gifiMapping";

// Shared tray for the Trial Balance's Map No. and Tax Code (GIFI) columns — both pick from the
// same real CRA mapping sheet, just keyed to a different field on save. Picking a row here only
// ever changes the one TB row that opened it; nothing else in the mock data is touched.
export function GifiMappingTray({
  open,
  onClose,
  onSelect,
  mode,
  currentValue,
  taxCodeSetLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (entry: GifiMappingEntry) => void;
  mode: "mapNo" | "gifi";
  currentValue?: string;
  /** e.g. "T5013" / "T3" — shown in the GIFI tray's title so it's clear which filing this feeds. */
  taxCodeSetLabel?: string;
}) {
  const [query, setQuery] = useState("");
  // Fresh search box every time it opens — one tray instance is reused across every row and
  // both modes, so leftover text from the last row's search would otherwise carry over.
  useEffect(() => { if (open) setQuery(""); }, [open]);
  const results = useMemo(() => searchGifiMapping(query).slice(0, 300), [query]);

  const title = mode === "mapNo" ? "Select a Map No." : `Select a GIFI code${taxCodeSetLabel ? ` — ${taxCodeSetLabel}` : ""}`;
  const description =
    mode === "mapNo"
      ? "The full Map No. reference sheet — pick the line this account rolls up to."
      : "The full GIFI reference sheet — pick the code this account reports under.";

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by Map No., GIFI code, or description…"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-border">
          {results.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground text-center">No matches</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-5 py-2 font-medium w-20">Map No.</th>
                  <th className="text-left px-3 py-2 font-medium w-20">GIFI</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium w-28">Group</th>
                </tr>
              </thead>
              <tbody>
                {results.map((e, i) => {
                  const isCurrent = mode === "mapNo" ? e.mapNo === currentValue : e.gifiCode === currentValue;
                  return (
                    <tr
                      key={`${e.mapNo}-${i}`}
                      onClick={() => { onSelect(e); onClose(); }}
                      className={`border-b border-border/50 cursor-pointer hover:bg-muted ${isCurrent ? "bg-muted" : ""}`}
                    >
                      <td className="px-5 py-1.5 font-mono text-foreground whitespace-nowrap">{e.mapNo}</td>
                      <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{e.gifiCode}</td>
                      <td className="px-3 py-1.5 text-foreground">{e.description}</td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{e.subGroup || e.group}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">
          {results.length >= 300 ? "Showing first 300 matches — keep typing to narrow it down." : `${results.length} of ${GIFI_MAPPING.length} mappings`}
        </div>
      </SheetContent>
    </Sheet>
  );
}
