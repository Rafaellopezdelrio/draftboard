# Draftboard Testing Policy

## The honest truth

Tests passing ≠ no bugs. They mean **no regressions in what's tested**.
Current coverage (statements): **17%**. There are bugs we haven't written
tests for yet — and that's fine, as long as we follow this policy.

## The rule

**Every bug found by a user (or in manual testing) → add a regression test
that would have caught it.**

This is non-negotiable. Examples of bugs in this codebase that became tests:

| Bug | Test that catches it |
|---|---|
| Lee Sin appears as MIDDLE suggestion | `suggestionEngine.test.ts > role filter strict` |
| Renekton classified as JUNGLE wrongly | `lcuPersonalData.test.ts > Renekton bug regression` |
| Zilean shows in MID (Mage+Support tags) | `suggestionEngine.test.ts > authoritative role map` |
| Match-IDs list cached 24h (Zed game missing) | `worker.test.js > shouldSkipCache regression` |
| Frontend stuck on "Esperando cliente" after F5 | `lcuService.test.ts > seeds with cached status` |

## How to add a test for a bug

1. Reproduce manually first (otherwise you can't write the test)
2. Find the smallest unit (engine function, repo, util) where the bug lives
3. Write a `test` that *fails* before the fix
4. Apply the fix, watch it pass
5. Commit both together with `regression:` prefix

```typescript
it("regression: <user-visible symptom> (date or issue link)", () => {
  // arrange: minimal setup that reproduces the bug
  // act: call the function
  // assert: the bug case now returns the correct result
});
```

## Coverage gate

`npm run test:coverage` enforces minimum coverage. The CI fails if any
metric drops below baseline. **You can't make coverage worse**.

Target progression:

| Date          | Statements | Functions |
|---------------|-----------:|----------:|
| 2026-05-15    |        17% |       35% |
| 2026-06-01    |        25% |       45% |
| 2026-07-01    |        40% |       55% |
| 2026-09-01    |        60% |       70% |
| 2026-12-01    |        70% |       80% |

## What NOT to test

- 3rd-party library internals
- Trivial getters/setters
- Visual styling (use Playwright visual regression if needed, not unit tests)
- Generated code

## What MUST be tested

- Every engine in `src/engine/` (game logic — most likely to break)
- Every service that does data transformation
- Every reducer / store action
- Every regex / parser / validator
- Every async error path

## Commands

```bash
npm test               # run all tests once
npm run test:watch     # watch mode (use during dev)
npm run test:coverage  # measure coverage + enforce gates
npm run test:ui        # interactive UI
npm run typecheck      # TS without tests
```
