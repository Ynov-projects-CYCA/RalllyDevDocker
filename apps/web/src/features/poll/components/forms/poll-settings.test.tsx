import { Form } from "@rallly/ui/form";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { showPayWall } from "@/features/billing/client";
import { PollSettingsForm } from "@/features/poll/components/forms/poll-settings";
import type { PollSettingsFormData } from "@/features/poll/components/forms/types";
import { render, screen } from "@/test/test-utils";

vi.mock("@rallly/posthog/client", () => ({
  posthog: { capture: vi.fn() },
}));

const billing = vi.hoisted(() => ({ isFree: false }));

vi.mock("@/features/billing/client", () => ({
  useIsFree: () => billing.isFree,
  showPayWall: vi.fn(),
}));

let submitted: PollSettingsFormData | undefined;

function TestForm({
  enableComments = false,
  allowTentativeVotes = true,
  hasTentativeVotes = false,
  hideResponses = false,
  responseRevealThreshold = null,
}: {
  enableComments?: boolean;
  allowTentativeVotes?: boolean;
  hasTentativeVotes?: boolean;
  hideResponses?: boolean;
  responseRevealThreshold?: number | null;
}) {
  const form = useForm<PollSettingsFormData>({
    defaultValues: {
      enableComments,
      allowTentativeVotes,
      requireParticipantEmail: false,
      hideParticipants: false,
      hideScores: false,
      hideResponses,
      responseRevealThreshold,
    },
  });
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          submitted = data;
        })}
      >
        <PollSettingsForm hasTentativeVotes={hasTentativeVotes} />
        <button type="submit">Save</button>
      </form>
    </Form>
  );
}

describe("PollSettingsForm comments setting", () => {
  it("shows comments off by default", () => {
    render(<TestForm />);
    expect(screen.getByRole("switch", { name: /comments/i })).not.toBeChecked();
  });

  it("can be switched on", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    const commentsSwitch = screen.getByRole("switch", { name: /comments/i });
    await user.click(commentsSwitch);
    expect(commentsSwitch).toBeChecked();
  });

  it("reflects polls that already have comments enabled", () => {
    render(<TestForm enableComments={true} />);
    expect(screen.getByRole("switch", { name: /comments/i })).toBeChecked();
  });
});

describe("PollSettingsForm vote options setting", () => {
  it("offers all three answers by default", () => {
    render(<TestForm />);
    expect(
      screen.getByRole("combobox", { name: /vote options/i }),
    ).toHaveTextContent(/if need be/i);
  });

  it("reflects polls that are already yes/no only", () => {
    render(<TestForm allowTentativeVotes={false} />);
    const trigger = screen.getByRole("combobox", { name: /vote options/i });
    expect(trigger).toHaveTextContent(/yes/i);
    expect(trigger).not.toHaveTextContent(/if need be/i);
  });

  it("can be changed to a plain yes/no poll", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    const trigger = screen.getByRole("combobox", { name: /vote options/i });
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Yes No" }));
    expect(trigger).toHaveTextContent(/yes/i);
    expect(trigger).not.toHaveTextContent(/if need be/i);
  });
});

describe("PollSettingsForm vote options lock", () => {
  it("stays editable while no response uses the tentative vote", () => {
    render(<TestForm />);
    expect(
      screen.getByRole("combobox", { name: /vote options/i }),
    ).not.toBeDisabled();
  });

  it("locks the answer set once a response uses the tentative vote", () => {
    render(<TestForm hasTentativeVotes={true} />);
    expect(
      screen.getByRole("combobox", { name: /vote options/i }),
    ).toBeDisabled();
  });

  it("stays editable on a yes/no poll that still holds tentative votes", () => {
    // Only turning the option off is locked. A poll already set to yes/no has
    // nothing left to strand, so switching it back on must stay available.
    render(<TestForm allowTentativeVotes={false} hasTentativeVotes={true} />);
    expect(
      screen.getByRole("combobox", { name: /vote options/i }),
    ).not.toBeDisabled();
  });

  it("says why it is locked", () => {
    render(<TestForm hasTentativeVotes={true} />);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});

describe("PollSettingsForm hidden responses setting", () => {
  const revealSelect = () =>
    screen.queryByRole("combobox", { name: /reveal responses/i });

  it("is off by default and offers no reveal choice", () => {
    render(<TestForm />);
    expect(
      screen.getByRole("switch", { name: /hide responses/i }),
    ).not.toBeChecked();
    expect(revealSelect()).not.toBeInTheDocument();
  });

  it("waits for the poll to be closed or finalized unless a threshold is picked", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("switch", { name: /hide responses/i }));
    expect(revealSelect()).toHaveTextContent(
      "When the poll is closed or finalized",
    );
  });

  // The count labels are ICU plurals, which the test i18n instance leaves
  // unformatted (intl-messageformat fails to load under Node), so options
  // are picked by position: "When the poll is closed or finalized"
  // first, then counts in ascending order.
  const openRevealOptions = async (
    user: ReturnType<typeof userEvent.setup>,
  ) => {
    await user.click(
      screen.getByRole("combobox", { name: /reveal responses/i }),
    );
    return screen.findAllByRole("option");
  };

  it("saves the threshold picked", async () => {
    const user = userEvent.setup();
    render(<TestForm hideResponses={true} />);
    const options = await openRevealOptions(user);
    expect(options).toHaveLength(5);
    await user.click(options[2]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toMatchObject({
      hideResponses: true,
      responseRevealThreshold: 5,
    });
  });

  it("lists a stored threshold that is not one of the presets", async () => {
    const user = userEvent.setup();
    render(<TestForm hideResponses={true} responseRevealThreshold={7} />);
    const options = await openRevealOptions(user);
    // 3, 5, 7, 10, 20: the stored count sits in order among the presets.
    expect(options).toHaveLength(6);
    await user.click(options[0]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toMatchObject({ responseRevealThreshold: null });
  });

  it("clears the threshold when hiding is turned off", async () => {
    const user = userEvent.setup();
    render(<TestForm hideResponses={true} responseRevealThreshold={10} />);
    await user.click(screen.getByRole("switch", { name: /hide responses/i }));
    expect(revealSelect()).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toMatchObject({
      hideResponses: false,
      responseRevealThreshold: null,
    });
  });

  it("opens the pay wall instead of turning on for a free space", async () => {
    billing.isFree = true;
    try {
      const user = userEvent.setup();
      render(<TestForm />);
      const toggle = screen.getByRole("switch", { name: /hide responses/i });
      await user.click(toggle);
      expect(showPayWall).toHaveBeenCalledWith({
        from: "poll-settings",
        setting: "hideResponses",
      });
      expect(toggle).not.toBeChecked();
    } finally {
      billing.isFree = false;
    }
  });
});
