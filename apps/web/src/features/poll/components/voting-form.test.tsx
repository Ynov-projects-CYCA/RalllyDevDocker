import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoteForm } from "@/features/poll/vote/components/vote-form";
import { VoteViewCalendar } from "@/features/poll/vote/components/vote-view-calendar";
import { VoteViewList } from "@/features/poll/vote/components/vote-view-list";
import { VoteViewWeek } from "@/features/poll/vote/components/vote-view-week";
import type { VotePageView } from "@/features/poll/vote/types";
import { act, cleanup, fireEvent, render, screen } from "@/test/test-utils";
import { OptionExpirationProvider } from "./option-expiration";
import { VotingForm } from "./voting-form";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  error: vi.fn(),
  create: vi.fn(),
}));
const start = new Date("2026-10-26T12:00:00Z");
const options = [
  { id: "soon", startTime: start, duration: 60 },
  { id: "later", startTime: new Date("2026-10-27T12:00:00Z"), duration: 60 },
];
const historical = [{ optionId: "soon", type: "yes" as const }];

vi.mock("@rallly/posthog/client", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@rallly/ui/sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@rallly/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./mutations", () => ({
  normalizeVotes: (ids: string[], votes: { type?: string }[]) =>
    ids.map((optionId, i) => ({ optionId, type: votes[i]?.type ?? "no" })),
  useEditToken: () => "existing-edit-token",
  useUpdateParticipantVotes: () => ({ execute: mocks.execute }),
}));
vi.mock("@/features/poll/client", () => ({
  usePoll: () => ({ id: "poll", timeZone: "Europe/Paris", options }),
  useParticipants: () => ({
    participants: [{ id: "participant", votes: historical }],
  }),
  usePermissions: () => ({
    canAddNewParticipant: true,
    canEditParticipant: () => false,
  }),
  useRole: () => "participant",
}));
vi.mock("./new-participant-modal", () => ({
  NewParticipantForm: ({ getVotes }: { getVotes: () => unknown }) => (
    <button
      type="button"
      onClick={() => {
        const votes = getVotes();
        if (votes) mocks.create(votes);
      }}
    >
      Confirm new response
    </button>
  ),
}));

function Draft({ edit, formId }: { edit: boolean; formId: string }) {
  const form = useFormContext();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          form.setValue("mode", edit ? "edit" : "new");
          form.setValue("participantId", edit ? "participant" : undefined);
          form.setValue("votes", [
            { optionId: "soon", type: "yes" },
            { optionId: "later", type: "ifNeedBe" },
          ]);
        }}
      >
        Compose
      </button>
      <button type="submit" form={formId}>
        Submit
      </button>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start.getTime() - 1000);
  mocks.execute.mockReset().mockResolvedValue({ ok: true });
  mocks.error.mockReset();
  mocks.create.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each([
  "legacy",
  "new",
] as const)("%s participation form", (surface) => {
  const mount = (edit = false) => {
    const formId = surface === "legacy" ? "voting-form" : "vote-form";
    const child = <Draft edit={edit} formId={formId} />;
    render(
      surface === "legacy" ? (
        <VotingForm>{child}</VotingForm>
      ) : (
        <OptionExpirationProvider options={options} pollTimeZone="Europe/Paris">
          <VoteForm
            pollId="poll"
            tier="hobby"
            requireParticipantEmail={false}
            results={options.map((o) => ({
              ...o,
              optionId: o.id,
              score: null,
            }))}
            response={
              edit
                ? {
                    participantId: "participant",
                    name: "Guest",
                    image: null,
                    votes: historical,
                  }
                : null
            }
            canVote
          >
            {child}
          </VoteForm>
        </OptionExpirationProvider>
      ),
    );
    fireEvent.click(screen.getByText("Compose"));
    return async () => {
      await act(async () => {
        fireEvent.submit(document.getElementById(formId) as HTMLFormElement);
      });
    };
  };

  it("rechecks at submit without waiting for the visual timer, then allows a reviewed response", async () => {
    const submit = mount();
    vi.setSystemTime(start);
    await submit();
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(screen.queryByText("Confirm new response")).not.toBeInTheDocument();
    await submit();
    fireEvent.click(screen.getByText("Confirm new response"));
    expect(mocks.create).toHaveBeenCalledWith([
      { optionId: "later", type: "ifNeedBe" },
    ]);
  });

  it("rechecks when the new-response modal is already open", async () => {
    const submit = mount();
    await submit();
    vi.setSystemTime(start);
    fireEvent.click(screen.getByText("Confirm new response"));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledOnce();
  });

  it("preserves historical yes and the edit token when saving future changes", async () => {
    const submit = mount(true);
    vi.setSystemTime(start);
    await submit();
    expect(mocks.execute).toHaveBeenCalledWith({
      participantId: "participant",
      token: "existing-edit-token",
      votes: [...historical, { optionId: "later", type: "ifNeedBe" }],
    });
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("refuses to submit when all options expire", async () => {
    const submit = mount();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    await submit();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });

  it("shows the server's expiration refusal as a business error", async () => {
    const submit = mount(true);
    mocks.execute.mockResolvedValueOnce({
      ok: false,
      reason: "expiredOptions",
    });
    await submit();
    expect(mocks.error).toHaveBeenCalledWith(
      "Some time slots have expired. Please review your response before saving.",
    );
  });
});

describe.each([
  "list",
  "week",
  "calendar",
] as const)("%s voting view", (view) => {
  it("keeps expired options visible and inert while future options remain selectable", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(start);
    const poll: VotePageView["poll"] = {
      id: "poll",
      title: "Poll",
      description: null,
      location: null,
      conferencing: null,
      status: "open",
      closedReason: null,
      allowTentativeVotes: true,
      timeZone: view === "calendar" ? null : "Europe/Paris",
      userId: null,
      spaceId: null,
      requireParticipantEmail: false,
      user: null,
      space: null,
      event: null,
    };
    const results = options.map((o) => ({
      ...o,
      optionId: o.id,
      duration: view === "calendar" ? 0 : o.duration,
      score: null,
    }));
    const props = {
      poll,
      results,
      participantCount: 0,
      response: null,
      canVote: true,
    };
    render(
      <OptionExpirationProvider options={results} pollTimeZone={poll.timeZone}>
        <VoteForm
          pollId="poll"
          tier="hobby"
          requireParticipantEmail={false}
          results={results}
          response={null}
          canVote
        >
          {view === "list" ? (
            <VoteViewList {...props} />
          ) : view === "week" ? (
            <VoteViewWeek {...props} />
          ) : (
            <VoteViewCalendar {...props} />
          )}
        </VoteForm>
      </OptionExpirationProvider>,
    );
    expect(screen.getByText("Time slot expired")).toBeVisible();
    if (view === "calendar") {
      expect(
        screen.getByText("Time slot expired").closest("button"),
      ).toBeDisabled();
      const futureDay = screen.getByRole("button", { name: /October 27/ });
      act(() => futureDay.focus());
      expect(futureDay).toHaveFocus();
      act(() => vi.advanceTimersByTime(1000));
      expect(futureDay).toHaveFocus();
    } else {
      const groups = screen.getAllByRole("radiogroup");
      expect(groups[0]).toHaveAttribute("aria-disabled", "true");
      expect(groups[1]).not.toHaveAttribute("aria-disabled", "true");
      const futureYes = groups[1].querySelector(
        '[role="radio"][aria-label="Yes"]',
      );
      fireEvent.click(futureYes as Element);
      expect(futureYes).toHaveAttribute("aria-checked", "true");
    }
  });
});
