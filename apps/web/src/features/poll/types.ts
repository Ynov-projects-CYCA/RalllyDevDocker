import type { PollConferencing } from "@/features/conferencing/schema";
import type { VoteType } from "@/features/poll/constants";
import type { PollClosedReason, PollStatus } from "@/features/poll/schema";
import type { SpaceTier } from "@/features/space/schema";

export type PollUnavailableReason = "deleted" | "removed";

export type PollDetails = {
  id: string;
  title: string;
  location: string | null;
  conferencing: PollConferencing | null;
  description: string | null;
  createdAt: Date;
  status: PollStatus;
  closedReason: PollClosedReason | null;
  hideParticipants: boolean;
  disableComments: boolean;
  allowTentativeVotes: boolean;
  hideScores: boolean;
  /** Withholds everyone else's responses from participants; see getResponseVisibility. */
  hideResponses: boolean;
  /** Responses that reveal hidden ones early; null until the poll stops taking responses. */
  responseRevealThreshold: number | null;
  requireParticipantEmail: boolean;
  muted: boolean;
  timeZone: string | null;
  userId: string | null;
  spaceId: string | null;
  options: { id: string; startTime: Date; duration: number }[];
  user: { id: string; name: string; image: string | null } | null;
  space: {
    name: string;
    image: string | null;
    tier: SpaceTier;
    showBranding: boolean;
    hideAttribution: boolean;
    primaryColor: string | null;
  } | null;
  event: {
    id: string;
    start: Date;
    duration: number;
    status: string;
    conferencingUri: string | null;
  } | null;
  inviteLink: string;
  oidcEnabled?: boolean;
};

export type Vote = { optionId: string; type: VoteType };

/**
 * Whether a participant may see everyone else's responses. While hidden,
 * the server sends only the viewer's own, plus what the page needs to say
 * when the rest will appear.
 */
export type ResponseVisibility =
  | { hidden: false }
  | {
      hidden: true;
      /** Responses given so far, the viewer's own included. */
      responseCount: number;
      /** Responses that reveal them early; null until the poll stops taking responses. */
      revealThreshold: number | null;
    };

export type PollParticipant = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  note: string | null;
  image: string | null;
  createdAt: Date;
  votes: Vote[];
  /** Identity withheld from this viewer (hidden participants setting). */
  hidden: boolean;
  /** The response's edit link; only the host's list carries it. */
  editUrl: string | null;
};

export type PollComment = {
  id: string;
  content: string;
  authorName: string;
  userId: string | null;
  createdAt: Date;
};
