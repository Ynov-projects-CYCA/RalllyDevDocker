import { Dialog, DialogContent } from "@rallly/ui/dialog";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@/test/test-utils";
import { NewParticipantForm } from "./new-participant-modal";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), guest: vi.fn() }));
vi.mock("@rallly/posthog/client", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/features/poll/client", () => ({ usePollOrNull: () => null }));
vi.mock("@/features/user/client", () => ({
  useUser: () => ({ user: null, createGuestIfNeeded: mocks.guest }),
}));
vi.mock("@/components/environment", () => ({ IfCloudHosted: () => null }));
vi.mock("./mutations", () => ({
  useAddParticipant: () => ({ execute: mocks.execute }),
  useEditToken: () => "invite-token",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("anonymous response expiration", () => {
  it("revalidates after awaiting the guest session and shows an error instead of success", async () => {
    let resolveGuest!: (result: { ok: true }) => void;
    mocks.guest.mockReturnValue(
      new Promise((resolve) => {
        resolveGuest = resolve;
      }),
    );
    const votes = [{ optionId: "option", type: "yes" as const }];
    const getVotes = vi
      .fn<() => typeof votes | null>()
      .mockReturnValueOnce(votes)
      .mockReturnValue(null);
    render(
      <Dialog open>
        <DialogContent>
          <NewParticipantForm pollId="poll" votes={votes} getVotes={getVotes} />
        </DialogContent>
      </Dialog>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /^name$/i }), {
      target: { value: "Guest" },
    });
    await act(async () => {
      fireEvent.submit(
        document.getElementById("new-participant-form") as HTMLFormElement,
      );
    });
    expect(mocks.guest).toHaveBeenCalledOnce();
    await act(async () => {
      resolveGuest({ ok: true });
    });
    expect(getVotes).toHaveBeenCalledTimes(2);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(screen.getByText(/Some time slots have expired/)).toBeVisible();
    expect(
      screen.queryByText("Your response has been saved"),
    ).not.toBeInTheDocument();
  });
});
