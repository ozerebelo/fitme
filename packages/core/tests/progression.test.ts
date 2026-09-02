import { describe, expect, it } from "vitest";
import {
  DEFAULT_REP_RANGE_POLICY,
  EXERCISE_BY_ID,
  assessProgression,
  progressionBoard,
  progressionIncrement,
  readyToProgress,
  resolveRepRange,
} from "../src/index";
import { daysEnding, makeSession, makeSet } from "./helpers";

const days = daysEnding(40);
const today = days[days.length - 1]!;
const at = (n: number): string => days[days.length - n]!;

const bench = (date: string, weight: number, reps: number[], rpe?: number) =>
  makeSession(
    date,
    reps.map((r) => makeSet("bench-press-barbell", weight, r, rpe != null ? { rpe } : {})),
  );

const assess = (sessions: ReturnType<typeof bench>[], id = "bench-press-barbell") =>
  assessProgression(sessions, id, { asOf: today });

describe("rep ranges", () => {
  it("defaults compounds to 6–10, as most people actually train them", () => {
    expect(DEFAULT_REP_RANGE_POLICY.compound).toEqual([6, 10]);
    expect(resolveRepRange(EXERCISE_BY_ID.get("bench-press-barbell"), DEFAULT_REP_RANGE_POLICY))
      .toEqual([6, 10]);
  });

  it("gives isolation work a higher range", () => {
    expect(resolveRepRange(EXERCISE_BY_ID.get("lateral-raise-dumbbell"), DEFAULT_REP_RANGE_POLICY))
      .toEqual([10, 15]);
  });

  it("lets a per-exercise override win", () => {
    const policy = { ...DEFAULT_REP_RANGE_POLICY, overrides: { "back-squat": [3, 5] as [number, number] } };
    expect(resolveRepRange(EXERCISE_BY_ID.get("back-squat"), policy)).toEqual([3, 5]);
  });
});

describe("increments", () => {
  it("uses bigger jumps for lower-body compounds", () => {
    expect(progressionIncrement(EXERCISE_BY_ID.get("back-squat"), 100, "metric")).toBe(5);
    expect(progressionIncrement(EXERCISE_BY_ID.get("bench-press-barbell"), 80, "metric")).toBe(2.5);
  });

  it("uses the smallest jump for isolation work", () => {
    expect(progressionIncrement(EXERCISE_BY_ID.get("lateral-raise-dumbbell"), 12, "metric")).toBe(1.25);
  });

  it("never adds more than about a tenth of a light load", () => {
    // 5 kg onto a 20 kg lift would be a 25 % jump.
    const inc = progressionIncrement(EXERCISE_BY_ID.get("back-squat"), 20, "metric");
    expect(inc).toBeLessThanOrEqual(2);
  });
});

describe("the question: should the weight go up?", () => {
  it("says yes when every set reached the top of the range", () => {
    const status = assess([bench(at(3), 80, [10, 10, 10], 8)]);
    expect(status.state).toBe("ready");
    expect(status.suggestedWeightKg).toBe(82.5);
    expect(status.suggestedReps).toBe(6);
    expect(status.headline).toMatch(/Add weight/);
    expect(status.detail).toMatch(/10, 10, 10/);
  });

  it("says no when the last set fell short", () => {
    const status = assess([bench(at(3), 80, [10, 10, 8], 8)]);
    expect(status.state).toBe("building");
    expect(status.suggestedWeightKg).toBe(80);
    expect(status.suggestedReps).toBe(9);
    expect(status.headline).toMatch(/Chase 9 reps/);
  });

  it("holds when the reps were there but the effort was maximal", () => {
    const status = assess([bench(at(3), 80, [10, 10, 10], 9.5)]);
    expect(status.state).toBe("building");
    expect(status.suggestedWeightKg).toBe(80);
    expect(status.detail).toMatch(/close to maximal/);
  });

  it("progresses on the best set alone when strictness is relaxed", () => {
    const sessions = [bench(at(3), 80, [10, 9, 8], 8)];
    expect(assess(sessions).state).toBe("building");
    const relaxed = assessProgression(sessions, "bench-press-barbell", {
      asOf: today,
      policy: { ...DEFAULT_REP_RANGE_POLICY, requireAllSets: false },
    });
    expect(relaxed.state).toBe("ready");
  });

  it("respects a custom range", () => {
    // At 3–5 reps, three sets of 5 is a clear.
    const status = assessProgression([bench(at(3), 120, [5, 5, 5], 8)], "bench-press-barbell", {
      asOf: today,
      policy: { ...DEFAULT_REP_RANGE_POLICY, overrides: { "bench-press-barbell": [3, 5] } },
    });
    expect(status.state).toBe("ready");
    expect(status.suggestedReps).toBe(3);
  });

  it("has nothing to say about a lift with no history", () => {
    const status = assess([]);
    expect(status.state).toBe("new");
    expect(status.suggestedWeightKg).toBeNull();
    expect(status.range).toEqual([6, 10]);
  });
});

