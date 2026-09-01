import { describe, expect, it } from "vitest";
import {
  EXERCISE_BY_ID,
  brzycki1RM,
  classifyVolume,
  epley1RM,
  estimate1RM,
  estimate1RMFromRpe,
  exerciseHistory,
  percentOf1RM,
  personalRecords,
  platesFor,
  prsBrokenBy,
  rpeCreep,
  setsPerMuscle,
  suggestProgression,
  volumeLoad,
  workingLoad,
} from "../src/index";
import { makeSession, makeSet } from "./helpers";

describe("one-rep max", () => {
  it("returns the weight itself for a single", () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it("agrees with the published formulas", () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(brzycki1RM(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("declines to estimate above 12 reps", () => {
    expect(estimate1RM(60, 20)).toBeNull();
  });

  it("uses RPE when it is available", () => {
    // 5 reps at RPE 8 is 2 reps in reserve → 81.1 % of 1RM.
    expect(percentOf1RM(5, 8)).toBeCloseTo(0.811, 3);
    expect(estimate1RMFromRpe(100, 5, 8)).toBeCloseTo(123.3, 1);
    // The same weight at RPE 10 implies a lower max.
    expect(estimate1RMFromRpe(100, 5, 10)!).toBeLessThan(estimate1RMFromRpe(100, 5, 8)!);
  });

  it("inverts to a working load", () => {
    const load = workingLoad(150, 5, 8, "metric");
    expect(load).toBeCloseTo(121.25, 1);
  });
});

describe("volume", () => {
  it("ignores warmups and uncompleted sets", () => {
    const sets = [
      makeSet("back-squat", 60, 5, { isWarmup: true }),
      makeSet("back-squat", 100, 5),
      makeSet("back-squat", 100, 5, { completed: false }),
    ];
    expect(volumeLoad(sets)).toBe(500);
  });

  it("counts primary muscles fully and secondary at half", () => {
    const session = makeSession("2024-05-01", [
      makeSet("bench-press-barbell", 100, 5),
      makeSet("bench-press-barbell", 100, 5),
    ]);
    const totals = setsPerMuscle([session], EXERCISE_BY_ID);
    expect(totals.chest).toBe(2);
    expect(totals.triceps).toBe(1);
  });

  it("classifies weekly volume against the landmarks", () => {
    expect(classifyVolume("chest", 2)).toBe("under");
    expect(classifyVolume("chest", 6)).toBe("maintaining");
    expect(classifyVolume("chest", 14)).toBe("optimal");
    expect(classifyVolume("chest", 21)).toBe("high");
    expect(classifyVolume("chest", 30)).toBe("excessive");
  });
});

describe("personal records", () => {
  it("tracks the heaviest set and the best estimated max", () => {
    const sessions = [
      makeSession("2024-01-01", [makeSet("back-squat", 100, 5)]),
      makeSession("2024-01-08", [makeSet("back-squat", 110, 3)]),
      makeSession("2024-01-15", [makeSet("back-squat", 105, 8)]),
    ];
    const prs = personalRecords(sessions);
    const squat = prs.get("back-squat")!;
    expect(squat.maxWeightKg).toBe(110);
    expect(squat.maxWeightDate).toBe("2024-01-08");
    // 105 × 8 estimates higher than 110 × 3.
    expect(squat.bestE1RMDate).toBe("2024-01-15");
  });

  it("treats a first-ever performance as a baseline, not a record", () => {
    expect(prsBrokenBy(makeSet("back-squat", 100, 5), undefined)).toEqual([]);
  });

  it("detects which records a set breaks", () => {
    const prior = personalRecords([makeSession("2024-01-01", [makeSet("back-squat", 100, 5)])]);
    const broken = prsBrokenBy(makeSet("back-squat", 120, 5), prior.get("back-squat"));
    expect(broken).toContain("weight");
    expect(broken).toContain("e1rm");
    expect(prsBrokenBy(makeSet("back-squat", 80, 3), prior.get("back-squat"))).toEqual([]);
  });
});

describe("progression", () => {
  const opts = {
    repMin: 5,
    repMax: 8,
    sets: 3,
    targetRpe: 8,
    units: "metric" as const,
    isUpperBody: true,
  };

  it("asks for a calibration set with no history", () => {
    expect(suggestProgression([], opts).action).toBe("start");
  });

  it("adds load once the top of the rep range is owned", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [
          makeSet("bench-press-barbell", 80, 8, { rpe: 7 }),
          makeSet("bench-press-barbell", 80, 8, { rpe: 7.5 }),
          makeSet("bench-press-barbell", 80, 8, { rpe: 8 }),
        ]),
      ],
      "bench-press-barbell",
    );
    const next = suggestProgression(history, opts);
    expect(next.action).toBe("increase_load");
    expect(next.weightKg).toBe(82.5);
    expect(next.reps).toBe(5);
  });

  it("chases reps when the range is not yet complete", () => {
    const history = exerciseHistory(
      [makeSession("2024-01-01", [makeSet("bench-press-barbell", 80, 6, { rpe: 8 })])],
      "bench-press-barbell",
    );
    const next = suggestProgression(history, opts);
    expect(next.action).toBe("add_reps");
    expect(next.weightKg).toBe(80);
    expect(next.reps).toBe(7);
  });

  it("deloads after repeatedly missing the bottom of the range", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [makeSet("bench-press-barbell", 100, 4, { rpe: 9.5 })]),
        makeSession("2024-01-08", [makeSet("bench-press-barbell", 100, 3, { rpe: 10 })]),
      ],
      "bench-press-barbell",
    );
    const next = suggestProgression(history, opts);
    expect(next.action).toBe("deload");
    expect(next.weightKg).toBeLessThan(100);
  });

  it("deloads on a flat estimated max at a high RPE", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [makeSet("bench-press-barbell", 100, 6, { rpe: 9 })]),
        makeSession("2024-01-08", [makeSet("bench-press-barbell", 100, 6, { rpe: 9 })]),
        makeSession("2024-01-15", [makeSet("bench-press-barbell", 100, 5, { rpe: 9.5 })]),
      ],
      "bench-press-barbell",
    );
    expect(suggestProgression(history, opts).action).toBe("deload");
  });

  it("uses bigger jumps for lower-body lifts", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [
          makeSet("back-squat", 100, 8, { rpe: 7 }),
          makeSet("back-squat", 100, 8, { rpe: 7 }),
          makeSet("back-squat", 100, 8, { rpe: 7 }),
        ]),
      ],
      "back-squat",
    );
    const next = suggestProgression(history, { ...opts, isUpperBody: false });
    expect(next.weightKg).toBe(105);
  });
});

