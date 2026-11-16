import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { previewChrome } from "../components/preview-chrome";
import PollInviteEmail from "./poll-invite";

const baseProps = {
  hostName: "Paul",
  pollTitle: "Team meeting",
  inviteUrl: "https://example.com/invite/poll-1?token=personal-token",
  chrome: previewChrome,
};

describe("personalized poll invitation email", () => {
  it("includes the first name, personal message and voting link", async () => {
    const html = await render(
      await PollInviteEmail({
        ...baseProps,
        recipientName: "Alice",
        message: "Bring your ideas!\nSee you soon.",
      }),
    );
    expect(html).toContain("Alice");
    expect(html).toContain("Bring your ideas!\nSee you soon.");
    expect(html).toContain("white-space:pre-wrap");
    expect(html).toContain(`href="${baseProps.inviteUrl}"`);
  });

  it("escapes recipient input instead of interpreting it as HTML", async () => {
    const html = await render(
      await PollInviteEmail({
        ...baseProps,
        recipientName: "<b>Alice</b>",
        message: '<script>alert("xss")</script>',
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Alice</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Alice&lt;/b&gt;");
  });

  it("supports existing callers without personalization", async () => {
    const html = await render(await PollInviteEmail(baseProps));
    expect(html).not.toContain("border-left");
    expect(html).toContain(`href="${baseProps.inviteUrl}"`);
  });

  it("preserves message line breaks in the plain text email", async () => {
    const text = await render(
      await PollInviteEmail({
        ...baseProps,
        recipientName: "Alice",
        message: "Bring your ideas!\nSee you soon.",
      }),
      { plainText: true },
    );
    expect(text).toContain("Bring your ideas!\nSee you soon.");
  });
});
