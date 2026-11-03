import { test, expect } from "bun:test";
import { reconcileGoogleEvents, ORGANIZER, type GoogleEvent } from "./core";
const from = "2026-11-01T00:00:00Z",
  to = "2027-05-01T00:00:00Z";
const tracked = [{ source_id: "stable", google_id: "google1" }];
const event: GoogleEvent = {
  id: "google1",
  organizer: { email: ORGANIZER },
  summary: "Урок",
  start: { dateTime: "2026-11-05T11:00:00+03:00" },
  end: { dateTime: "2026-11-05T12:00:00+03:00" },
};
test("identical snapshot needs no lookup and retains existing occurrence identity", async () => {
  const result = await reconcileGoogleEvents(
    [event],
    tracked,
    "unused",
    from,
    to,
    async () => {
      throw Error("unnecessary request");
    }
  );
  expect(result[0].source_id).toBe("stable");
  expect(result).toHaveLength(1);
});
test("a missing meeting moved beyond 180 days stays a moved meeting, never a cancellation", async () => {
  const moved = {
    ...event,
    start: { dateTime: "2027-08-01T11:00:00+03:00" },
    end: { dateTime: "2027-08-01T12:00:00+03:00" },
  };
  const result = await reconcileGoogleEvents(
    [],
    tracked,
    "unused",
    from,
    to,
    async () => Response.json(moved)
  );
  expect(result[0]).toMatchObject({
    source_id: "stable",
    starts_at: "2027-08-01T08:00:00.000Z",
  });
  expect(result[0]).not.toHaveProperty("cancelled");
});
test("confirmed cancelled event can have only an ID; missing details are not needed", async () => {
  const result = await reconcileGoogleEvents(
    [],
    tracked,
    "unused",
    from,
    to,
    async () => Response.json({ id: "google1", status: "cancelled" })
  );
  expect(result).toEqual([{ source_id: "stable", cancelled: true }]);
});
test("deleted known event is distinguished from temporary Google errors", async () => {
  for (const status of [404, 410])
    expect(
      await reconcileGoogleEvents(
        [],
        tracked,
        "unused",
        from,
        to,
        async () => new Response(null, { status })
      )
    ).toEqual([{ source_id: "stable", cancelled: true }]);
  await expect(
    reconcileGoogleEvents(
      [],
      tracked,
      "unused",
      from,
      to,
      async () => new Response(null, { status: 503 })
    )
  ).rejects.toThrow("google_missing_events_incomplete");
});
test("declining or leaving organizer scope is removed silently", async () => {
  const declined = {
    ...event,
    attendees: [{ self: true, responseStatus: "declined" }],
  };
  expect(
    await reconcileGoogleEvents(
      [declined],
      tracked,
      "unused",
      from,
      to,
      async () => {
        throw Error("unnecessary request");
      }
    )
  ).toEqual([]);
  expect(
    await reconcileGoogleEvents([], tracked, "unused", from, to, async () =>
      Response.json({ ...event, organizer: { email: "someone@example.com" } })
    )
  ).toEqual([]);
});
test("a malformed lookup aborts before any cancellation is applied", async () => {
  await expect(
    reconcileGoogleEvents([], tracked, "unused", from, to, async () =>
      Response.json({ ...event, id: "wrong" })
    )
  ).rejects.toThrow("google_event_identity_invalid");
});
