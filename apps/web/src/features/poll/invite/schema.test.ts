import { describe, expect, it } from "vitest";
import { sendPollInviteSchema } from "./schema";

const invitation = {
  pollId: "poll-1",
  email: "alice@example.com",
  recipientName: "Alice",
};

describe("personalized poll invitations", () => {
  it("normalizes the address, first name and optional message", () => {
    expect(
      sendPollInviteSchema.parse({
        ...invitation,
        email: "  Alice@Example.com ",
        recipientName: " Alice ",
        message: " See you soon!\nBring your ideas. ",
      }),
    ).toEqual({
      ...invitation,
      message: "See you soon!\nBring your ideas.",
    });
  });

  it("allows an invitation without a personal message", () => {
    expect(sendPollInviteSchema.safeParse(invitation).success).toBe(true);
  });

  it.each([
    { recipientName: "   " },
    { recipientName: "a".repeat(101) },
    { email: "invalid-address" },
    { message: "a".repeat(1001) },
  ])("rejects invalid invitation fields: %j", (fields) => {
    expect(
      sendPollInviteSchema.safeParse({ ...invitation, ...fields }).success,
    ).toBe(false);
  });
});
