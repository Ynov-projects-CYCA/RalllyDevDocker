import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@/test/test-utils";
import {
  ExpiredOptionLabel,
  OptionExpirationProvider,
  prepareVotesForSubmission,
  useOptionExpiration,
} from "./option-expiration";
import { VoteSegmentedControl } from "./vote-segmented-control";
import { VoteSelector } from "./vote-selector";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("submission expiration guard", () => {
  const options = [{ id: "past" }, { id: "future" }];
  const expired = (id: string) => id === "past";

  it("removes a newly expired selection but preserves the future selection by id", () => {
    expect(
      prepareVotesForSubmission(
        options,
        [
          { optionId: "future", type: "ifNeedBe" },
          { optionId: "past", type: "yes" },
        ],
        [],
        expired,
      ),
    ).toEqual({
      changed: true,
      hasFuture: true,
      votes: [{ optionId: "future", type: "ifNeedBe" }],
    });
  });

  it.each([
    "yes",
    "no",
    "ifNeedBe",
  ] as const)("retains the historical %s without refusing an edit to a future option", (type) => {
    const saved = [{ optionId: "past", type }];
    expect(
      prepareVotesForSubmission(
        options,
        [...saved, { optionId: "future", type: "yes" }],
        saved,
        expired,
      ),
    ).toEqual({
      changed: false,
      hasFuture: true,
      votes: [...saved, { optionId: "future", type: "yes" }],
    });
  });

  it("restores a changed historical vote and requires review", () => {
    expect(
      prepareVotesForSubmission(
        options,
        [{ optionId: "past", type: "no" }],
        [{ optionId: "past", type: "yes" }],
        expired,
      ),
    ).toMatchObject({
      changed: true,
      votes: [
        { optionId: "past", type: "yes" },
        { optionId: "future", type: "no" },
      ],
    });
  });

  it("does not manufacture a historical no for an unanswered expired option", () => {
    expect(
      prepareVotesForSubmission(
        options,
        [{ optionId: "past", type: "no" }],
        [],
        expired,
      ),
    ).toEqual({
      changed: false,
      hasFuture: true,
      votes: [{ optionId: "future", type: "no" }],
    });
  });

  it("refuses a response when no future option remains", () => {
    expect(prepareVotesForSubmission(options, [], [], () => true)).toEqual({
      changed: false,
      hasFuture: false,
      votes: [],
    });
  });
});

function Controls({ onChange }: { onChange: () => void }) {
  const { isExpired } = useOptionExpiration();
  const expired = isExpired("option");
  return (
    <>
      <VoteSelector
        optionLabel="Desktop"
        value="yes"
        disabled={expired}
        onChange={onChange}
      />
      <VoteSegmentedControl
        optionLabel="Mobile"
        value="yes"
        disabled={expired}
        onChange={onChange}
      />
      {expired ? <ExpiredOptionLabel /> : null}
      <button
        type="button"
        onClick={() => {
          if (!isExpired("option")) onChange();
        }}
      >
        Guarded click
      </button>
    </>
  );
}

describe("live expired controls", () => {
  const start = new Date("2026-10-26T12:00:00Z");
  const renderControls = (onChange: () => void) =>
    render(
      <OptionExpirationProvider
        options={[{ id: "option", startTime: start, duration: 60 }]}
        pollTimeZone="Europe/Paris"
      >
        <Controls onChange={onChange} />
      </OptionExpirationProvider>,
    );

  it("uses the server's UTC boundary for floating dates, independent of the device zone", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T23:00:00Z"));
    render(
      <OptionExpirationProvider
        options={[
          {
            id: "option",
            startTime: new Date("2026-10-26T00:00:00Z"),
            duration: 0,
          },
        ]}
        pollTimeZone={null}
      >
        <Controls onChange={vi.fn()} />
      </OptionExpirationProvider>,
    );
    expect(screen.getByRole("button", { name: /Desktop/ })).not.toBeDisabled();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    fireEvent(window, new Event("focus"));
    expect(screen.getByRole("button", { name: /Desktop/ })).toBeDisabled();
  });

  it("disables click and keyboard interaction and retains the recorded yes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderControls(onChange);
    const desktop = screen.getByRole("button", { name: /Desktop.*expired/i });
    expect(desktop).toBeDisabled();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    await user.click(desktop);
    await user.click(screen.getByRole("radio", { name: "No" }));
    await user.tab();
    await user.keyboard("{ArrowRight}{Enter} ");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Time slot expired")).toBeVisible();
  });

  it("keeps future options interactive, then disables them on the running page", () => {
    vi.useFakeTimers();
    vi.setSystemTime(start.getTime() - 1000);
    const onChange = vi.fn();
    renderControls(onChange);
    expect(screen.getByRole("button", { name: /Desktop/ })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Desktop/ }));
    expect(onChange).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: /Desktop/ })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toHaveAttribute("aria-disabled", "true");
  });

  it("checks the clock at click time even before the refresh timer runs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(start.getTime() - 1);
    const onChange = vi.fn();
    renderControls(onChange);
    vi.setSystemTime(start);
    fireEvent.click(screen.getByRole("button", { name: "Guarded click" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(window, new Event("focus"));
    expect(screen.getByRole("button", { name: /Desktop/ })).toBeDisabled();
  });
});
