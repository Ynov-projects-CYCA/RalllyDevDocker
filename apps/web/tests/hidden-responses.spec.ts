import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";
import { InvitePage } from "./invite-page";
import { NewPollPage } from "./new-poll-page";
import {
  createUserInDb,
  fromNow,
  loginWithEmail,
  upgradeSpaceToPro,
} from "./test-utils";

// Hidden responses are a server-side rule: a participant's page must not
// carry anyone else's response at all, not merely leave it off screen. So
// besides what is visible, these tests read the document the server sent,
// which includes the serialized props the client renders from.

test.describe.configure({ mode: "serial" });

const runId = Date.now().toString(36);
const createdUserIds: string[] = [];

let hostPage: Page;
let hostId: string;
let spaceId: string;
let pollCount = 0;

test.beforeAll(async ({ browser }) => {
  const email = `hidden-responses-host-${runId}@example.com`;
  const host = await createUserInDb({ email, name: "Poll Host" });
  createdUserIds.push(host.id);
  hostId = host.id;

  const space = await prisma.space.findFirstOrThrow({
    where: { ownerId: host.id },
  });
  spaceId = space.id;
  // Hiding responses is a Pro setting: a free space gets the pay wall.
  await upgradeSpaceToPro({ spaceId, userId: host.id, seats: 1 });

  hostPage = await browser.newPage();
  await loginWithEmail(hostPage, { email });
});

