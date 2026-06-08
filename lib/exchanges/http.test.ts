import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./http";

describe("fetchJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("aborts exchange requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchJson("https://example.test/markets", 1000);
    const assertion = expect(request).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/markets",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal)
      })
    );
  });
});