describe("plate maths", () => {
  it("loads a bar exactly when it can", () => {
    const solution = platesFor(100);
    expect(solution.perSide).toEqual([25, 15]);
    expect(solution.achievedKg).toBe(100);
    expect(solution.errorKg).toBe(0);
  });

  it("reports the shortfall when a load is not loadable", () => {
    const solution = platesFor(21);
    expect(solution.achievedKg).toBe(20);
    expect(solution.errorKg).toBe(-1);
  });

  it("returns an empty bar below bar weight", () => {
    expect(platesFor(15).perSide).toEqual([]);
  });
});

describe("fatigue", () => {
  it("flags rising RPE at a flat load", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [makeSet("bench-press-barbell", 100, 5, { rpe: 7 })]),
        makeSession("2024-01-08", [makeSet("bench-press-barbell", 100, 5, { rpe: 8 })]),
        makeSession("2024-01-15", [makeSet("bench-press-barbell", 100, 5, { rpe: 9 })]),
        makeSession("2024-01-22", [makeSet("bench-press-barbell", 100, 5, { rpe: 9.5 })]),
      ],
      "bench-press-barbell",
    );
    expect(rpeCreep(history).creeping).toBe(true);
  });

  it("does not flag rising RPE when the load is going up too", () => {
    const history = exerciseHistory(
      [
        makeSession("2024-01-01", [makeSet("bench-press-barbell", 100, 5, { rpe: 7 })]),
        makeSession("2024-01-08", [makeSet("bench-press-barbell", 105, 5, { rpe: 8 })]),
        makeSession("2024-01-15", [makeSet("bench-press-barbell", 110, 5, { rpe: 9 })]),
      ],
      "bench-press-barbell",
    );
    expect(rpeCreep(history).creeping).toBe(false);
  });
});
