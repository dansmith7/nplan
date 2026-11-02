import { describe, expect, it } from "bun:test";
import {
  SOURCE_ACCOUNT,
  ORGANIZER,
  verifyGoogleAccount,
  fetchGoogleEvents,
  normalizeGoogleEvents,
  type GoogleEvent,
} from "./core";
const from = "2026-11-01T00:00:00Z",
  to = "2027-05-01T00:00:00Z";
const event: GoogleEvent = {
  id: "google-1",
  summary: "Синк",
  organizer: { email: ORGANIZER },
  start: { dateTime: "2026-11-04T15:00:00+03:00" },
  end: { dateTime: "2026-11-04T16:00:00+03:00" },
  htmlLink: "https://calendar.google.com/calendar/event?eid=test",
};
const mock = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
describe("Google Calendar one-way sync", () => {
  it("allows only the verified calendar owner", async () => {
    await expect(
      verifyGoogleAccount(
        "token",
        mock({ email: SOURCE_ACCOUNT, verified_email: true })
      )
    ).resolves.toBeUndefined();
    await expect(
      verifyGoogleAccount(
        "token",
        mock({ email: "other@example.com", verified_email: true })
      )
    ).rejects.toMatchObject({ code: "wrong_google_account" });
    await expect(
      verifyGoogleAccount(
        "token",
        mock({ email: SOURCE_ACCOUNT, verified_email: false })
      )
    ).rejects.toMatchObject({ code: "wrong_google_account" });
  });
  it("imports only Alisa's active timed meetings and excludes declined invitations", () => {
    const items = [
      event,
      { ...event, id: "other", organizer: { email: "other@example.com" } },
      { ...event, id: "cancel", status: "cancelled" },
      {
        ...event,
        id: "decline",
        attendees: [{ self: true, responseStatus: "declined" }],
      },
      {
        ...event,
        id: "all-day",
        start: { date: "2026-11-04" },
        end: { date: "2026-11-05" },
      },
    ];
    expect(normalizeGoogleEvents(items, from, to)).toHaveLength(1);
    expect(
      normalizeGoogleEvents(
        [{ ...event, organizer: { email: ORGANIZER.toUpperCase() } }],
        from,
        to
      )
    ).toHaveLength(1);
  });
  it("preserves one-off identity across time/title changes", () => {
    const first = normalizeGoogleEvents([event], from, to)[0]!;
    const moved = normalizeGoogleEvents(
      [
        {
          ...event,
          summary: "Новое название",
          start: { dateTime: "2026-11-05T11:00:00+03:00" },
          end: { dateTime: "2026-11-05T12:00:00+03:00" },
        },
      ],
      from,
      to
    )[0]!;
    expect(moved.source_id).toBe(first.source_id);
    expect(moved.starts_at).toBe("2026-11-05T08:00:00.000Z");
  });
  it("uses original occurrence time when a single instance is moved", () => {
    const recurring = {
      ...event,
      recurringEventId: "series",
      originalStartTime: { dateTime: event.start!.dateTime },
    };
    const first = normalizeGoogleEvents([recurring], from, to)[0]!;
    const moved = normalizeGoogleEvents(
      [
        {
          ...recurring,
          id: "changed-google-id",
          start: { dateTime: "2026-11-05T12:00:00Z" },
          end: { dateTime: "2026-11-05T13:00:00Z" },
        },
      ],
      from,
      to
    )[0]!;
    const next = normalizeGoogleEvents(
      [
        {
          ...recurring,
          originalStartTime: { dateTime: "2026-11-11T12:00:00Z" },
        },
      ],
      from,
      to
    )[0]!;
    expect(first.source_id).toBe(moved.source_id);
    expect(next.source_id).not.toBe(first.source_id);
  });
  it("rejects malformed or duplicate identities instead of deleting existing data", () => {
    expect(() => normalizeGoogleEvents([event, event], from, to)).toThrow();
    expect(() =>
      normalizeGoogleEvents(
        [{ ...event, end: { dateTime: "invalid" } }],
        from,
        to
      )
    ).toThrow();
  });
  it("collects all pages before returning a snapshot", async () => {
    const urls: string[] = [];
    const request = (async (url: URL | string) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify(
          urls.length === 1
            ? { items: [event], nextPageToken: "second" }
            : { items: [{ ...event, id: "second-event" }] }
        )
      );
    }) as typeof fetch;
    expect(await fetchGoogleEvents("token", from, to, request)).toHaveLength(2);
    expect(urls[0]).toContain(encodeURIComponent(SOURCE_ACCOUNT));
    expect(urls[0]).toContain("singleEvents=true");
    expect(urls[1]).toContain("pageToken=second");
  });
  it("rejects a failed second page instead of using a partial snapshot", async () => {
    let n = 0;
    const request = (async () =>
      ++n === 1
        ? new Response(
            JSON.stringify({ items: [event], nextPageToken: "second" })
          )
        : new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(
      fetchGoogleEvents("token", from, to, request)
    ).rejects.toMatchObject({ code: "google_calendar_unavailable" });
  });
  it("protects against looping pagination", async () => {
    await expect(
      fetchGoogleEvents(
        "token",
        from,
        to,
        mock({ items: [], nextPageToken: "same" })
      )
    ).rejects.toMatchObject({ code: "google_snapshot_incomplete" });
  });
  it("preserves useful meeting details without HTML markup", () => {
    const result = normalizeGoogleEvents(
      [
        {
          ...event,
          description: "<b>План</b><br>Обсудить &amp; решить",
          location: "310",
          hangoutLink: "https://meet.google.com/test",
        },
      ],
      from,
      to
    )[0]!;
    expect(result.description).toContain("План\nОбсудить & решить");
    expect(result.description).toContain("Место: 310");
    expect(result.description).toContain("https://meet.google.com/test");
  });
});
