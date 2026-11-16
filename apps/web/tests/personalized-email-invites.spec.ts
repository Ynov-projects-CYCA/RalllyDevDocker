import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";
import { captureOne } from "@rallly/test-helpers";
import { NewPollPage } from "./new-poll-page";
import {
  createUserInDb,
  loginWithEmail,
  upgradeSpaceToPro,
} from "./test-utils";

test("sends a named invitation with an optional personal message", async ({
  page,
  browser,
}) => {
  const suffix = Date.now();
  const hostEmail = `personal-invite-host-${suffix}@example.com`;
  const recipientEmail = `personal-invite-alice-${suffix}@example.com`;
  const otherEmail = `personal-invite-bob-${suffix}@example.com`;
  const title = `Personalized invitation ${suffix}`;
  const message = "Bring your ideas for the Docker project!\nSee you soon.";

  const host = await createUserInDb({ email: hostEmail, name: "Paul" });
  try {
    const space = await prisma.space.findFirstOrThrow({
      where: { ownerId: host.id },
    });
    await upgradeSpaceToPro({ spaceId: space.id, userId: host.id, seats: 1 });
    await loginWithEmail(page, { email: hostEmail });
    const newPoll = new NewPollPage(page);
    await newPoll.goto();
    await newPoll.create({ name: title });

    const dialog = page.getByRole("dialog", { name: "Share" });
    const nameField = dialog.getByLabel("Recipient's first name");
    const emailField = dialog.getByLabel("Email address");
    const messageField = dialog.getByLabel("Personal message (optional)");
    const sendButton = dialog.getByRole("button", { name: /Send invite/ });

    await emailField.fill(recipientEmail);
    await sendButton.click();
    await expect(nameField).toHaveAttribute("aria-invalid", "true");
    await nameField.fill("Alice");
    await emailField.fill("invalid-email");
    await sendButton.click();
    await expect(emailField).toHaveAttribute("aria-invalid", "true");

    await emailField.fill(recipientEmail);
    await messageField.fill(message);
    await sendButton.click();
    const row = dialog
      .getByRole("listitem")
      .filter({ hasText: recipientEmail });
    await expect(row.getByText("Sent")).toBeVisible();
    const { email } = await captureOne(recipientEmail);
    expect(email.HTML).toContain("Alice");
    expect(email.Text.replace(/\r\n/g, "\n")).toContain(message);
    expect(email.Subject).toBe(`Paul invited you to respond to ${title}`);
    await expect(nameField).toHaveValue("");
    await expect(messageField).toHaveValue("");

    const inviteUrl = email.HTML.match(
      /href="([^"]*\/invite\/[^"]*token=[^"]*)"/,
    )?.[1];
    expect(inviteUrl).toBeTruthy();
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto((inviteUrl as string).replace(/&amp;/g, "&"));
      await expect(
        guestPage.getByRole("heading", { name: title }),
      ).toBeVisible();
    } finally {
      await guest.close();
    }

    await nameField.fill("Bob");
    await emailField.fill(otherEmail);
    await sendButton.click();
    const { email: withoutMessage } = await captureOne(otherEmail);
    expect(withoutMessage.HTML).toContain("Bob");
    expect(withoutMessage.Text).not.toContain(message);
  } finally {
    await prisma.user.delete({ where: { id: host.id } });
  }
});
