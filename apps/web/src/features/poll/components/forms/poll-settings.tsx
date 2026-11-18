"use client";

import { posthog } from "@rallly/posthog/client";
import { Card, CardContent, CardTitle } from "@rallly/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@rallly/ui/field";
import { FormField } from "@rallly/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { Switch } from "@rallly/ui/switch";
import { VoteIcon } from "@rallly/ui/vote-icon";
import {
  BarChart2Icon,
  EyeIcon,
  EyeOffIcon,
  ListChecksIcon,
  MailIcon,
  MessageCircleIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { SettingIcon } from "@/components/setting-icon";
import { showPayWall, useIsFree } from "@/features/billing/client";
import { ProBadge } from "@/features/billing/components/pro-badge";
import type { PollSettingsFormData } from "@/features/poll/components/forms/types";
import type { VoteType } from "@/features/poll/constants";
import { Trans } from "@/i18n/client";

/**
 * Response counts offered for an early reveal. The schema accepts any count
 * in range, so a poll saved with another one (through the API, say) gets
 * its own count listed too rather than a select showing nothing.
 */
const RESPONSE_REVEAL_THRESHOLD_PRESETS = [3, 5, 10, 20];

// The select needs a string for "no threshold": the reveal then waits for
// the poll to be closed or finalized.
const REVEAL_WHEN_CLOSED = "closed";

function getRevealThresholdChoices(current: number | null) {
  const counts = new Set(RESPONSE_REVEAL_THRESHOLD_PRESETS);
  if (current !== null) {
    counts.add(current);
  }
  return [...counts].sort((a, b) => a - b);
}

function RevealThresholdLabel({ threshold }: { threshold: number | null }) {
  return threshold === null ? (
    <Trans
      i18nKey="revealResponsesWhenClosed"
      defaults="When the poll is closed or finalized"
    />
  ) : (
    <Trans
      i18nKey="revealResponsesAfterCount"
      defaults="{count, plural, one {After # response} other {After # responses}}"
      values={{ count: threshold }}
    />
  );
}

/**
 * Each answer as its icon plus its name, so the choice shows exactly what a
 * participant will see. The icons separate the answers, so no punctuation is
 * needed between them. The base VoteIcon is used rather than the app wrapper
 * because that one always sets a <title>, which screen readers would announce
 * on top of the name beside it ("Yes Yes, If need be If need be").
 */
function VoteOptionLabel({ types }: { types: VoteType[] }) {
  const labels: Record<VoteType, React.ReactNode> = {
    yes: <Trans i18nKey="yes" defaults="Yes" />,
    ifNeedBe: <Trans i18nKey="ifNeedBe" defaults="If need be" />,
    no: <Trans i18nKey="no" defaults="No" />,
  };

  return (
    <span className="flex items-center gap-x-2.5">
      {types.map((type) => (
        <span key={type} className="flex items-center gap-x-1">
          <VoteIcon type={type} />
          {labels[type]}
        </span>
      ))}
    </span>
  );
}

export const PollSettingsForm = ({
  children,
  hasTentativeVotes = false,
}: React.PropsWithChildren<{
  /**
   * True when responses already use the tentative vote. Those votes stay
   * valid, so the answer set is locked to keep them re-saveable; the same
   * rule is enforced in the modify mutation.
   */
  hasTentativeVotes?: boolean;
}>) => {
  const form = useFormContext<PollSettingsFormData>();
  const isFree = useIsFree();
  const hideResponses = useWatch({
    control: form.control,
    name: "hideResponses",
  });

  return (
    <Card>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4">
        <CardTitle>
          <Trans i18nKey="settings" />
        </CardTitle>
      </div>
      <CardContent>
        <FieldGroup variant="divided">
          <FormField
            control={form.control}
            name="requireParticipantEmail"
            render={({ field }) => (
              <Field orientation="horizontal">
                <SettingIcon>
                  <MailIcon />
                </SettingIcon>
                <FieldContent>
                  <FieldLabel htmlFor="require-participant-email">
                    <Trans
                      i18nKey="requireParticipantEmailTitle"
                      defaults="Require email"
                    />
                    {isFree ? <ProBadge /> : null}
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="requireParticipantEmailDescription"
                      defaults="Participants must provide an email address to respond."
                    />
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="require-participant-email"
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    if (checked && isFree) {
                      showPayWall({
                        from: "poll-settings",
                        setting: "requireParticipantEmail",
                      });
                    } else {
                      field.onChange(checked);
                    }
                  }}
                />
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="hideParticipants"
            render={({ field }) => (
              <Field orientation="horizontal">
                <SettingIcon>
                  <VenetianMaskIcon />
                </SettingIcon>
                <FieldContent>
                  <FieldLabel htmlFor="hide-participants">
                    <Trans
                      i18nKey="hideParticipantsTitle"
                      defaults="Hide participant names"
                    />
                    {isFree ? <ProBadge /> : null}
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="hideParticipantsDescription"
                      defaults="Participants will not be able to see the names of other respondents."
                    />
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="hide-participants"
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    if (checked && isFree) {
                      showPayWall({
                        from: "poll-settings",
                        setting: "hideParticipants",
                      });
                    } else {
                      field.onChange(checked);
                    }
                  }}
                />
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="hideScores"
            render={({ field }) => (
              <Field orientation="horizontal">
                <SettingIcon>
                  <BarChart2Icon />
                </SettingIcon>
                <FieldContent>
                  <FieldLabel htmlFor="hide-scores">
                    <Trans i18nKey="hideScoresTitle" defaults="Hide votes" />
                    {isFree ? <ProBadge /> : null}
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="hideScoresDescription"
                      defaults="Hide everyone's votes from a participant until they cast their own."
                    />
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="hide-scores"
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    if (checked && isFree) {
                      showPayWall({
                        from: "poll-settings",
                        setting: "hideScores",
                      });
                    } else {
                      field.onChange(checked);
                    }
                  }}
                />
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="hideResponses"
            render={({ field }) => (
              <Field orientation="horizontal">
                <SettingIcon>
                  <EyeOffIcon />
                </SettingIcon>
                <FieldContent>
                  <FieldLabel htmlFor="hide-responses">
                    <Trans
                      i18nKey="hideResponsesTitle"
                      defaults="Hide responses"
                    />
                    {isFree ? <ProBadge /> : null}
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="hideResponsesDescription"
                      defaults="Participants only see their own response until the poll is closed or finalized. You always see everyone's."
                    />
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="hide-responses"
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    if (checked && isFree) {
                      showPayWall({
                        from: "poll-settings",
                        setting: "hideResponses",
                      });
                      return;
                    }
                    field.onChange(checked);
                    // A threshold only applies while responses are hidden,
                    // so turning hiding back on starts from the default.
                    if (!checked) {
                      form.setValue("responseRevealThreshold", null);
                    }
                  }}
                />
              </Field>
            )}
          />
          {hideResponses ? (
            <FormField
              control={form.control}
              name="responseRevealThreshold"
              render={({ field }) => {
                const value = field.value ?? null;
                const choices = getRevealThresholdChoices(value);

                return (
                  // Responsive for the same reason as the vote options row:
                  // the select would crush the label beside it on a narrow
                  // field group.
                  <Field
                    orientation="responsive"
                    className="@md/field-group:gap-2 gap-4"
                  >
                    <SettingIcon>
                      <EyeIcon />
                    </SettingIcon>
                    <FieldContent>
                      <FieldLabel htmlFor="reveal-responses">
                        <Trans
                          i18nKey="revealResponsesTitle"
                          defaults="Reveal responses"
                        />
                      </FieldLabel>
                      <FieldDescription>
                        <Trans
                          i18nKey="revealResponsesDescription"
                          defaults="Show everyone's responses before the poll is closed or finalized, once enough people have responded."
                        />
                      </FieldDescription>
                    </FieldContent>
                    <div>
                      <Select
                        items={{
                          [REVEAL_WHEN_CLOSED]: (
                            <RevealThresholdLabel threshold={null} />
                          ),
                          ...Object.fromEntries(
                            choices.map((count) => [
                              String(count),
                              <RevealThresholdLabel
                                key={count}
                                threshold={count}
                              />,
                            ]),
                          ),
                        }}
                        value={
                          value === null ? REVEAL_WHEN_CLOSED : String(value)
                        }
                        onValueChange={(next) => {
                          if (!next) {
                            return;
                          }
                          field.onChange(
                            next === REVEAL_WHEN_CLOSED ? null : Number(next),
                          );
                        }}
                      >
                        <SelectTrigger id="reveal-responses">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={REVEAL_WHEN_CLOSED}>
                            <RevealThresholdLabel threshold={null} />
                          </SelectItem>
                          {choices.map((count) => (
                            <SelectItem key={count} value={String(count)}>
                              <RevealThresholdLabel threshold={count} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                );
              }}
            />
          ) : null}
          <FormField
            control={form.control}
            name="enableComments"
            render={({ field }) => (
              <Field orientation="horizontal">
                <SettingIcon>
                  <MessageCircleIcon />
                </SettingIcon>
                <FieldContent>
                  <FieldLabel htmlFor="enable-comments">
                    <Trans i18nKey="commentsSettingTitle" defaults="Comments" />
                  </FieldLabel>
                  <FieldDescription>
                    <Trans
                      i18nKey="commentsSettingDescription"
                      defaults="Allow participants to post public comments on the poll."
                    />
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="enable-comments"
                  checked={!!field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    posthog?.capture("poll_settings:comments_toggle_click", {
                      enabled: checked,
                    });
                  }}
                />
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="allowTentativeVotes"
            render={({ field }) => {
              // Only turning the option off is locked, matching the server
              // guard: that is the direction that would strand existing
              // tentative votes. Turning it back on is always allowed, so a
              // poll already set to yes/no stays switchable even while it
              // still holds tentative votes cast earlier.
              const isLocked = hasTentativeVotes && !!field.value;

              return (
                // Responsive rather than horizontal: the select is far wider
                // than a switch, so below the field group's @md breakpoint it
                // stacks under the label instead of crushing it to one word
                // per line.
                <Field
                  orientation="responsive"
                  className="@md/field-group:gap-2 gap-4"
                >
                  <SettingIcon>
                    <ListChecksIcon />
                  </SettingIcon>
                  <FieldContent>
                    <FieldLabel htmlFor="vote-options">
                      <Trans
                        i18nKey="voteOptionsSettingTitle"
                        defaults="Vote options"
                      />
                    </FieldLabel>
                    <FieldDescription>
                      {isLocked ? (
                        <Trans
                          i18nKey="voteOptionsLockedDescription"
                          defaults={
                            'Locked: participants have already answered "if need be".'
                          }
                        />
                      ) : (
                        <Trans
                          i18nKey="voteOptionsSettingDescription"
                          defaults="The answers participants can give for each option."
                        />
                      )}
                    </FieldDescription>
                  </FieldContent>
                  {/* A choice between two answer sets rather than a toggle: the
                    setting removes an answer rather than enabling a feature, so
                    a switch would have to ship pre-enabled to keep existing
                    polls unchanged, unlike every other switch in this card. */}
                  {/* The wrapper takes the responsive orientation's `*:w-full`
                    so the select inside sizes to its content rather than
                    stretching across the row when stacked. */}
                  <div>
                    <Select
                      items={{
                        yesIfNeedBeNo: (
                          <VoteOptionLabel types={["yes", "ifNeedBe", "no"]} />
                        ),
                        yesNo: <VoteOptionLabel types={["yes", "no"]} />,
                      }}
                      disabled={isLocked}
                      value={field.value ? "yesIfNeedBeNo" : "yesNo"}
                      onValueChange={(value) => {
                        if (!value) {
                          return;
                        }
                        const allowTentativeVotes = value === "yesIfNeedBeNo";
                        field.onChange(allowTentativeVotes);
                        posthog?.capture("poll_settings:vote_options_change", {
                          allow_tentative_votes: allowTentativeVotes,
                        });
                      }}
                    >
                      <SelectTrigger id="vote-options">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yesIfNeedBeNo">
                          <VoteOptionLabel types={["yes", "ifNeedBe", "no"]} />
                        </SelectItem>
                        <SelectItem value="yesNo">
                          <VoteOptionLabel types={["yes", "no"]} />
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
              );
            }}
          />
        </FieldGroup>
      </CardContent>
      {children}
    </Card>
  );
};
