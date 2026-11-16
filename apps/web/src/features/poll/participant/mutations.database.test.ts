import { randomUUID } from "node:crypto";
// biome-ignore lint/style/noRestrictedImports: Integration test verifies real database transactions.
import { prisma } from "@rallly/database";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { VoteType } from "@/features/poll/constants";
import { addParticipant, updateParticipantVotes } from "./mutations";

// Real PostgreSQL transactions, rows and activity writes. Only framework
// revalidation and external dispatch are stubbed; no database methods are mocked.
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/features/poll/mutations", () => ({ revalidatePollPages: vi.fn() }));
vi.mock("@/features/webhook/mutations", () => ({
  scheduleWebhookDispatch: vi.fn(),
}));

// Opt in so ordinary unit tests do not need a running PostgreSQL instance.
// From apps/web: RUN_DATABASE_TESTS=1 pnpm exec dotenv -e .env -- vitest run src/features/poll/participant/mutations.database.test.ts
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "participant vote writes in PostgreSQL",
  () => {
    const now = new Date("2026-10-26T12:00:00Z");
    let userId: string;
    let pollId: string;
    let past: string;
    let future: string;
    let exact: string;

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const user = await prisma.user.create({
        data: {
          name: "Vote validation test",
          email: `${randomUUID()}@example.test`,
          isAnonymous: true,
        },
      });
      userId = user.id;
      pollId = `past-vote-test-${randomUUID()}`;
      const poll = await prisma.poll.create({
        data: {
          id: pollId,
          userId,
          title: "Past vote validation",
          kind: "time",
          timeZone: "Europe/Paris",
          options: {
            create: [
              { startTime: new Date("2026-10-25T12:00:00Z"), duration: 60 },
              { startTime: new Date("2026-10-27T12:00:00Z"), duration: 60 },
              { startTime: now, duration: 60 },
            ],
          },
        },
        include: { options: { orderBy: { startTime: "asc" } } },
      });
      [past, exact, future] = poll.options.map((o) => o.id);
    });

    afterEach(async () => {
      try {
        if (pollId) await prisma.poll.deleteMany({ where: { id: pollId } });
        if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      } finally {
        vi.useRealTimers();
      }
    });
    afterAll(() => prisma.$disconnect());

    const create = (
      votes: { optionId: string; type: VoteType }[],
      timeZone = "Europe/Paris",
    ) =>
      addParticipant({
        pollId,
        userId,
        name: "Guest",
        locale: "en",
        timeZone,
        votes,
      });
    const seedResponse = (votes: { optionId: string; type: VoteType }[]) =>
      prisma.participant.create({
        data: {
          pollId,
          userId,
          name: "Existing guest",
          token: randomUUID(),
          votes: { create: votes.map((vote) => ({ ...vote, pollId })) },
        },
      });
    const edit = (
      participantId: string,
      votes: { optionId: string; type: VoteType }[],
    ) =>
      updateParticipantVotes({
        pollId,
        participantId,
        actorUserId: userId,
        votes,
      });

    it.each([
      "yes",
      "ifNeedBe",
    ] as const)("refuses fraudulent expired %s atomically, even mixed with future votes", async (type) => {
      expect(
        await create([
          { optionId: past, type },
          { optionId: future, type: "yes" },
        ]),
      ).toEqual({ ok: false, reason: "expiredOptions" });
      expect(await prisma.participant.count({ where: { pollId } })).toBe(0);
      expect(await prisma.vote.count({ where: { pollId } })).toBe(0);
      expect(await prisma.pollActivity.count({ where: { pollId } })).toBe(0);
    });

    it("accepts valid future availability and records it in the database", async () => {
      const result = await create([{ optionId: future, type: "yes" }]);
      expect(result.ok).toBe(true);
      expect(
        await prisma.vote.findMany({
          where: { pollId },
          select: { optionId: true, type: true },
        }),
      ).toEqual([{ optionId: future, type: "yes" }]);
    });

    it.each([
      ["earlier today", "2026-10-26T11:00:00Z", false],
      ["later today", "2026-10-26T13:00:00Z", true],
      ["same instant east", "2026-10-26T13:00:00+01:00", false],
      ["same instant west", "2026-10-26T08:00:00-04:00", false],
    ])("validates the database start for %s", async (_label, start, allowed) => {
      await prisma.option.update({
        where: { id: exact },
        data: { startTime: new Date(start) },
      });
      const result = await create([{ optionId: exact, type: "yes" }]);
      if (allowed) expect(result.ok).toBe(true);
      else expect(result).toEqual({ ok: false, reason: "expiredOptions" });
      expect(
        await prisma.vote.count({ where: { pollId, optionId: exact } }),
      ).toBe(allowed ? 1 : 0);
    });

    it("does not create historical rows for expired no votes", async () => {
      expect(
        (
          await create([
            { optionId: past, type: "no" },
            { optionId: future, type: "ifNeedBe" },
          ])
        ).ok,
      ).toBe(true);
      expect(
        await prisma.vote.count({ where: { pollId, optionId: past } }),
      ).toBe(0);
    });

    it("expires at the exact start, rather than the end", async () => {
      expect(await create([{ optionId: exact, type: "yes" }])).toEqual({
        ok: false,
        reason: "expiredOptions",
      });
    });

    it("ignores forged client dates and time zones", async () => {
      const vote = {
        optionId: past,
        type: "yes" as const,
        startTime: new Date("2099-01-01T00:00:00Z"),
        duration: 0,
      };
      expect(await create([vote], "Pacific/Honolulu")).toEqual({
        ok: false,
        reason: "expiredOptions",
      });
    });

    it.each([
      0, 60,
    ])("uses UTC for floating options (duration %s), regardless of the submitted zone", async (duration) => {
      await prisma.poll.update({
        where: { id: pollId },
        data: { timeZone: null },
      });
      await prisma.option.update({
        where: { id: exact },
        data: { startTime: new Date("2026-10-26T00:00:00Z"), duration },
      });
      vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
      expect(
        await create([{ optionId: exact, type: "yes" }], "Pacific/Honolulu"),
      ).toEqual({ ok: false, reason: "expiredOptions" });
    });

    it.each([
      "yes",
      "no",
      "ifNeedBe",
    ] as const)("retains expired %s rows verbatim while updating future choices", async (type) => {
      const participant = await seedResponse([
        { optionId: past, type },
        { optionId: future, type: "no" },
      ]);
      const before = await prisma.vote.findMany({
        where: { participantId: participant.id, optionId: past },
      });
      expect(
        await edit(participant.id, [
          { optionId: past, type },
          { optionId: future, type: "yes" },
        ]),
      ).toEqual({ ok: true });
      expect(
        await prisma.vote.findMany({
          where: { participantId: participant.id, optionId: past },
        }),
      ).toEqual(before);
      expect(
        await prisma.vote.findFirst({
          where: { participantId: participant.id, optionId: future },
        }),
      ).toMatchObject({ type: "yes" });
    });

    it("retains omitted history and does not silently turn an old yes into no", async () => {
      const participant = await seedResponse([{ optionId: past, type: "yes" }]);
      const before = await prisma.vote.findMany({
        where: { participantId: participant.id, optionId: past },
      });
      for (const votes of [
        [{ optionId: future, type: "yes" as const }],
        [
          { optionId: past, type: "no" as const },
          { optionId: future, type: "ifNeedBe" as const },
        ],
      ]) {
        expect(await edit(participant.id, votes)).toEqual({ ok: true });
        expect(
          await prisma.vote.findMany({
            where: { participantId: participant.id, optionId: past },
          }),
        ).toEqual(before);
      }
    });

    it.each([
      "yes",
      "ifNeedBe",
    ] as const)("refuses absent/no to expired %s without deleting any rows", async (type) => {
      for (const history of [[], [{ optionId: past, type: "no" as const }]]) {
        const participant = await seedResponse([
          ...history,
          { optionId: future, type: "no" },
        ]);
        const before = await prisma.vote.findMany({
          where: { participantId: participant.id },
          orderBy: { id: "asc" },
        });
        expect(
          await edit(participant.id, [
            { optionId: past, type },
            { optionId: future, type: "yes" },
          ]),
        ).toEqual({ ok: false, reason: "expiredOptions" });
        expect(
          await prisma.vote.findMany({
            where: { participantId: participant.id },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
      }
    });

    it("refuses changing an expired tentative vote into yes", async () => {
      const participant = await seedResponse([
        { optionId: past, type: "ifNeedBe" },
      ]);
      expect(
        await edit(participant.id, [{ optionId: past, type: "yes" }]),
      ).toEqual({ ok: false, reason: "expiredOptions" });
    });

    it("preserves historical tentative votes when the setting is disabled, but refuses new future ones", async () => {
      const participant = await seedResponse([
        { optionId: past, type: "ifNeedBe" },
      ]);
      await prisma.poll.update({
        where: { id: pollId },
        data: { allowTentativeVotes: false },
      });
      expect(
        await edit(participant.id, [
          { optionId: past, type: "ifNeedBe" },
          { optionId: future, type: "yes" },
        ]),
      ).toEqual({ ok: true });
      expect(
        await edit(participant.id, [{ optionId: future, type: "ifNeedBe" }]),
      ).toEqual({ ok: false, reason: "tentativeVotesNotAllowed" });
    });

    it.each([
      "closed",
      "scheduled",
      "canceled",
    ] as const)("keeps the existing %s poll refusal", async (status) => {
      const participant = await seedResponse([]);
      await prisma.poll.update({ where: { id: pollId }, data: { status } });
      expect(await create([{ optionId: future, type: "yes" }])).toEqual({
        ok: false,
        reason: "closed",
      });
      expect(
        await edit(participant.id, [{ optionId: future, type: "yes" }]),
      ).toEqual({ ok: false, reason: "closed" });
    });

    it("checks expiration after a concurrent poll-row lock is released", async () => {
      let locked!: () => void;
      let release!: () => void;
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.setSystemTime(now.getTime() - 1);
      const blocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
        locked();
        await hold;
      });
      await acquired;
      const write = create([{ optionId: exact, type: "yes" }]);
      try {
        // Prove the request is actually waiting, rather than just launching
        // two promises that might execute in either order.
        await expect
          .poll(async () => {
            const [row] = await prisma.$queryRaw<{ count: number }[]>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE wait_event_type = 'Lock'
              AND query LIKE '%SELECT status, deleted, allow_tentative_votes, time_zone%'
          `;
            return row.count;
          })
          .toBeGreaterThan(0);
        vi.setSystemTime(now);
      } finally {
        release();
        await blocker;
      }
      expect(await write).toEqual({ ok: false, reason: "expiredOptions" });
      expect(await prisma.vote.count({ where: { pollId } })).toBe(0);
    });

    it("reads concurrent changes to historical votes after acquiring the poll lock", async () => {
      const participant = await seedResponse([{ optionId: past, type: "yes" }]);
      let locked!: () => void;
      let release!: () => void;
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
        await tx.vote.updateMany({
          where: { participantId: participant.id, optionId: past },
          data: { type: "no" },
        });
        locked();
        await hold;
      });
      await acquired;
      const write = edit(participant.id, [
        { optionId: past, type: "yes" },
        { optionId: future, type: "yes" },
      ]);
      release();
      await blocker;
      expect(await write).toEqual({ ok: false, reason: "expiredOptions" });
      expect(
        await prisma.vote.findMany({
          where: { participantId: participant.id },
          select: { optionId: true, type: true },
        }),
      ).toEqual([{ optionId: past, type: "no" }]);
    });
  },
);