describe("stalls and back-offs", () => {
  it("flags a lift sitting at the same weight", () => {
    const status = assess([
      bench(at(12), 80, [8, 8, 7], 8),
      bench(at(8), 80, [8, 8, 8], 8.5),
      bench(at(4), 80, [9, 8, 8], 8.5),
    ]);
    expect(status.state).toBe("stalled");
    expect(status.sessionsAtWeight).toBe(3);
    expect(status.headline).toMatch(/3 sessions at 80 kg/);
  });

  it("does not call it a stall while the load is still climbing", () => {
    const status = assess([
      bench(at(12), 75, [8, 8, 8], 8),
      bench(at(8), 77.5, [8, 8, 7], 8),
      bench(at(4), 80, [8, 7, 7], 8),
    ]);
    expect(status.state).toBe("building");
    expect(status.sessionsAtWeight).toBe(1);
  });

  it("recommends backing off after two sessions under the floor", () => {
    const status = assess([bench(at(8), 100, [5, 5, 4], 9.5), bench(at(4), 100, [5, 4, 4], 10)]);
    expect(status.state).toBe("deload");
    expect(status.suggestedWeightKg).toBe(90);
    expect(status.headline).toMatch(/Back off to 90 kg/);
  });

  it("gives one bad session the benefit of the doubt", () => {
    const status = assess([bench(at(8), 100, [8, 8, 8], 8), bench(at(4), 100, [5, 5, 4], 9.5)]);
    expect(status.state).toBe("building");
    expect(status.suggestedWeightKg).toBe(100);
  });
});

describe("the board", () => {
  const sessions = [
    // Ready: cleared the range.
    bench(at(4), 80, [10, 10, 10], 8),
    // Building.
    makeSession(at(4), [
      makeSet("back-squat", 100, 8, { rpe: 8 }),
      makeSet("back-squat", 100, 7, { rpe: 8.5 }),
    ]),
    // Isolation, cleared its own higher range.
    makeSession(at(6), [
      makeSet("lateral-raise-dumbbell", 12, 15, { rpe: 8 }),
      makeSet("lateral-raise-dumbbell", 12, 15, { rpe: 8 }),
    ]),
  ];

  it("puts what is ready at the top", () => {
    const board = progressionBoard(sessions, { asOf: today });
    expect(board[0]!.state).toBe("ready");
    expect(board.map((s) => s.exerciseId)).toContain("back-squat");
  });

  it("applies each lift's own range", () => {
    const board = progressionBoard(sessions, { asOf: today });
    const raise = board.find((s) => s.exerciseId === "lateral-raise-dumbbell")!;
    expect(raise.range).toEqual([10, 15]);
    expect(raise.state).toBe("ready");
    expect(raise.suggestedWeightKg).toBe(13.75); // +1.25 on an isolation lift
  });

  it("ignores lifts outside the window", () => {
    const stale = [bench(days[0]!, 80, [10, 10, 10], 8)];
    expect(progressionBoard(stale, { asOf: today, windowDays: 7 })).toHaveLength(0);
    expect(progressionBoard(stale, { asOf: today, windowDays: 60 })).toHaveLength(1);
  });

  it("shortlists only the lifts that have earned an increase", () => {
    const ready = readyToProgress(sessions, { asOf: today });
    expect(ready.map((s) => s.exerciseId).sort()).toEqual([
      "bench-press-barbell",
      "lateral-raise-dumbbell",
    ]);
  });

  it("counts warm-ups out of the assessment", () => {
    const status = assess([
      makeSession(at(3), [
        makeSet("bench-press-barbell", 40, 12, { isWarmup: true }),
        makeSet("bench-press-barbell", 80, 10, { rpe: 8 }),
        makeSet("bench-press-barbell", 80, 10, { rpe: 8 }),
        makeSet("bench-press-barbell", 80, 10, { rpe: 8 }),
      ]),
    ]);
    expect(status.state).toBe("ready");
    expect(status.lastSets).toHaveLength(3);
  });
});
