"use client";

import { Alert, AlertDescription, AlertTitle } from "@rallly/ui/alert";
import { EyeOffIcon } from "lucide-react";
import type { ResponseVisibility } from "@/features/poll/types";
import { Trans } from "@/i18n/client";

/**
 * Tells a participant why they only see their own response, and when the
 * rest will appear. Renders nothing once responses are visible.
 */
export function HiddenResponsesNotice({
  visibility,
  className,
}: {
  visibility: ResponseVisibility;
  className?: string;
}) {
  if (!visibility.hidden) {
    return null;
  }

  return (
    // A status rather than the Alert's default alert role: the notice is
    // there on load, and only its count changes as people respond.
    <Alert
      role="status"
      className={className}
      data-testid="hidden-responses-notice"
    >
      <EyeOffIcon />
      <AlertTitle>
        <Trans
          i18nKey="hiddenResponsesNoticeTitle"
          defaults="Responses are hidden"
        />
      </AlertTitle>
      <AlertDescription>
        {visibility.revealThreshold !== null ? (
          <Trans
            i18nKey="hiddenResponsesNoticeThreshold"
            defaults="You'll see everyone's responses once {threshold, plural, one {# person has} other {# people have}} responded, or when the poll is closed or finalized. {count, plural, one {# person has} other {# people have}} responded so far."
            values={{
              threshold: visibility.revealThreshold,
              count: visibility.responseCount,
            }}
          />
        ) : (
          <Trans
            i18nKey="hiddenResponsesNoticeUntilClosed"
            defaults="You'll see everyone's responses once the poll is closed or finalized. {count, plural, one {# person has} other {# people have}} responded so far."
            values={{ count: visibility.responseCount }}
          />
        )}
      </AlertDescription>
    </Alert>
  );
}
