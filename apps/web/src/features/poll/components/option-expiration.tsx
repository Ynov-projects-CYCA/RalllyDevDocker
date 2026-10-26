"use client";

import * as React from "react";
import { isPollOptionExpired } from "@/features/poll/utils";
import { Trans } from "@/i18n/client";
import { useHydrated } from "@/lib/datetime/use-hydrated";

type Option = { id: string; startTime: Date; duration: number };
type Vote = { optionId: string; type?: "yes" | "no" | "ifNeedBe" };

/** Keep expired history verbatim; never submit a newly composed expired vote. */
export function prepareVotesForSubmission(
  options: { id: string }[],
  draft: (Vote | undefined)[],
  saved: Vote[],
  isExpired: (id: string) => boolean,
) {
  const drafts = new Map(
    draft.filter((v) => v !== undefined).map((v) => [v.optionId, v.type]),
  );
  const history = new Map(saved.map((v) => [v.optionId, v.type]));
  const votes: { optionId: string; type: NonNullable<Vote["type"]> }[] = [];
  let changed = false;
  let hasFuture = false;
  for (const { id } of options) {
    const value = drafts.get(id) ?? "no";
    if (isExpired(id)) {
      const previous = history.get(id);
      changed ||= value !== (previous ?? "no");
      if (previous) votes.push({ optionId: id, type: previous });
    } else {
      hasFuture = true;
      votes.push({ optionId: id, type: value });
    }
  }
  return { votes, changed, hasFuture };
}

const ExpirationContext = React.createContext<{
  isExpired: (id: string) => boolean;
} | null>(null);

export function OptionExpirationProvider({
  options,
  pollTimeZone,
  children,
}: {
  options: Option[];
  pollTimeZone: string | null;
  children: React.ReactNode;
}) {
  const hydrated = useHydrated();
  const [, refresh] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    // Background tabs throttle timers; refresh immediately when returning.
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const byId = React.useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  // Match the server: a caller-controlled device/display zone must not move
  // the voting deadline of a floating option.
  const floatingTimeZone = "UTC";
  // Read the clock on every call, including clicks and the final submission.
  const isExpired = React.useCallback(
    (id: string) => {
      if (!hydrated) return false;
      const option = byId.get(id);
      return (
        !option ||
        isPollOptionExpired({ option, pollTimeZone, floatingTimeZone })
      );
    },
    [byId, pollTimeZone, hydrated],
  );
  return (
    <ExpirationContext.Provider value={{ isExpired }}>
      {hydrated && options.every((option) => isExpired(option.id)) ? (
        <output className="block p-3 text-muted-foreground text-sm">
          <Trans
            i18nKey="pollNoFutureOptions"
            defaults="No time slots are available for voting."
          />
        </output>
      ) : null}
      {children}
    </ExpirationContext.Provider>
  );
}

export function useOptionExpiration() {
  const context = React.useContext(ExpirationContext);
  if (!context) throw new Error("OptionExpirationProvider is required");
  return context;
}

export function ExpiredOptionLabel() {
  return (
    <span className="block text-muted-foreground text-xs">
      <Trans i18nKey="pollOptionExpired" defaults="Time slot expired" />
    </span>
  );
}
