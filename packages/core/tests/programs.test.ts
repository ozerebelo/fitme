import { describe, expect, it } from "vitest";
import {
  DEFAULT_REP_RANGE_POLICY,
  EXERCISE_BY_ID,
  chooseSplit,
  deriveRoutinesFromHistory,
  generateProgram,
  nextProgramDay,
  programFromRoutines,
  sessionMinutes,
} from "../src/index";
import { daysEnding, makeProfile, makeSession, makeSet } from "./helpers";

describe("split selection", () => {
  it("scales the split with training frequency", () => {
    expect(chooseSplit(2, "intermediate")).toBe("full_body");
    expect(chooseSplit(3, "beginner")).toBe("full_body");
    expect(chooseSplit(4, "intermediate")).toBe("upper_lower");
    expect(chooseSplit(6, "advanced")).toBe("push_pull_legs");
  });
});

describe("program generation", () => {
  it("produces one day per training day", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const program = generateProgram(makeProfile({ trainingDaysPerWeek: days }));
      expect(program.days).toHaveLength(days);
      expect(program.daysPerWeek).toBe(days);
    }
  });

  it("gives every day at least one compound lift", () => {
    const program = generateProgram(makeProfile({ trainingDaysPerWeek: 4 }));
    for (const day of program.days) {
      expect(day.blocks.length).toBeGreaterThan(0);
      const compounds = day.blocks.filter(
        (b) => EXERCISE_BY_ID.get(b.exerciseId)?.isCompound,
      );
      expect(compounds.length).toBeGreaterThan(0);
    }
  });

  it("opens each day with a lift that trains what the day is for", () => {
    const program = generateProgram(makeProfile({ trainingDaysPerWeek: 4 }));
    for (const day of program.days) {
      const first = EXERCISE_BY_ID.get(day.blocks[0]!.exerciseId)!;
      // A close-grip bench is a horizontal press, but it is a triceps lift and
      // should never lead a chest day.
      expect(first.primary.some((m) => day.focus.includes(m))).toBe(true);
    }
  });

  it("never repeats an exercise within a day", () => {
    const program = generateProgram(makeProfile({ trainingDaysPerWeek: 6 }));
    for (const day of program.days) {
      const ids = day.blocks.map((b) => b.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("only prescribes exercises the user has equipment for", () => {
    const program = generateProgram(
      makeProfile({ availableEquipment: ["bodyweight"], trainingDaysPerWeek: 3 }),
    );
    for (const day of program.days) {
      for (const block of day.blocks) {
        const exercise = EXERCISE_BY_ID.get(block.exerciseId)!;
        expect(exercise.equipment).toContain("bodyweight");
      }
    }
  });

  it("keeps beginners away from the most technical lifts", () => {
    const program = generateProgram(makeProfile({ experience: "beginner", trainingDaysPerWeek: 4 }));
    for (const day of program.days) {
      for (const block of day.blocks) {
        expect(EXERCISE_BY_ID.get(block.exerciseId)!.skill ?? 1).toBeLessThanOrEqual(2);
      }
    }
  });

  it("fits sessions inside the time budget", () => {
    const program = generateProgram(makeProfile({ sessionMinutes: 45, trainingDaysPerWeek: 4 }));
    for (const day of program.days) {
      expect(sessionMinutes(day.blocks)).toBeLessThanOrEqual(45);
    }
  });

  it("is deterministic for the same profile", () => {
    const profile = makeProfile();
    const a = generateProgram(profile);
    const b = generateProgram(profile);
    expect(a.days.map((d) => d.blocks.map((x) => x.exerciseId))).toEqual(
      b.days.map((d) => d.blocks.map((x) => x.exerciseId)),
    );
  });

  it("adds conditioning when the goal is fat loss", () => {
    const cutting = generateProgram(makeProfile({ goal: "lose", sessionMinutes: 90 }));
    expect(cutting.days.some((d) => (d.conditioningMinutes ?? 0) > 0)).toBe(true);
    const bulking = generateProgram(makeProfile({ goal: "gain", sessionMinutes: 90 }));
    expect(bulking.days.every((d) => !d.conditioningMinutes)).toBe(true);
  });

  it("explains itself", () => {
    const program = generateProgram(makeProfile());
    expect(program.rationale.length).toBeGreaterThan(2);
  });

  it("cycles through the days", () => {
    const program = generateProgram(makeProfile({ trainingDaysPerWeek: 3 }));
    expect(nextProgramDay(program, [])!.id).toBe(program.days[0]!.id);
    expect(nextProgramDay(program, [program.days[0]!.id])!.id).toBe(program.days[1]!.id);
    expect(nextProgramDay(program, [program.days[2]!.id])!.id).toBe(program.days[0]!.id);
  });
});


describe("routines derived from history", () => {
  const days = daysEnding(30);
  const today = days[days.length - 1]!;
  const at = (n: number): string => days[days.length - n]!;

  const push = (date: string) =>
    makeSession(date, [
      makeSet("bench-press-barbell", 80, 8),
      makeSet("bench-press-barbell", 80, 8),
      makeSet("bench-press-barbell", 80, 7),
      makeSet("overhead-press-dumbbell", 22, 10),
      makeSet("overhead-press-dumbbell", 22, 10),
      makeSet("lateral-raise-dumbbell", 10, 15),
    ], { name: "PUSH" });

  const pull = (date: string) =>
    makeSession(date, [
      makeSet("lat-pulldown", 65, 10),
      makeSet("lat-pulldown", 65, 10),
      makeSet("barbell-row", 70, 8),
      makeSet("bicep-curl-dumbbell", 14, 12),
    ], { name: "PULL" });

  const legs = (date: string) =>
    makeSession(date, [makeSet("back-squat", 100, 8), makeSet("back-squat", 100, 8)], {
      name: "Legs",
    });

  const history = [push(at(9)), pull(at(8)), legs(at(7)), push(at(4)), pull(at(3)), legs(at(2))];

  it("rebuilds each routine from its most recent session", () => {
    const routines = deriveRoutinesFromHistory(history, { asOf: today });
    expect(routines.map((r) => r.name)).toEqual(["Legs", "PULL", "PUSH"]);

    const pushRoutine = routines.find((r) => r.name === "PUSH")!;
    expect(pushRoutine.exerciseNames).toEqual([
      "Barbell Bench Press",
      "Dumbbell Shoulder Press",
      "Dumbbell Lateral Raise",
    ]);
    // Set counts come from what was actually performed.
    expect(pushRoutine.day.blocks.map((b) => b.sets)).toEqual([3, 2, 1]);
  });

  it("applies the user's rep ranges rather than the logged reps", () => {
    const routines = deriveRoutinesFromHistory(history, { asOf: today });
    const pushRoutine = routines.find((r) => r.name === "PUSH")!;
    expect(pushRoutine.day.blocks[0]!.repMin).toBe(6);
    expect(pushRoutine.day.blocks[0]!.repMax).toBe(10);
    // Isolation gets its own range.
    expect(pushRoutine.day.blocks[2]!.repMax).toBe(15);
  });

  it("treats differently-cased names as one routine", () => {
    const mixed = [...history, makeSession(at(1), [makeSet("back-squat", 100, 8)], { name: "LEGS" })];
    const routines = deriveRoutinesFromHistory(mixed, { asOf: today });
    expect(routines.filter((r) => r.name.toLowerCase() === "legs")).toHaveLength(1);
  });

  it("ignores one-off sessions", () => {
    const withOneOff = [
      ...history,
      makeSession(at(1), [makeSet("back-squat", 60, 10)], { name: "Holiday session" }),
    ];
    const routines = deriveRoutinesFromHistory(withOneOff, { asOf: today });
    expect(routines.map((r) => r.name)).not.toContain("Holiday session");
  });

  it("keeps only the most recent routines, up to the limit", () => {
    const routines = deriveRoutinesFromHistory(history, { asOf: today, limit: 2 });
    expect(routines).toHaveLength(2);
    expect(routines.map((r) => r.name)).toEqual(["Legs", "PULL"]);
  });

  it("ignores history outside the window", () => {
    expect(deriveRoutinesFromHistory(history, { asOf: today, windowDays: 3 })).toHaveLength(0);
  });

  it("derives the focus muscles from the exercises actually in the day", () => {
    const routines = deriveRoutinesFromHistory(history, { asOf: today });
    expect(routines.find((r) => r.name === "PULL")!.day.focus).toContain("lats");
  });

  it("assembles them into a usable programme", () => {
    const routines = deriveRoutinesFromHistory(history, { asOf: today });
    const program = programFromRoutines(routines, makeProfile());
    expect(program.days).toHaveLength(3);
    expect(program.daysPerWeek).toBe(3);
    expect(program.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
    expect(program.rationale.join(" ")).toMatch(/actually been running/);
    // The programme must survive the day-cycling the rest of the app does.
    expect(nextProgramDay(program, [])!.name).toBe(routines[0]!.name);
  });

  it("says nothing when there is no history", () => {
    expect(deriveRoutinesFromHistory([], { asOf: today })).toEqual([]);
  });

  it("honours a custom range policy", () => {
    const routines = deriveRoutinesFromHistory(history, {
      asOf: today,
      policy: { ...DEFAULT_REP_RANGE_POLICY, compound: [3, 5] },
    });
    expect(routines.find((r) => r.name === "PUSH")!.day.blocks[0]!.repMax).toBe(5);
  });
});