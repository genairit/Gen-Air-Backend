# CLAUDE.md

This file consolidates all standards from the `rules/` folder for use as project-wide guidance.

---

## Elegance & Coding Standards

Code is not "done" when it works — it is done when it is **declarative, self-explaining, and
elegant**. These standards capture the patterns we favors when writing, reviewing, or
refactoring code — turning imperative or verbose code into elegant code. Every rule reflects an
actual change a maintainer made or requested. When this document and habit disagree, this document
wins.

Component files are the most expensive real estate in the codebase; everything that does not have
to live there must be moved out.

These standards are framework- and runtime-agnostic. Use the repository's selected package manager,
runtime, framework conventions, lifecycle APIs, and equivalent abstractions. Examples illustrate a
principle; they do not mandate a particular toolchain unless a rule explicitly names a required
formatter plugin.

### 1. Pyramid Ordering — Everywhere

Line-length ordering, shortest line first and longest last, is the visual signature of this
codebase. It applies to far more than imports.

#### 1.1 Imports

Use `prettier-plugin-pyramid-imports` in the repository's Prettier configuration (see the dedicated
pyramid-imports policy for the full plugin setup and manual fallback). Multi-line imports form
mini-pyramids at the top of the file: each is sorted internally from shortest to longest, the
mini-pyramids are ordered by their last line's length, and a blank line separates them. After
another blank line comes the single united pyramid of single-line imports.

**The pyramid shape is the standard; the formatter is only the tool that settles it.** Run the
repository's configured formatting command on every file you touch so the pyramid plugins settle
imports, interface members, and JSX attributes — then verify the result still reads as ascending
line length. Where a generic formatter orders against the pyramid (alphabetical sorting, category
grouping, attribute ordering by kind), the pyramid wins: fix the plugin configuration, or restore
the ordering by hand.

```typescript
import { logger } from "../../utilities/logger.utility";
import { IDeviceFlags } from "../../interfaces/user.interface";
import { authService } from "../../services/auth/auth.service";
import { userService } from "../../services/user/user.service";
import { userStore, setDeviceFlags, getDeviceFlags } from "../../store/user.store";
```

#### 1.2 Interface Members

Use `prettier-plugin-pyramid-interface-keys` to enforce this ordering. When absent, add it as a
development dependency through the repository's chosen dependency-management command.

Order interface properties by line length, ascending. Do not group them by data versus callbacks;
use a pure pyramid.

```typescript
interface ICategorySelectionSectionProps {
  maxChips?: number;
  readOnly?: boolean;
  onPlaceholderClick: () => void;
  selectedSubcategories: INestedItem[];
  onRemove: (id: string | number) => void;
}
```

#### 1.3 View Attributes

In JSX or a compatible syntax, use `prettier-plugin-pyramid-jsx-attributes` to enforce this
ordering. When absent, add it as a development dependency through the repository's chosen
dependency-management command. For other template or view syntaxes, apply the same ordering with
the formatter or lint rule supported by that stack.

Order attributes on an element by line length, ascending. Attributes whose values span multiple
lines, such as arrow handlers or `clsx(...)` calls, go after all single-line attributes. Spread
props (`{...rest}`) always come last.

```tsx
<input
  type="tel"
  disabled={props.readOnly}
  value={props.primaryPhone}
  aria-invalid={showPhoneError()}
  title={t("PHONE_NUMBER_VALIDATION_HINT")}
  pattern={FIELD_VALIDATION_PATTERNS.PHONE}
  placeholder={t("PHONE_NUMBER_PLACEHOLDER")}
  class={clsx(styles.input, styles.inputLtr)}
/>
```

### 2. Component Files Are Expensive Real Estate

A component file contains the component, its input contract or local type definition, and
**nothing else** unless the code directly closes over component state. Everything else has a
designated home:

| What                                                         | Where it belongs                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Constants, option arrays, config objects                     | `src/constants/<name>.constant.ts`                           |
| Pure helper functions for formatting, parsing, or derivation | `src/utilities/<name>.utility.ts`                            |
| Imperative platform, lifecycle, or event wiring              | A generic reusable abstraction in the infrastructure layer   |
| Business-logic handlers, async flows, and store mutations    | Global `src/actions/` or a component-local `actions/` folder |
| Interfaces shared beyond the component's own props           | `src/interfaces/<entity>.interface.ts`                       |

Examples of violations and their fixes:

- Move option arrays such as `COLOR_OPTIONS` and `FONT_OPTIONS` from above a component into a
  constants file.
- Move helpers such as `getInitials(name)` and `getDayName(date, t)` into a shared utility file such
  as `text.utility.ts` or `date.utility.ts`.
- Replace inline event listeners and timers with generic wrappers exposed through the framework's
  conventional reusable abstraction: a hook, composable, directive, service, helper, or equivalent.
  The component should make one declarative call.
- Extract an async handler that orchestrates application state into an action file. The component
  keeps only the thin binding to its local state primitive.

