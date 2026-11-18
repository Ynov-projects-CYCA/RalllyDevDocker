"use client";
/**
 * Manage what the user can and cannot see on the page
 */
import React from "react";
import {
  useParticipants,
  usePermissions,
  usePoll,
} from "@/features/poll/client";
import type { ResponseVisibility } from "@/features/poll/types";

export const IfScoresVisible = (props: React.PropsWithChildren) => {
  const context = React.useContext(VisibilityContext);

  if (context.canSeeScores) {
    return <>{props.children}</>;
  }

  return null;
};

export const useVisibility = () => {
  return React.useContext(VisibilityContext);
};

/**
 * The default serves the host's pages, which mount no provider: they read
 * every response, so nothing is withheld from them.
 */
const VisibilityContext = React.createContext<{
  canSeeScores: boolean;
  responseVisibility: ResponseVisibility;
}>({
  canSeeScores: true,
  responseVisibility: { hidden: false },
});

export const useVisibleParticipants = () => {
  const { canSeeScores } = useVisibility();
  const { canEditParticipant } = usePermissions();
  const { participants } = useParticipants();

  const filteredParticipants = React.useMemo(() => {
    if (!canSeeScores) {
      return participants.filter((participant) =>
        canEditParticipant(participant.id),
      );
    }
    return participants;
  }, [canEditParticipant, canSeeScores, participants]);

  return filteredParticipants;
};

/**
 * `responseVisibility` comes from the loader, which has already left hidden
 * responses out of the participant list: what remains is the viewer's own,
 * so a tally of it would pass one person's votes off as the room's.
 */
export const VisibilityProvider = ({
  responseVisibility,
  children,
}: React.PropsWithChildren<{ responseVisibility: ResponseVisibility }>) => {
  const poll = usePoll();
  const { participants } = useParticipants();
  const { canEditParticipant } = usePermissions();
  const userAlreadyVoted = participants.some((participant) => {
    return canEditParticipant(participant.id);
  });

  const canSeeScores =
    !responseVisibility.hidden && (poll.hideScores ? userAlreadyVoted : true);

  return (
    <VisibilityContext.Provider
      value={{
        canSeeScores,
        responseVisibility,
      }}
    >
      {children}
    </VisibilityContext.Provider>
  );
};
