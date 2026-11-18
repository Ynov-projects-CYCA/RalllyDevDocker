-- AlterTable
ALTER TABLE "polls" ADD COLUMN "hide_responses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "response_reveal_threshold" INTEGER;

-- A threshold only means something while responses are hidden, and one below
-- 2 would reveal the first response to nobody but its own author. The upper
-- bound matches MAX_PARTICIPANTS in apps/web/src/features/poll/constants.ts.
-- Every existing row has a null threshold, so the constraint cannot fail.
ALTER TABLE "polls"
  ADD CONSTRAINT "polls_response_reveal_threshold_check"
    CHECK (
      response_reveal_threshold IS NULL
      OR (hide_responses AND response_reveal_threshold BETWEEN 2 AND 1000)
    );