The test is: **could this code exist unchanged in another component?** If yes, it does not belong in
this file.

#### 2.1 Client Component Variable Declaration Order

Inside client-side components, variables, hooks, and logic follow a strict top-to-bottom
declaration order:

1. General constants (local configuration, static values).
2. Styles (custom style definitions or theme hooks).
3. Context / store consumers (values extracted from context or store hooks).
4. State hooks (`useState`).
5. Memoized values (`useMemo` — verify memoization is genuinely necessary before using it).
6. Data-fetching hooks (e.g. `useQuery`, `useMutation`).
7. Functions and event handlers.

```typescript
// ✅ Correct component layout order
const UserProfile = () => {
  const defaultAvatar = DEFAULT_AVATAR_URL;
  const styles = useProfileStyles();
  const { user } = useAuthContext();
  const [isEditing, setIsEditing] = useState(false);

  const formattedName = useMemo(
    () => formatFullName(user.firstName, user.lastName),
    [user.firstName, user.lastName],
  );

  const { data: posts } = useUserPostsQuery(user.id);

  const handleSave = () => { ... };

  return ( ... );
};
```

### 3. Naming & Conventions

Names are the single most impactful readability tool. Every name should reveal intent, be
pronounceable, and require zero mental translation.

- **Reveal intent** — a name should answer _why it exists, what it does, and how to use it_ without
  needing a comment. `activeUsersByStatus` not `d`. `WORK_DAYS_PER_WEEK` not `5`.
- **Casing standards** — use `camelCase` for variables, functions, and instance properties; use
  `SCREAMING_SNAKE_CASE` for global constants, configuration mappings, and enum/const-object keys;
  use `PascalCase` for components, class names, `I`-prefixed interfaces, and `T`-prefixed types.
- **Be concise yet descriptive** — avoid unnecessarily long or convoluted names; name length should
  scale logically with the scope of the variable.
- **Be pronounceable and searchable** — if you can't say it in a code review, rename it. Single
  letters and bare numbers are unsearchable; name length should match scope size.
- **Never mislead** — a Dictionary should not be called `userList`. Names varying only slightly
  (e.g. `userData` vs `userDate`) cause auto-complete bugs. Avoid `l`/`1` and `O`/`0` ambiguity.
- **Make meaningful distinctions** — if two names exist, they must mean different things. Avoid
  generic suffixes like `Manager`, `Handler`, `Utils` that describe nothing.
- **No abbreviations, no Hungarian notation** — `creationDate` not `CrtnDt`, `activeUsers` not
  `lstActiveUsers`. Modern IDEs handle type info; prefixes are noise.

### 4. Functions

**Structure.** Functions should be short, do one thing, and read like a top-down narrative. Each
function operates at a single level of abstraction — high-level functions describe _intent_,
low-level ones handle _details_. If you can extract a block and give it a meaningful name (not just
restating the implementation), it should be its own function.

**Arguments.** Fewer arguments = better. Zero is ideal, one is clear, two is acceptable, three is a
signal to refactor. When arguments are related, group them into an object. Never use boolean flags
that branch into two behaviors — write two separate functions instead. Data flows _in_ through
arguments and _out_ through return values; don't modify inputs as a side effect.

**Naming.** Function names are contracts — they must honestly describe _all_ behavior. If
`checkPassword` also initializes a session, that's a hidden side effect and a bug source. Include
nouns that clarify what the argument represents: `sendEmail(recipient)` not `send(value)`.

**Command-Query Separation.** Commands change state and return nothing. Queries return data and
change nothing. A function that does both creates bugs when callers only want one effect.

### 5. Control Flow and Expressions

#### 5.1 Guard Clauses & Early Return — No Redundant `else`

Use early returns instead of nested `if` statements. When an `if` block returns, do not follow it
with an `else` branch; write the remaining logic at the top level of the function. Every guard has
braces and a blank line after it. Never write a single-line `if (condition) return;`.

```typescript
// ✅ Guard clause with early return, no else
if (!authService.isAuthenticated()) {
  return;
}

if (!hasFlagChanged(flags)) {
  return;
}

const originalFlags = getDeviceFlags();

// ❌ Redundant else block
if (authService.isAuthenticated()) {
  // ...
} else {
  return;
}
```

#### 5.2 Dictionaries Over Branching

Do not use `switch` or an `if`/`else if` chain to dispatch on one value. Use a typed `Record`
lookup. This includes views: markup or templates selected by an enum use a dictionary of renderers
rather than sequential conditional returns. Separate maps by handler shape, such as value-taking
options and boolean flags. Express shared behavior by reusing or delegating handlers.

- Each branch becomes one declarative entry — adding a case is a one-line change, not another
  branch.
- Shared behavior is expressed by pointing multiple keys at the same handler, or by delegating one
  handler to another (preserve any deliberate fall-through explicitly).
