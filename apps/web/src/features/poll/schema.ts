import * as z from "zod";
import { MAX_PARTICIPANTS } from "@/features/poll/constants";

// Descriptions are Markdown pushed raw into the iCal DESCRIPTION. RFC 5545 sets
// no length limit; the binding constraint is Google Calendar, which caps the
// DESCRIPTION around 8192 chars. 8000 sits just under that and covers every
// existing poll — including long institutional event invites — so no real
// content is rejected.
export const MAX_POLL_TITLE_LENGTH = 255;
export const MAX_POLL_DESCRIPTION_LENGTH = 8000;

// Comment content ships in the new-comment notification email, so it must be
// bounded. Prod p90 is ~200 chars; legitimate long comments reach ~2000.
export const MAX_COMMENT_LENGTH = 2000;

// Flows into the email subject line.
export const MAX_COMMENT_AUTHOR_NAME_LENGTH = 100;

// Response notes ship in the new-participant notification email, so they must
// be bounded. A note is short context alongside a response, not discussion.
export const MAX_RESPONSE_NOTE_LENGTH = 500;

// A threshold of 1 would reveal the first response to its own author only,
// which is no reveal at all. Mirrored by the CHECK constraint on
// polls.response_reveal_threshold.
export const MIN_RESPONSE_REVEAL_THRESHOLD = 2;

/** How many responses reveal hidden responses early (see Poll.hideResponses). */
export const responseRevealThresholdSchema = z
  .int()
  .min(MIN_RESPONSE_REVEAL_THRESHOLD)
  .max(MAX_PARTICIPANTS);

export const pollStatusSchema = z.enum([
  "open",
  "closed",
  "scheduled",
  "canceled",
]);

export type PollStatus = z.infer<typeof pollStatusSchema>;

// Defined with the activity vocabulary, which records the reason; kept
// reachable from the poll schema for its other readers.
export {
  type PollClosedReason,
  pollClosedReasonSchema,
} from "@/features/activity/schema";

export const setPollMutedSchema = z.object({
  pollId: z.string(),
  muted: z.boolean(),
});
