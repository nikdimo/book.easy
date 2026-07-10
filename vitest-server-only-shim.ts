// Stand-in for the "server-only" package during tests. The real package throws
// unconditionally under plain Node module resolution (Vitest included) — it only
// becomes a no-op when Next's webpack applies the special "react-server" export
// condition, which Vitest doesn't set. Aliased in vitest.config.ts so service files
// marked `import "server-only"` can still be imported directly by tests.
export {};