- Separate maps by shape: e.g. value-taking options vs. boolean flags.

```ts
// ✅ Declarative dispatch
const BUILDERS: Record<TKind, TBuild> = {
  rule: buildRule,
  skill: buildSkill,
  instruction: buildRule
};

// ❌ Imperative branching
switch (meta.kind) {
  case "rule":
  case "instruction":
    return buildRule(meta);
  case "skill":
    return buildSkill(meta);
}
```

When the same `switch` on a type is repeated across multiple functions, go one step further and use
**polymorphism**: define an interface where each type handles its own logic. The switch then lives
once in a factory; adding a new type means adding a class, not editing every function.

#### 5.3 No `let`, No `var`

`let` is a smell; refactor until `const` works. This includes mutable element refs in components.
Prefer the framework's const-friendly state, reference, or closure-backed primitive over
`let someRef: HTMLElement | null = null`. `var` never appears. When mutation is genuinely required,
it lives inside a reusable abstraction that owns the machinery (see §8.3), not in the consuming
code.

#### 5.4 React Hooks Dependencies & Optimization

Always specify accurate dependencies in `useEffect`, `useCallback`, and `useMemo`. Never omit a
reactive value from a dependency array or disable the hooks lint rule without extreme
justification. Evaluate whether memoization is truly necessary before reaching for `useMemo` or
`useCallback` — do not wrap cheap computations in `useMemo` unnecessarily; reserve it for heavy
operations or for keeping a stable object reference for a child component.

#### 5.5 No Dense Inline Expressions in Views

Conditional or derived expressions do not live inline in JSX, templates, render functions, or
other view syntax. Compute them in a named helper or the framework's derived-value primitive, use
guard clauses internally, and reference the named result so the view reads declaratively. Treat
inline style objects built from spread ternaries the same way.

```typescript
const getDisplayAreas = (options: IDisplayAreaOptions) => {
  const areas = sortUrbanAreaNames(options.selectedAreas);

  if (options.maxChips) {
    return areas.slice(0, options.maxChips);
  }

  return areas;
};

const displayAreas = getDisplayAreas(displayAreaOptions);

return renderAreas(displayAreas);
```

#### 5.6 Extract Self-Documenting Variables

A dense boolean or arithmetic expression must be broken into **named intermediate variables** that
explain _what_ each part checks, followed by a clean combining `return` or conditional early returns that read like a sentence.

- The variable name is the documentation — no comment should be needed to understand the condition.
- One concept per variable.

```ts
// ✅ Self-explaining
const isEmpty = value === "";
const hasReservedYamlChar = /[:#\[\]{}&*!|>'"%@`,]/.test(value);
const looksLikeBoolean = /^(true|false|null|yes|no)$/i.test(value);

return isEmpty || hasReservedYamlChar || looksLikeBoolean;

