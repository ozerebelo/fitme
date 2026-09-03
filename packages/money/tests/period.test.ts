import { describe, expect, it } from "vitest";
import {
  addMonths,
  addMonthsToDate,
  monthEnd,
  monthRange,
  periodBounds,
  periodOf,
  periodProgress,
} from "../src/index";

describe("months", () => {
  it("wraps the year", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-02", -3)).toBe("2025-11");
  });

  it("knows how long February is", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });

  it("lists a range inclusively", () => {
    expect(monthRange("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("clamps a date to a day the month has, without the clamp sticking", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2026-01-31", 2)).toBe("2026-03-31");
  });
});

describe("budgeting periods", () => {
  it("is the calendar month by default", () => {
    const period = periodBounds("2026-03", 1);
    expect(period.start).toBe("2026-03-01");
    expect(period.end).toBe("2026-03-31");
    expect(period.days).toBe(31);
  });

  it("shifts for someone paid on the 25th", () => {
    const period = periodBounds("2026-01", 25);
    expect(period.start).toBe("2026-01-25");
    expect(period.end).toBe("2026-02-24");
    expect(period.days).toBe(31);
  });

  it("files a date before the start day in the previous period", () => {
    expect(periodOf("2026-02-20", 25).key).toBe("2026-01");
    expect(periodOf("2026-02-25", 25).key).toBe("2026-02");
  });

  it("measures progress through the period", () => {
    const period = periodBounds("2026-04", 1);
    expect(periodProgress(period, "2026-04-15")).toBeCloseTo(0.5, 1);
    expect(periodProgress(period, "2026-04-30")).toBe(1);
    expect(periodProgress(period, "2026-03-30")).toBe(0);
  });
});
