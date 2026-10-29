import { describe, expect, it } from "vitest";
import { Debouncer } from "./debounce.ts";

describe("Debouncer", () => {
  it("commits a change once it has been stable for the window", () => {
    const debouncer = new Debouncer(30);
    debouncer.input(0, 100);

    expect(debouncer.advance(129)).toBeNull();
    expect(debouncer.advance(130)).toEqual({ level: 0, atUs: 100 });
    expect(debouncer.level).toBe(0);
  });

  it("uses the time of the last bounce as the transition time", () => {
    const debouncer = new Debouncer(30);
    debouncer.input(0, 100);
    debouncer.input(1, 105);
    debouncer.input(0, 110);

    expect(debouncer.advance(139)).toBeNull();
    expect(debouncer.advance(140)).toEqual({ level: 0, atUs: 110 });
  });

  it("drops pulses shorter than the window", () => {
    const debouncer = new Debouncer(30);
    debouncer.input(0, 100);
    debouncer.input(1, 120);

    expect(debouncer.advance(1000)).toBeNull();
    expect(debouncer.level).toBe(1);
  });

  it("commits immediately when the window is zero", () => {
    const debouncer = new Debouncer(0);
    debouncer.input(0, 100);

    expect(debouncer.advance(100)).toEqual({ level: 0, atUs: 100 });
  });

  it("flushes a pending change regardless of the window", () => {
    const debouncer = new Debouncer(30);
    debouncer.input(0, 100);

    expect(debouncer.flush()).toEqual({ level: 0, atUs: 100 });
    expect(debouncer.flush()).toBeNull();
  });
});
