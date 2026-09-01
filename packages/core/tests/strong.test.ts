import { describe, expect, it } from "vitest";
import {
  createExerciseMatcher,
  detectDelimiter,
  guessWeightUnit,
  importStrongCsv,
  parseCsv,
  parseStrongDuration,
  EXERCISES,
} from "../src/index";

const HEADER =
  '"Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Reps","Distance","Seconds","Notes","Workout Notes","RPE"';

const row = (
  date: string,
  workout: string,
  exercise: string,
  order: string,
  weight: string,
  reps: string,
  extra: { seconds?: string; distance?: string; rpe?: string } = {},
): string =>
  `"${date}","${workout}","1h 5min","${exercise}","${order}","${weight}","${reps}","${extra.distance ?? ""}","${extra.seconds ?? "0"}","","","${extra.rpe ?? ""}"`;

const SAMPLE = [
  HEADER,
  row("2024-05-01 18:00:00", "Push", "Bench Press (Barbell)", "1", "60", "8"),
  row("2024-05-01 18:00:00", "Push", "Bench Press (Barbell)", "2", "60", "8", { rpe: "8" }),
  row("2024-05-01 18:00:00", "Push", "Overhead Press (Barbell)", "1", "40", "10"),
  row("2024-05-03 18:00:00", "Pull", "Lat Pulldown (Cable)", "1", "70", "10"),
  row("2024-05-03 18:00:00", "Pull", "Bicep Curl (Dumbbell)", "1", "12", "12"),
].join("\n");

describe("CSV parsing", () => {
  it("detects the delimiter", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("handles quoted fields containing the delimiter", () => {
    const rows = parseCsv('name,note\n"Squat, Barbell","said ""go"""');
    expect(rows[0]!.name).toBe("Squat, Barbell");
    expect(rows[0]!.note).toBe('said "go"');
  });

  it("strips a UTF-8 BOM and tolerates CRLF", () => {
    const rows = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.a).toBe("1");
  });
});

describe("Strong duration parsing", () => {
  it("reads the formats Strong emits", () => {
    expect(parseStrongDuration("1h 5min")).toBe(65);
    expect(parseStrongDuration("45min")).toBe(45);
    expect(parseStrongDuration("2h")).toBe(120);
    expect(parseStrongDuration("")).toBe(0);
  });
});

describe("exercise matching", () => {
  const matcher = createExerciseMatcher(EXERCISES);

  it("matches Strong's `Movement (Equipment)` naming", () => {
    expect(matcher.match("Bench Press (Barbell)")?.id).toBe("bench-press-barbell");
    expect(matcher.match("Lat Pulldown (Cable)")?.id).toBe("lat-pulldown");
    expect(matcher.match("Squat (Barbell)")?.id).toBe("back-squat");
  });

  it("matches regardless of word order", () => {
    expect(matcher.match("barbell bench press")?.id).toBe("bench-press-barbell");
  });

  it("does not collapse distinct variations into each other", () => {
    expect(matcher.match("Incline Bench Press (Barbell)")?.id).toBe("incline-bench-barbell");
  });

  it("returns null for something genuinely unknown", () => {
    expect(matcher.match("Zercher Anderson Squat off Pins")).toBeNull();
  });
});

describe("weight unit inference", () => {
  it("reads heavy round numbers as pounds", () => {
    expect(guessWeightUnit([135, 185, 225, 275, 315, 225, 245])).toBe("lb");
  });

  it("defaults to kilograms for typical metric loading", () => {
    expect(guessWeightUnit([60, 62.5, 65, 70, 72.5, 80])).toBe("kg");
  });
});

