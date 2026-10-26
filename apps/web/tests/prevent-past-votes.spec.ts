import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";
import { createTestPoll, createUserInDb, fromNow } from "./test-utils";

let pollId: string;
let ownerId: string;
let optionIds: string[];
const guestIds = new Set<string>();

test.beforeEach(async () => {
  const owner = await createUserInDb({
    name: "Past vote fixture",
    email: `${randomUUID()}@example.test`,
    isAnonymous: true,
  });
  ownerId = owner.id;
  pollId = `past-votes-${randomUUID()}`;
  await createTestPoll({
    id: pollId,
    title: "Past vote test",
    userId: ownerId,
    updatedAt: new Date(),
  });
  await prisma.poll.update({
    where: { id: pollId },
    data: { timeZone: "UTC", kind: "time", muted: true },
  });
  const options = await prisma.option.createManyAndReturn({
    data: [-24, -1, 1, 24].map((hours) => ({
      pollId,
      startTime: fromNow({ hours }),
      duration: 60,
    })),
  });
  optionIds = options
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .map((o) => o.id);
});

test.afterEach(async ({ page }) => {
  const response = await page.request.get("/api/better-auth/get-session");
  if (response.ok()) {
    const session = await response.json();
    if (session?.user?.isAnonymous) guestIds.add(session.user.id);
  }
  const participants = await prisma.participant.findMany({
    where: { pollId },
    select: { userId: true },
  });
  for (const participant of participants)
    if (participant.userId) guestIds.add(participant.userId);
  await prisma.poll.deleteMany({ where: { id: pollId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, ...guestIds] }, isAnonymous: true },
  });
  guestIds.clear();
});

async function choose(control: Locator) {
  if ((await control.getAttribute("role")) === "radiogroup") {
    await control.getByRole("radio", { name: "Yes", exact: true }).click();
  } else {
    await control.click();
  }
}

async function openResponse(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("vote-selector")).toHaveCount(4);
}

for (const suffix of ["", "/vote"]) {
  for (const width of [375, 1280]) {
    test(`anonymous mixed poll ${suffix || "/invite"} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openResponse(page, `/invite/${pollId}${suffix}`);
      const controls = page.getByTestId("vote-selector");
      for (const index of [0, 1]) {
        const control = controls.nth(index);
        if ((await control.getAttribute("role")) === "radiogroup") {
          await expect(control).toHaveAttribute("aria-disabled", "true");
          for (const radio of await control.getByRole("radio").all())
            await expect(radio).toHaveAttribute("tabindex", "-1");
        } else {
          await expect(control).toBeDisabled();
        }
      }
      await choose(controls.nth(2));
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByPlaceholder("Jessie Smith").fill("Anonymous voter");
      await page.getByRole("button", { name: "Save availability" }).click();
      await expect(page.getByText("Your response has been saved")).toBeVisible({
        timeout: 15000,
      });
      const participant = await prisma.participant.findFirstOrThrow({
        where: { pollId },
        include: { votes: true, user: true },
      });
      expect(participant.user?.isAnonymous).toBe(true);
      expect(
        participant.votes
          .filter((v) => v.type === "yes")
          .map((v) => v.optionId),
      ).toEqual([optionIds[2]]);
      expect(
        participant.votes.some((v) =>
          optionIds.slice(0, 2).includes(v.optionId),
        ),
      ).toBe(false);
    });
  }

  test(`expiration while composing ${suffix || "/invite"} refuses submit`, async ({
    page,
  }) => {
    await page.clock.install();
    await openResponse(page, `/invite/${pollId}${suffix}`);
    await choose(page.getByTestId("vote-selector").nth(2));
    await page.clock.fastForward(2 * 60 * 60 * 1000);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText(/Some time slots have expired/)).toBeVisible();
    await expect(page.getByPlaceholder("Jessie Smith")).toHaveCount(0);
    expect(await prisma.participant.count({ where: { pollId } })).toBe(0);
  });

  test(`token edit preserves history ${suffix || "/invite"}`, async ({
    page,
  }) => {
    const token = randomUUID();
    const participant = await prisma.participant.create({
      data: {
        pollId,
        userId: ownerId,
        name: "Previous voter",
        token,
        votes: {
          create: [
            { pollId, optionId: optionIds[0], type: "yes" },
            { pollId, optionId: optionIds[1], type: "no" },
            { pollId, optionId: optionIds[2], type: "no" },
          ],
        },
      },
    });
    const history = await prisma.vote.findMany({
      where: {
        participantId: participant.id,
        optionId: { in: optionIds.slice(0, 2) },
      },
      orderBy: { id: "asc" },
    });
    await page.goto(`/invite/${pollId}${suffix}?token=${token}`);
    if (suffix)
      await page.getByRole("button", { name: "Edit", exact: true }).click();
    else {
      await page.getByTestId("participant-menu").click();
      await page.getByRole("menuitem", { name: "Edit votes" }).click();
    }
    await expect(page.getByTestId("vote-selector")).toHaveCount(4);
    await choose(page.getByTestId("vote-selector").nth(2));
    const sentRequest = page.waitForRequest(
      (request) =>
        !!request.headers()["next-action"] &&
        !!request.postData()?.includes(participant.id),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const sent = await sentRequest;
    await expect
      .poll(() =>
        prisma.vote
          .findFirst({
            where: { participantId: participant.id, optionId: optionIds[2] },
          })
          .then((v) => v?.type),
      )
      .toBe("yes");
    expect(
      await prisma.vote.findMany({
        where: {
          participantId: participant.id,
          optionId: { in: optionIds.slice(0, 2) },
        },
        orderBy: { id: "asc" },
      }),
    ).toEqual(history);
    const activityCount = await prisma.pollActivity.count({
      where: { pollId },
    });
    const forbidden = await page.request.post(sent.url(), {
      headers: sent.headers(),
      data: sent.postData()?.replaceAll(token, randomUUID()),
    });
    expect(await forbidden.text()).toContain("FORBIDDEN");
    expect(await prisma.pollActivity.count({ where: { pollId } })).toBe(
      activityCount,
    );
  });
}

test("direct malicious HTTP action request cannot create past availability", async ({
  page,
}) => {
  await openResponse(page, `/invite/${pollId}/vote`);
  await choose(page.getByTestId("vote-selector").nth(2));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Jessie Smith").fill("Malicious request");
  let replayed = false;
  await page.route("**/invite/**", async (route) => {
    const request = route.request();
    const body = request.postData();
    if (request.headers()["next-action"] && body?.includes(optionIds[2])) {
      replayed = true;
      // Replay through the HTTP client, bypassing all frontend controls.
      const response = await page.request.post(request.url(), {
        headers: request.headers(),
        data: body.replaceAll(optionIds[2], optionIds[0]),
      });
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(
    page.getByText(
      "Some time slots have expired. Please review your response before saving.",
    ),
  ).toBeVisible();
  expect(replayed).toBe(true);
  expect(await prisma.participant.count({ where: { pollId } })).toBe(0);
});
