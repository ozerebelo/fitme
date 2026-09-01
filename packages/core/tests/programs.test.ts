import { describe, expect, it } from "vitest";
import {
  EXERCISE_BY_ID,
  chooseSplit,
  generateProgram,
  nextProgramDay,
  sessionMinutes,
} from "../src/index";
import { makeProfile } from "./helpers";

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