describe("Strong import", () => {
  it("groups rows into sessions", () => {
    const result = importStrongCsv(SAMPLE);
    expect(result.stats.sessionsNew).toBe(2);
    expect(result.stats.setsImported).toBe(5);
    expect(result.sessions[0]!.date).toBe("2024-05-01");
    expect(result.sessions[0]!.name).toBe("Push");
    expect(result.sessions[0]!.sets).toHaveLength(3);
    expect(result.stats.dateRange).toEqual({ from: "2024-05-01", to: "2024-05-03" });
  });

  it("resolves exercise names against the catalog", () => {
    const result = importStrongCsv(SAMPLE);
    expect(result.sessions[0]!.sets[0]!.exerciseId).toBe("bench-press-barbell");
    expect(result.unmatched).toHaveLength(0);
    expect(result.newExercises).toHaveLength(0);
  });

  it("carries RPE through when present", () => {
    const result = importStrongCsv(SAMPLE);
    expect(result.sessions[0]!.sets[1]!.rpe).toBe(8);
    expect(result.sessions[0]!.sets[0]!.rpe).toBeUndefined();
  });

  it("computes a session duration from the Duration column", () => {
    const session = importStrongCsv(SAMPLE).sessions[0]!;
    const minutes =
      (new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime()) / 60000;
    expect(minutes).toBe(65);
  });

  it("is idempotent — re-importing the same export adds nothing", () => {
    const first = importStrongCsv(SAMPLE);
    const ids = first.sessions.map((s) => s.externalId!);
    const second = importStrongCsv(SAMPLE, { existingExternalIds: ids });
    expect(second.stats.sessionsNew).toBe(0);
    expect(second.stats.sessionsDuplicate).toBe(2);
    expect(second.sessions).toHaveLength(0);
  });

  it("adds only the new sessions from a later export", () => {
    const later = [SAMPLE, row("2024-06-01 18:00:00", "Push", "Bench Press (Barbell)", "1", "65", "8")].join("\n");
    const ids = importStrongCsv(SAMPLE).sessions.map((s) => s.externalId!);
    const result = importStrongCsv(later, { existingExternalIds: ids });
    expect(result.stats.sessionsNew).toBe(1);
    expect(result.sessions[0]!.date).toBe("2024-06-01");
  });

  it("reads semicolon-delimited exports", () => {
    const semi = SAMPLE.replace(/","/g, '";"').replace(/^"/gm, '"');
    const result = importStrongCsv(semi);
    expect(result.stats.sessionsNew).toBe(2);
  });

  it("converts pounds to kilograms when told to", () => {
    const result = importStrongCsv(SAMPLE, { weightUnit: "lb" });
    expect(result.sessions[0]!.sets[0]!.weightKg).toBeCloseTo(27.22, 1);
    expect(result.stats.detectedUnit).toBe("lb");
  });

  it("skips rest-timer rows and marks warmups", () => {
    const csv = [
      HEADER,
      row("2024-05-01 18:00:00", "Push", "Bench Press (Barbell)", "Rest Timer", "0", "0"),
      row("2024-05-01 18:00:00", "Push", "Bench Press (Barbell)", "W1", "40", "10"),
      row("2024-05-01 18:00:00", "Push", "Bench Press (Barbell)", "1", "60", "8"),
    ].join("\n");
    const result = importStrongCsv(csv);
    expect(result.sessions[0]!.sets).toHaveLength(2);
    expect(result.sessions[0]!.sets[0]!.isWarmup).toBe(true);
    expect(result.sessions[0]!.sets[1]!.isWarmup).toBeUndefined();
    expect(result.stats.rowsSkipped).toBe(1);
  });

  it("keeps unknown exercises rather than dropping the history", () => {
    const csv = [
      HEADER,
      row("2024-05-01 18:00:00", "Arms", "Spider Curl (Cable)", "1", "20", "12"),
    ].join("\n");
    const result = importStrongCsv(csv);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.sourceName).toBe("Spider Curl (Cable)");
    expect(result.newExercises[0]!.primary).toContain("biceps");
    expect(result.sessions[0]!.sets[0]!.sourceExerciseName).toBe("Spider Curl (Cable)");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("turns cardio rows into cardio logs with an energy estimate", () => {
    const csv = [
      HEADER,
      row("2024-05-05 08:00:00", "Cardio", "Running", "1", "0", "0", { seconds: "1800", distance: "5" }),
    ].join("\n");
    const result = importStrongCsv(csv, { bodyWeightKg: 80 });
    expect(result.stats.cardioImported).toBe(1);
    const cardio = result.sessions[0]!.cardio[0]!;
    expect(cardio.minutes).toBe(30);
    expect(cardio.distanceKm).toBe(5);
    expect(cardio.kcal).toBeGreaterThan(300);
  });

  it("rejects a file that is not a Strong export", () => {
    const result = importStrongCsv("foo,bar\n1,2");
    expect(result.sessions).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/Strong export/);
  });

  it("marks imported sessions as read-only Strong data", () => {
    const session = importStrongCsv(SAMPLE).sessions[0]!;
    expect(session.source).toBe("strong");
    expect(session.externalId).toContain("strong:");
    expect(session.importedAt).toBeTruthy();
  });
});
