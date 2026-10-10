# Close the Feedback Loop — Prove It Works

Code is not "ready" because it _looks_ like it will work. Before you tell the user something is done,
you must **actually verify it works** with a real feedback loop. The right verification tool depends
on the context — pick from the options below and iterate until you have evidence, not a hunch.

**Golden rule:** run the loop yourself, observe the real output, and only then report success. If you
cannot verify, say so explicitly rather than implying it works.

---

## 1. New Endpoints → Test Autonomously With cURL

When you build or change an endpoint, exercise it yourself with `curl`, using everything you learned
about its route, method, payload, and auth while implementing it.

- **API-key endpoints:** read the required key from the repo's **`.env`** file and pass it in the
  expected header. **Never commit the key** (or any secret) anywhere — use it only for the live test.

Inspect the status code and body. Loop — adjust the code, re-run — until the response is correct.

## 2. Generic Functions → Unit Tests

For generic/pure functions, verify with **unit tests** via the existing **`unit-test` agent**. Let it
write and run the tests; use failures to drive fixes until green.

## 3. Complex Server Logic → Component Tests

For complex server functions (orchestration across services, guards, pipelines, DB interactions),
write **component tests** using the **`component-test` agent**, and iterate on the results.

## 4. Client-Side → Log In, Debug, and Drive Chrome DevTools MCP

Client debugging is the hardest and most important loop. Verify both that the **component lifecycle**
behaves and that the **rendered result** is correct.

### Inspect with debugger statements + Chrome DevTools MCP

- Place `debugger;` statements at the points whose behavior you need to confirm.
- Drive the **Chrome DevTools MCP** to run the app, hit those breakpoints, **print/evaluate** state,
  read the **console**, and watch **network requests/responses**.
- Use what you observe to confirm the lifecycle and data flow — or to locate the defect.

## 5. UI Work → Require a Reference, Then Loop Until It Matches

If you are building or changing UI, you **must** have a concrete target to compare against. Ask the
user to supply one of:

- a **screenshot** of the desired design, **or**
- a **Figma link** (use the **Figma MCP** to read the frames/specs), **or**
- an **on-disk folder with reference HTML** that illustrates the intended result.

Then use the **Chrome DevTools MCP** to actually _see_ your rendered output, compare it to the
reference, and run a feedback loop — adjusting styles/markup and re-checking — **until the result
matches the reference.** Do not declare UI done from code inspection alone.

## 6. Hit a Bug? Use the Tools to Decide, Not to Guess

Whenever you run into a bug, reach for the tools above as your feedback loop — cURL for endpoints,
the unit-test/component-test agents for logic, and the Chrome DevTools MCP (with the automation login
and `debugger` statements) for the client. **Base the fix on the tool output**, making educated
decisions from real evidence rather than speculating.

---

## Secrets Discipline

Any key or token you use to test (from `.env`, the automation API key, minted user tokens) is for the
live verification loop only. **Never commit secrets** to source, config, logs, or anywhere in the
repo.