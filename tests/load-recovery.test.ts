import { describe, expect, test } from "bun:test";
import { boundedLoad } from "../src/lib/load-recovery";

describe("loading recovery", () => {
  test("returns successful loading results", async () => {
    expect(await boundedLoad(Promise.resolve({ owner: true }), 50)).toEqual({ owner: true });
  });
  test("stalled loading rejects so it can show retry rather than access denied", async () => {
    await expect(boundedLoad(new Promise(() => {}), 5)).rejects.toThrow("Loading timed out");
  });
  test("connection errors remain errors rather than becoming a signed-out result", async () => {
    const failure = new Error("Connection unavailable");
    await expect(boundedLoad(Promise.reject(failure), 50)).rejects.toBe(failure);
  });
});