test.afterAll(async () => {
  await hostPage.close();
  // Polls cascade with their owner, responses with their poll.
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

async function createPoll({
  hideResponses = true,
  responseRevealThreshold = null,
}: {
  hideResponses?: boolean;
  responseRevealThreshold?: number | null;
} = {}) {
  pollCount += 1;
  return prisma.poll.create({
    data: {
      id: `hidden-responses-${runId}-${pollCount}`,
      title: "Board vote",
      userId: hostId,
      spaceId,
      kind: "time",
      timeZone: "Europe/London",
      hideResponses,
      responseRevealThreshold,
      options: {
        create: [1, 2, 3].map((days) => ({
          startTime: fromNow({ days, startOfHour: true }),
          duration: 60,
        })),
      },
    },
    include: { options: true },
  });
}

/**
 * The email is set too: participant rows show it next to the name, so it is
 * as much a part of the response as the votes.
 */
function emailFor(name: string) {
  return `${name.toLowerCase().replaceAll(" ", "-")}-${runId}@example.com`;
}

async function addResponse(
  poll: Awaited<ReturnType<typeof createPoll>>,
  name: string,
) {
  await prisma.participant.create({
    data: {
      name,
      email: emailFor(name),
      pollId: poll.id,
      token: randomUUID().replaceAll("-", ""),
      votes: {
        create: poll.options.map((option) => ({
          optionId: option.id,
          pollId: poll.id,
          type: "yes" as const,
        })),
      },
    },
  });
}

/** The document as served, serialized props included. */
async function servedDocument(page: Page) {
  const response = await page.reload();
  return (await response?.text()) ?? "";
}

test("a participant sees only their own response while the poll is open", async ({
  page,
}) => {
  const poll = await createPoll();
  await addResponse(poll, "Alice Hidden");

  await page.goto(`/invite/${poll.id}`);
  const notice = page.getByTestId("hidden-responses-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("once the poll is closed or finalized");
  await expect(notice).toContainText("1 person has responded so far");
  const before = await servedDocument(page);
  expect(before).not.toContain("Alice Hidden");
  expect(before).not.toContain(emailFor("Alice Hidden"));

  await new InvitePage(page).addParticipant("Bob Visible");

  await expect(page.getByText("Bob Visible").first()).toBeVisible();
  await expect(notice).toContainText("2 people have responded so far");
  const after = await servedDocument(page);
  expect(after).toContain("Bob Visible");
  expect(after).not.toContain("Alice Hidden");
  expect(after).not.toContain(emailFor("Alice Hidden"));
});

test("the host sees every response", async () => {
  const poll = await createPoll();
  await addResponse(poll, "Alice Hidden");
  await addResponse(poll, "Bob Visible");

  await hostPage.goto(`/poll/${poll.id}`);
  await expect(hostPage.getByText("Alice Hidden").first()).toBeVisible();
  await expect(hostPage.getByText("Bob Visible").first()).toBeVisible();
  await expect(hostPage.getByTestId("hidden-responses-notice")).toHaveCount(0);
});

test("responses are revealed once the poll is closed", async ({ page }) => {
  const poll = await createPoll();
  await addResponse(poll, "Alice Hidden");

  await page.goto(`/invite/${poll.id}`);
  await expect(page.getByTestId("hidden-responses-notice")).toBeVisible();

  await prisma.poll.update({
    where: { id: poll.id },
    data: { status: "closed", closedReason: "manual" },
  });

  await page.reload();
  await expect(page.getByTestId("hidden-responses-notice")).toHaveCount(0);
  // A closed poll folds its results away behind a button.
  await page.getByRole("button", { name: "View results" }).click();
  await expect(page.getByText("Alice Hidden").first()).toBeVisible();
});

test("responses are revealed early once the threshold is reached", async ({
  page,
}) => {
  const poll = await createPoll({ responseRevealThreshold: 2 });
  await addResponse(poll, "Alice Hidden");

  await page.goto(`/invite/${poll.id}`);
  const notice = page.getByTestId("hidden-responses-notice");
  await expect(notice).toContainText("once 2 people have responded");
  expect(await servedDocument(page)).not.toContain("Alice Hidden");

  // The second response is the viewer's own and reaches the threshold.
  await new InvitePage(page).addParticipant("Bob Visible");

  await expect(page.getByText("Alice Hidden").first()).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("the vote page withholds the tallies until responses are revealed", async ({
  page,
}) => {
  // The vote page shows no names, only tallies; with a single response a
  // tally is that response, so it is what has to stay off the page.
  const poll = await createPoll();
  await addResponse(poll, "Alice Hidden");
  const tally = page.getByText(/yes, \d+ if need be, of 1 responses/);

  await page.goto(`/invite/${poll.id}/vote`);
  await expect(page.getByTestId("hidden-responses-notice")).toBeVisible();
  await expect(tally).toHaveCount(0);

  await prisma.poll.update({
    where: { id: poll.id },
    data: { status: "closed", closedReason: "manual" },
  });

  await page.reload();
  await expect(page.getByTestId("hidden-responses-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "View results" }).click();
  await expect(tally.first()).toBeAttached();
});

test("the host can create a poll that hides responses", async () => {
  const newPollPage = new NewPollPage(hostPage);
  await newPollPage.goto();
  const pollPage = await newPollPage.create({
    name: "Hidden from the start",
    hideResponses: true,
  });
  await pollPage.closeShareDialog();

  const pollId = hostPage.url().match(/\/poll\/([^/?]+)/)?.[1];
  expect(pollId).toBeTruthy();
  await expect(
    prisma.poll.findUniqueOrThrow({
      where: { id: pollId },
      select: { hideResponses: true, responseRevealThreshold: true },
    }),
  ).resolves.toEqual({ hideResponses: true, responseRevealThreshold: null });
});

test("turning hiding off from the edit page clears the threshold", async () => {
  // The CHECK constraint rejects a threshold without hidden responses, so an
  // edit that only flips the switch must clear the stored threshold too.
  const poll = await createPoll({ responseRevealThreshold: 5 });

  await hostPage.goto(`/poll/${poll.id}/edit`);
  const toggle = hostPage.getByRole("switch", { name: /hide responses/i });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await hostPage.getByRole("button", { name: "Save changes" }).click();
  await hostPage.waitForURL(new RegExp(`/poll/${poll.id}$`));

  await expect(
    prisma.poll.findUniqueOrThrow({
      where: { id: poll.id },
      select: { hideResponses: true, responseRevealThreshold: true },
    }),
  ).resolves.toEqual({ hideResponses: false, responseRevealThreshold: null });

  const activity = await prisma.pollActivity.findFirstOrThrow({
    where: { pollId: poll.id, type: "poll_updated" },
  });
  expect(activity.payload).toEqual({
    changes: [{ field: "hideResponses", from: true }],
  });
});
