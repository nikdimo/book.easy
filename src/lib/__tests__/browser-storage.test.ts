import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredValue, writeStoredValue } from "@/lib/browser-storage";

/**
 * The listings view and the photo grid's density are read inside a
 * `useSyncExternalStore` snapshot, which React calls during render. Safari's private
 * mode and Chrome's "block all cookies" throw a `SecurityError` on the `localStorage`
 * property access itself, so an unguarded read there did not degrade the preference —
 * it took the whole screen to the error boundary. These assertions are about the guard,
 * not about the preference.
 */

const originalWindow = Reflect.get(globalThis, "window");

function withStorage(storage: unknown) {
  Reflect.set(globalThis, "window", { localStorage: storage });
}

/** What a browser with site data blocked actually does. */
function refusingStorage() {
  return {
    get getItem(): never {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
    get setItem(): never {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  };
}

afterEach(() => {
  if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Reflect.set(globalThis, "window", originalWindow);
  vi.restoreAllMocks();
});

describe("readStoredValue", () => {
  it("returns the stored string when storage works", () => {
    withStorage({ getItem: (key: string) => (key === "view" ? "grid" : null) });
    expect(readStoredValue("view")).toBe("grid");
  });

  it("returns null rather than throwing when the browser refuses storage", () => {
    withStorage(refusingStorage());
    expect(() => readStoredValue("view")).not.toThrow();
    expect(readStoredValue("view")).toBeNull();
  });

  it("returns null rather than throwing when there is no window at all", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(readStoredValue("view")).toBeNull();
  });
});

describe("writeStoredValue", () => {
  it("reports the write and performs it when storage works", () => {
    const setItem = vi.fn();
    withStorage({ setItem });
    expect(writeStoredValue("view", "grid")).toBe(true);
    expect(setItem).toHaveBeenCalledWith("view", "grid");
  });

  it("reports failure rather than throwing when the browser refuses storage", () => {
    withStorage(refusingStorage());
    expect(() => writeStoredValue("view", "grid")).not.toThrow();
    expect(writeStoredValue("view", "grid")).toBe(false);
  });
});
