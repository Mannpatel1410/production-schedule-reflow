import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { addWorkingMinutes } from "../src/utils/date-utils";

const shifts = [
  { dayOfWeek: 1, startHour: 8, endHour: 17 }, // Monday
  { dayOfWeek: 2, startHour: 8, endHour: 17 },
  { dayOfWeek: 3, startHour: 8, endHour: 17 },
  { dayOfWeek: 4, startHour: 8, endHour: 17 },
  { dayOfWeek: 5, startHour: 8, endHour: 17 },
];

describe("addWorkingMinutes", () => {

  it("handles shift spanning", () => {
    const start = DateTime.fromISO("2024-08-12T16:00:00Z", { zone: "utc" });
    const result = addWorkingMinutes(start, 120, shifts, []);
    expect(result.end.toUTC().toISO()).toBe("2024-08-13T09:00:00.000Z");
  });

  it("skips maintenance window", () => {
    const start = DateTime.fromISO("2024-08-14T10:00:00Z");
    const maintenance = [{
      start: DateTime.fromISO("2024-08-14T11:00:00Z"),
      end: DateTime.fromISO("2024-08-14T14:00:00Z")
    }];

    const result = addWorkingMinutes(start, 240, shifts, maintenance);
    expect(result.end.toUTC().toISO()).toBe("2024-08-14T17:00:00.000Z");
  });

});