// ❌ Opaque one-liner
return value === "" || /[:#\[\]{}&*!|>'"%@`,]/.test(value) || /^(true|false|null|yes|no)$/i.test(value);
```

Functions should be small and do one thing. If a function needs a comment to explain a block,
extract that block into a named helper instead.

#### 5.7 Table-Driven Parsing

Argument and configuration parsing uses declarative option tables. Collect state in one typed
object instead of scattering mutable bindings. Adding an option should mean adding one map entry.

```ts
const valueOptions: Record<string, (value: string) => void> = {
  "--targets": value => (state.targetsRaw = value),
  "--dest": value => (state.destDir = resolve(value))
};

const flagOptions: Record<string, () => void> = {
  "--quiet": () => (state.quiet = true)
};
```

This keeps the dispatch loop tiny and makes each new option a single map entry.

### 6. Constants & External Formatting Discipline

#### 6.1 Group Related Constants Into `as const` Objects

Loose sibling exports that share a domain become one named object. The name states the domain and
shape. Storage keys are grouped by medium as `LOCAL_STORAGE_KEYS`, `SESSION_STORAGE_KEYS`, and
`COOKIE_KEYS`.

```typescript
export const LOCAL_STORAGE_KEYS = {
  ISSUE_REPORT: "pending_issue_report",
  PWA_INSTALL_INSTALLED: "pwa-install-installed"
} as const;
```

#### 6.2 Derive, Never Restate

A value conceptually derived from another constant must be written as that derivation. `5000` is
wrong when it means five seconds.

```typescript
export const PWA_PROMPT_DELAY_MS = 5 * TIME_UNITS.SECOND_MS;
```

This applies to every time value in every unit. All durations derive from the global time constants
in `constants/time.constant.ts`. Extend `TIME_UNITS`, or add a derived seconds-based sibling there,
instead of repeating raw time arithmetic elsewhere.

#### 6.3 Storage Keys Are Centralized

Every `localStorage`, `sessionStorage`, and cookie key lives inside the grouped objects in
`constants/storage.constant.ts`. Never use a loose storage-key constant from a component or domain
constants file. Add a feature's key to the appropriate storage object and import it from there;
domain constant files hold domain constants, never storage keys.

#### 6.4 Single Source of Truth Across Formats

When the same knowledge is required in multiple formats, define its raw form once and derive every
other form from it.

```typescript
export const FIELD_VALIDATION_PATTERNS = {
  PHONE: "(?:\\d{2}|\\d{3})[- ]?\\d{7}",
  EMAIL: "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"
} as const;

export const FIELD_VALIDATION_REGEX = {
  PHONE_INPUT_PATTERN: new RegExp(`^${FIELD_VALIDATION_PATTERNS.PHONE}$`),
  EMAIL_INPUT_PATTERN: new RegExp(`^${FIELD_VALIDATION_PATTERNS.EMAIL}$`)
} as const;
```

#### 6.5 No Magic Strings — Including Enumerable Domains

Any string with a closed set of valid values gets a typed constant object, and every call site uses
it. For example, define a global `ICON_NAMES` object containing every available icon, derive the
`IconNameType` union from it, type the `Icon` component's `name` prop with that union, and use the
constant at every call site instead of string literals.

#### 6.6 Liquid Template Standards

When working with Liquid templates (e.g. SMS or email notifications), adhere strictly to the
syntax and structural standards already established in that repository, and keep every template
update consistent with them.

#### 6.7 CSS Positioning Standards

Avoid negative values for layout-positioning properties such as `margin` (e.g. `-10px`,
`margin-top: -20px`) — negative margins are a styling anti-pattern; use Flexbox, Grid, or `gap`
alignment instead.

### 7. Async, Errors, Logging, and State Integrity

#### 7.1 Never Swallow Errors or Fire-and-Forget (Use `TypedLogger`)

Do not use `.catch(() => fallback)` to silently consume a failure. Use explicit `try`/`catch` and
report it through `TypedLogger` (or the repository's dedicated
logging utility). Prefer `await` over `void promise`; if a caller starts an operation, the caller
awaits it.

```typescript
import { TypedLogger } from "server-packages";

const logger = new TypedLogger("DeviceSyncService");

const syncCurrentDeviceFlags = async () => {
  try {
    const isWebpushEnabled = await pushService.isSubscribed();

    await syncDeviceFlagsAction({ isWebpushEnabled });
  } catch (error) {
    logger.error("Failed to sync device flags", { error });
  }
};
```

#### 7.2 Optimistic Updates Roll Back

For store state updated around a server call, capture the original state, apply the optimistic
update, await the server, and restore the original on failure.

```typescript
const originalFlags = getDeviceFlags();

try {
  setDeviceFlags(flags);
  await userService.updateDeviceFlags(flags);
} catch (error) {
  logger.error("Failed to sync device flags", { error });
  setDeviceFlags(originalFlags);
}
```

#### 7.3 Predicates Absorb Nullability

Type guards and predicates accept nullable input and guard internally. Callers never pre-check
truthiness solely to satisfy a predicate.

```typescript
const isSupportedLocale = (value?: string | null): value is Locale => {
  if (!value) {
    return false;
  }

  return SUPPORTED_LOCALES.includes(value);
};

if (isSupportedLocale(user.preferredLanguage)) {
  applyLocale(user.preferredLanguage);
}
```

### 8. State, Platform APIs, Reusable Infrastructure, and Lifecycle

#### 8.1 Stores Expose Accessors

Stores expose accessor functions such as `getDeviceFlags()` and `setDeviceFlags(flags)`. Actions
and components never assemble snapshots of store internals themselves.

#### 8.2 Platform Storage Uses Manager Classes

Where a target platform provides storage APIs, wrap them in manager classes with static methods.
For browser targets, raw `document.cookie` matching, inline keys passed to `localStorage.getItem`,
and clusters of loose functions over one storage API do not appear in components. Each medium has
one manager that owns encoding and consumes typed keys from the centralized storage constants.

```typescript
export class WebCookieManager {
  static getCookie(name: string): string | null { ... }
  static isCookieSet(name: string, value: string): boolean { ... }
  static setCookie(name: string, value: string, options?: ISetCookieOptions): void { ... }
  static deleteCookie(name: string): void { ... }
}
```

The call site should read `WebCookieManager.getCookie(COOKIE_KEYS.X)`. Domain-specific names such
as `WebCookieManager` are useful; vague names such as `Manager`, `Handler`, or `Utils` are not.

#### 8.3 Reusable Lifecycle Abstractions Are Generic Infrastructure

Hooks, composables, directives, services, and equivalent lifecycle abstractions are shared
infrastructure. Put them in the repository's conventional infrastructure location, write them at
the most generic useful level, and express specific behavior as thin composition.

- One shared event-listener abstraction wraps **all** listener registration and removal. On
  platforms that support `AbortController`, pass its `signal` through the listener options and
  clean up with one `controller.abort()` call. Otherwise use the platform's equivalent disposal
  mechanism. Options such as `capture` and `passive` pass through faithfully. Components and other
  abstractions do not wire listeners directly.
- Parameterize instead of specializing. A keyboard abstraction accepts the key; it is not
  hard-coded for Escape. Valid keys live in a `KEY_TYPES` `as const` object in a constants file,
  with a value type derived from it. Escape handling passes `KEY_TYPES.ESCAPE` and `onClose` to the
  generic abstraction or an equally thin named composition. A name that hard-codes what should be
  an argument is too specific.
- Reusable abstractions own mutable machinery such as timers, throttle state, subscriptions, and
  controllers so components remain `let`-free and declarative.

#### 8.4 Lifecycle Bodies Stay Thin

Mount, effect, subscription, and equivalent lifecycle bodies are orchestration points, not
implementation sites. A lifecycle callback should read as a call to a well-named utility, action,
service, or reusable lifecycle abstraction, optionally with a tiny guard or scheduling wrapper.
Extract multi-step business logic into a function that returns a decision or result, then let the
lifecycle body consume it.

```typescript
const initializeNotificationPrompt = async () => {
  const shouldPrompt = await shouldShowNotificationPrompt();

  if (!shouldPrompt) {
    return;
  }

  scheduleNotificationPrompt();
};
```

Register this named function through the lifecycle API supplied by the active framework or runtime.

#### 8.5 One Date Abstraction

Use the repository's configured date abstraction for all date manipulation; inspect the repository
configuration instead of assuming a particular library or runtime API. Adding or subtracting days,
truncating to the start of a day, comparing dates, and formatting all go through that abstraction.
Raw native-date arithmetic and comparison do not appear in components.

Generic date computations belong in `utilities/date.utility.ts` as generic functions with an
options parameter, such as `getDaysArray({ count, from })`. Components consume them declaratively,
using the framework's memoized or computed-value primitive when reactivity requires it.

```typescript
const dates = getDaysArray({ count: daysCount });
```

### 9. Comments Discipline — Minimal & Intent-Driven

We strictly favor self-documenting code over comments. Code must be readable enough that it acts
as its own documentation.

- **Keep comments to an absolute minimum** — comments are only permissible when explaining _why_ a
  specific decision was made, never _what_ the code is doing.
- **Explain non-conventional logic** — use concise, single-line comments only when implementing
  unconventional logic, workarounds, or handling breaking constraints/limitations that force a
  departure from standard best practices.
- **No multi-line narrative blocks** — never write block comments (`/* ... */`) or stacked `//`
  lines to explain code flow. If code needs narration, refactor it by renaming variables or
  extracting functions instead.

```ts
// ✅ Rare, justified, single-line: explains the why behind an unconventional fix
// Workaround for Safari 16.4 touch event bug where event.preventDefault is ignored.
if (isSafariTouchBug) handleTouchWorkaround();

// ❌ Explaining what the code does
// Filter active users and map to IDs
const activeUserIds = users.filter(user => user.isActive).map(user => user.id);
```

The narrow cases where a comment earns its place:

- **Unusual business constraints or technical limitations** — explaining why standard best
  practice wasn't used.
- **TODO with reason** — include the ticket/bug number and what's blocked, never a bare "fix
  later".

Comments to always delete:

- Redundant explanations of self-describing code.
- Outdated, commented-out code, attribution preambles, or section markers.

### 10. Use `null`, Never `undefined`

we use `null` exclusively to represent "no value". The literal `undefined` keyword must not
appear in source.

- Type unions use `| null`, never `| undefined`.
- Coerce optional inputs at the boundary with `?? null`.
- For optional ternary results, return `null` (e.g. `tools.length > 0 ? tools : null`).
- Use loose `!= null` / `== null` only to test for "missing value" (catches both); use strict
  `=== null` once a value is known to be `null`-or-present.
- To test whether a JSON-parsed object carries a key, prefer the `in` operator
  (`"model" in data`) over `data.model !== undefined`.

```ts
// ✅ null everywhere
const model: string | null = meta.model ?? null;
const tools = list.length > 0 ? list : null;
if ("model" in data && typeof data.model !== "string") errors.push("model: must be a string");

// ❌ undefined leaks in
const model = meta.model; // string | undefined
const tools = list.length > 0 ? list : undefined;
if (data.model !== undefined && typeof data.model !== "string") {
  /* ... */
}
```

> Idiomatic optional members (`field?: string`) remain fine — the ban is on the literal `undefined`
> keyword, not on optional properties.

### 11. TypeScript, Cleanup, and Testing Rules

- Use arrow functions only and ESM only. `let` is prohibited outright and `var` never appears —
  every binding is `const` (see §5.3).
- Use `null`, never the literal `undefined`; optional `?` members remain valid. Use loose `== null`
  or `!= null` only when intentionally checking for either missing value; use strict comparison
  once a value is known to be nullable. Use `in` to test whether parsed external data contains a
  key.
- Remove all unused imports, unused variables, and dead code before submitting a Pull Request.
- Use `I`-prefixed interfaces for object shapes and `T`-prefixed types (see the strict-typing
  policy for the full naming and casting rules). Shared interfaces live in `interfaces/`; a
  component's local input interface may remain in the component file.
- Do not use nested `if` statements, nested ternaries, `else` blocks following an early return, or
  `switch` statements.
- Functions do one thing at one level of abstraction. Extract named helpers instead of commenting
  blocks.
- Break dense boolean and arithmetic expressions into named intermediates that read like a
  sentence.
- Names reveal intent, use no avoidable abbreviations, and never mislead.
- DRY: every piece of knowledge has exactly one authoritative source.
- Route newline and output formatting through the repository's shared formatting utilities.
- Refactor iteratively behind tests; tests are the safety net for structural improvement.
- Use strict typing without escape hatches. Never use `as any`, `as never`, `as unknown as T`,
  `@ts-ignore`, or `any` annotations. Validate external or dynamic data with a type guard or
  converter at the boundary instead of casting it.
- Derived unions follow the established `<Name>Type` convention, such as `ColorModeType` and
  `IconNameType`.
- Delete commented-out code; git retains history. TODOs include the ticket or bug number and the
  reason they are blocked.
- **Automated testing compliance** — if tests exist in the repository, verify that your PR updates
  or adds corresponding tests, ensure full coverage for modified logic, and delete tests that are
  no longer relevant.

### 12. Refactoring

**DRY — Don't Repeat Yourself.** Every piece of knowledge should have one authoritative source.
Duplication creates silent bugs when one copy gets updated but the others don't. Extract shared
logic into a single location.

**Iterative improvement.** Clean code is not written perfectly on the first try. Start messy but
testable, then refactor with confidence. Tests are the safety net that enables fearless
restructuring.

### 13. Version Control & PR Hygiene

- **Review committed files** — before opening or updating a Pull Request, carefully review every
  file included in the commit.
- **Remove AI and temporary files** — remove all generated AI artifacts, temporary log files,
  scratchpad notes, or unwanted config files before requesting review.
- **Delete commented-out code** — git keeps full history; dead code in files creates confusion about
  what's active.
- **TODO comments need context** — include the ticket/bug number and what you're waiting on, not
  just "fix later".

### 14. Verification

Nothing is done on inspection alone. After every change:

- Run the repository's configured formatting command on every touched file.
- Run the repository's typecheck and require it to pass.
- If behavior changed, exercise it with the relevant development server or tests before declaring
  success.
- Execute unit and integration tests to ensure no regressions were introduced.
- Inspect `git status`/diff to confirm no leftover AI or temporary files are present in the commit.

Before considering a change complete, ask:

- Do component files contain only component concerns — constants, helpers, lifecycle wiring, and
  business-logic handlers have all moved to their designated homes?
- Are client-side component variables ordered correctly (constants → styles → context → state →
  memoized values → data fetching → functions)?
- Could this `switch` / `if`-chain be a lookup map — or, if repeated, a polymorphic interface?
- Is there any `else` block used after an early return?
- Does every name reveal intent without needing a comment to translate it?
- Is each function short, single-purpose, and free of hidden side effects?
- Does every non-trivial condition read like a sentence via named variables?
- Do constants and knowledge have a single source, with derived values written as derivations?
- Are async failures reported through `TypedLogger`, and does optimistic state roll back on
  failure?
- Are platform APIs wrapped in manager classes, and are reusable lifecycle abstractions generic
  rather than one-off?
- Are lifecycle bodies thin orchestration calls, and do dates go through the repository's date
  abstraction?
- Is all newline/formatting going through the shared utilities?
- Are CSS rules free of negative margins?
- Are unused imports, variables, and temporary AI files completely removed?
- Are tests added or updated to cover all new or modified behavior?
- Is there a single literal `undefined`, or a forbidden typing escape hatch (`as any`, `as never`,
  `as unknown as T`, `@ts-ignore`, bare `any`), anywhere it should have been fixed?
- Is there any multi-line comment, or any duplicated knowledge, that should have been a refactor?
- Would a new maintainer understand each function without a comment?

---

## Development Workflow — From Board Task to Merge Request

Every piece of work starts on the board and ends on the board. A task is not "in progress" because
someone is typing, and it is not "done" because the code compiles — the board must reflect reality at
each step, and the task itself must carry the evidence that the work was finished.

**Board:** [Team's Goals](https://trello.com/b/0YGKf1tR/teams-goals)

**Golden rule:** never touch code before the task is understood and moved to the active list and a
branch exists for it, and never open a merge request before the proof of completion is attached to
the task.

### 1. The Flow

The steps below are ordered and mandatory. Do not skip a step, and do not reorder them.

1. **Take the task** — the user gives the link to the task on the board.
2. **Read the task and understand its requirements** from that link.
3. **Move it to the active list** on the board, so the board shows who is working on what.
4. **Branch from `dev`** using the task's name.
5. **Implement the task** on that branch.
6. **Attach proof of completion** to the task — evidence plus a summary of what was implemented.
7. **Open a merge request** from the branch into `dev`.
8. **Attach the merge request link** to the task.

### 2. Open the Link and Understand the Task First

The user hands you a **link to the card on the board** — that card, not your assumption of what the
title means, is the specification. Before anything else, open it and read it in full:

- **The description** — the actual requirement and the behavior expected when it is done.
- **The checklists and acceptance criteria** — each one is a condition the implementation must meet.
- **The attachments and comments** — designs, screenshots, reference links, API contracts, and any
  decision already made on the card.
- **The labels and due dates** — the scope and the part of the system the task belongs to.

Restate the requirement back to the user in your own words before starting, and **ask about anything
ambiguous or missing while the task is still in the backlog**. Do not invent scope the card does not
ask for, and do not silently drop scope it does. Everything the card requires is what "done" means
later, when you attach the proof.

### 3. Move the Task to the Active List

Once the task is understood, move it into the **active list** on the board. This happens **before any
code is written**, so the board never shows work sitting in the backlog while it is actually being
built.

If the task is still unclear, resolve it with the user *before* moving it — the active list means
"being worked on right now", not "being figured out".

### 4. Create a Branch from `dev`, Named for the Task

All work happens on a dedicated branch cut from the **latest `dev`**, never directly on `dev` and
never on a branch carried over from an unrelated task. Create it with the **`gh` CLI**, which cuts
the branch from `dev` on the remote and checks it out locally:

```bash
gh repo sync
gh api repos/:owner/:repo/git/refs -f ref="refs/heads/<task-name>" \
  -f sha="$(gh api repos/:owner/:repo/git/ref/heads/dev --jq .object.sha)"
git fetch origin <task-name> && git checkout <task-name>
```

The branch name is the **name of the task** on the board, lowercased and hyphenated, so a branch can
always be traced back to the card it belongs to.

```
add-user-registration-endpoint
fix-dashboard-filter-reset
```

### 5. Implement the Task on That Branch

Write the code for that task and that task only. Work that is not part of the card belongs to a
different card and a different branch.

The other standards in this folder apply here as usual — coding standards, migrations, and the
feedback loops that prove the change actually works.

### 6. Attach Proof of Completion to the Task

Before the merge request exists, the task must be able to stand on its own as a record of the work.
Attach to the card:

- **Evidence that it works** — a screenshot of the tests passing, a screenshot of the UI in its
  intended state, the response of the endpoint you exercised, or the equivalent artifact for the kind
  of work you did.
- **A summary of what was implemented** — what changed, and how each requirement you read on the card
  is now met.

The proof comes from a real feedback loop, not from reading the diff. Anything you could not verify
must be stated explicitly on the card instead of implied.

**Never attach secrets.** Screenshots and pasted output must not expose keys, tokens, or credentials.

### 7. Open the Merge Request into `dev` and Link It Back

Only once the proof is on the card, open a **merge request from the task branch into `dev`** using
the **`gh` CLI**, with the task name as the title and the summary of what was implemented as the
body:

```bash
git push -u origin <task-name>
gh pr create --base dev --head <task-name> --title "<task-name>" --body "<what was implemented>"
```

Then take the URL the command prints — or read it back explicitly — and **paste the merge request
link onto the task**:

```bash
gh pr view --json url --jq .url
```

The card then holds the full story: what was asked, what was built, the proof it works, and where to
review it.

A task without its merge request link is not finished.

---

## Close the Feedback Loop — Prove It Works

Code is not "ready" because it _looks_ like it will work. Before you tell the user something is done,
you must **actually verify it works** with a real feedback loop. The right verification tool depends
on the context — pick from the options below and iterate until you have evidence, not a hunch.

**Golden rule:** run the loop yourself, observe the real output, and only then report success. If you
cannot verify, say so explicitly rather than implying it works.

### 1. New Endpoints → Test Autonomously With cURL

When you build or change an endpoint, exercise it yourself with `curl`, using everything you learned
about its route, method, payload, and auth while implementing it.

- **API-key endpoints:** read the required key from the repo's **`.env`** file and pass it in the
  expected header. **Never commit the key** (or any secret) anywhere — use it only for the live test.

Inspect the status code and body. Loop — adjust the code, re-run — until the response is correct.

### 2. Generic Functions → Unit Tests

For generic/pure functions, verify with **unit tests** via the existing **`unit-test` agent**. Let it
write and run the tests; use failures to drive fixes until green.

### 3. Complex Server Logic → Component Tests

For complex server functions (orchestration across services, guards, pipelines, DB interactions),
write **component tests** using the **`component-test` agent**, and iterate on the results.

### 4. Client-Side → Log In, Debug, and Drive Chrome DevTools MCP

Client debugging is the hardest and most important loop. Verify both that the **component lifecycle**
behaves and that the **rendered result** is correct.

#### Inspect with debugger statements + Chrome DevTools MCP

- Place `debugger;` statements at the points whose behavior you need to confirm.
- Drive the **Chrome DevTools MCP** to run the app, hit those breakpoints, **print/evaluate** state,
  read the **console**, and watch **network requests/responses**.
- Use what you observe to confirm the lifecycle and data flow — or to locate the defect.

### 5. UI Work → Require a Reference, Then Loop Until It Matches

If you are building or changing UI, you **must** have a concrete target to compare against. Ask the
user to supply one of:

- a **screenshot** of the desired design, **or**
- a **Figma link** (use the **Figma MCP** to read the frames/specs), **or**
- an **on-disk folder with reference HTML** that illustrates the intended result.

Then use the **Chrome DevTools MCP** to actually _see_ your rendered output, compare it to the
reference, and run a feedback loop — adjusting styles/markup and re-checking — **until the result
matches the reference.** Do not declare UI done from code inspection alone.

### 6. Hit a Bug? Use the Tools to Decide, Not to Guess

Whenever you run into a bug, reach for the tools above as your feedback loop — cURL for endpoints,
the unit-test/component-test agents for logic, and the Chrome DevTools MCP (with the automation login
and `debugger` statements) for the client. **Base the fix on the tool output**, making educated
decisions from real evidence rather than speculating.

### Secrets Discipline

Any key or token you use to test (from `.env`, the automation API key, minted user tokens) is for the
live verification loop only. **Never commit secrets** to source, config, logs, or anywhere in the
repo.

---

## Migrations — Document Every Schema and Environment Change

Server work that changes how the application is deployed or stored must leave a trace. If a task
touches the **database schema** — adding entities, changing columns, dropping tables — or requires a
**new environment variable**, that change is not finished when the code compiles: it must be
documented as a migration in the repository's `migrations` folder.

**Golden rule:** code changes describe how the app behaves; migrations describe what an operator has
to do to the database and the environment before that code can run. Never leave the second half
implicit.

### 1. When a Migration Is Required

Create a migration whenever the task involves any of the following:

- **Adding or removing entities** — new tables, dropped tables, join tables.
- **Changing columns** — adding, renaming, retyping, or removing a column; changing nullability,
  defaults, indexes, or constraints.
- **Adding environment variables** — any new key the server reads at runtime.

If the task only changes application logic and touches none of the above, no migration file is
needed.

### 2. One File per Migration, Named for Purpose and Date

Every migration is a single new file in the `migrations` folder, named for **what it does** and
**when it was written**:

```
migrations/<YYYY-MM-DD>-<short-purpose>.sql   # schema changes
migrations/<YYYY-MM-DD>-<short-purpose>.md    # environment-only changes
```

```
migrations/2026-08-22-add-users-table.sql
migrations/2026-08-22-add-redis-connection-env.md
```

The purpose must read as the intent of the change, not as a ticket number. Never edit an existing
migration file after it has been applied — write a new one.

### 3. Schema Changes → SQL Script **and** Updated ERD

A schema migration has two deliverables. Both are mandatory; one without the other is an incomplete
migration.

**a. The SQL script.** Write the statements that take the database from its current shape to the new
one — `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `DROP TABLE`, index and constraint changes.

```sql
-- Purpose: add the users table backing the new registration flow.
-- Date: 2026-08-22

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
```

**b. The ERD.** Update the repository's ERD file (for example `database.dbml`) in the same change so
the diagram matches the tables the SQL just created. The ERD is the readable source of truth for the
schema — a migration that changes tables without updating it leaves the diagram lying.

```dbml
Table users {
  id         uuid       [pk, default: `gen_random_uuid()`]
  email      varchar(255) [not null, unique]
  created_at timestamptz  [not null, default: `now()`]
}
```

Keep both sides consistent: every table, column, type, and relation added in SQL appears in the ERD,
and anything dropped in SQL is removed from it.

### 4. Environment Variables → State What to Add and Why

A new env var is a deployment step, so it gets its own migration file. The file does not run
anything — it tells whoever deploys the service exactly what to set. Record:

- **The variable name**, in the exact casing the server reads.
- **Why it is needed** — the feature or integration that depends on it.
- **Whether it is required or optional**, and the default when optional.
- **The shape of the value**, with a non-secret example.

```md
# Add REDIS_URL

Date: 2026-08-22

## What to add

`REDIS_URL` — required.

## Why

The new rate-limit guard stores request counters in Redis instead of in process memory, so the
server cannot start without a reachable Redis instance.

## Value

A Redis connection string, for example `redis://localhost:6379`.
Each environment gets its own instance; use that environment's host.
```

**Never write a real secret into a migration file.** Document the variable's name, purpose, and
format only — the value itself belongs in the environment, never in the repository.
</content>
