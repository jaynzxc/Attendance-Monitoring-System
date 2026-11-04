---
name: ponytail
description: Enforce strict minimalism, YAGNI (You Aren't Gonna Need It), native-first solutions, and zero-overengineering for the Bestlink College Attendance Monitoring System. Use when designing, reviewing, or implementing any feature, bug fix, or panelist revision to prevent code bloat, unnecessary dependencies, speculative abstractions, and architectural drift.
---

# Ponytail Skill: Minimalist Engineering & YAGNI Guard

This skill enforces ruthless simplicity, strict **YAGNI ("You Aren't Gonna Need It")**, and anti-overengineering principles for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. 

The core operating mantra is: **"The best code is the code you never wrote."**

---

## Instructions

### Step 1: The YAGNI Filter (Validate Before Writing)
Before touching or proposing any code, evaluate the requirement against these three questions:
1. **Was this explicitly mandated by the defense panelists or `docs/PRD.md`?**
   - If **NO**: Reject it immediately. Do not build speculative features, "future-proofing" logic, or unrequested options.
2. **Can this problem be solved without writing new code?**
   - Use built-in HTML5 validation (`required`, `pattern`, `min`, `max`) instead of custom regex JS libraries.
   - Use PostgreSQL constraints (`CHECK`, `UNIQUE`, `NOT NULL`, foreign keys) instead of writing multi-step backend validation loops.
   - Use Tailwind utility classes directly instead of authoring custom CSS classes.
3. **Can this be achieved by adjusting 3 to 10 lines in an existing module instead of creating a new file?**
   - Prefer surgical modifications over creating new service wrappers, helper files, or speculative abstractions.

---

### Step 2: The Decision Ladder
When code *must* be written, select solutions strictly in this ascending hierarchy of preference:

```
Level 1: Native HTML5 / CSS3 / Browser API (Fastest, zero bundle overhead)
   ▲
Level 2: PostgreSQL Constraint / Existing RPC / Native Supabase Client Query
   ▲
Level 3: Surgical addition to existing asset module (assets/js/api/ or assets/js/pages/)
   ▲
Level 4: New custom function (strictly single-purpose, modular ES6+)
   ▲
Level 5: External npm package or third-party dependency (STRICTLY BANNED without user confirmation)
```

---

### Step 3: Anti-Overengineering Guardrails

1. **Zero Framework Creep:**
   - Never introduce React, Vue, Angular, Svelte, jQuery, Alpine, or server-side rendering frameworks.
   - Adhere strictly to the lightweight Vanilla JS + Tailwind CSS + Supabase architecture.
2. **No Speculative Abstractions:**
   - Do not create abstract base classes, generic factories, event buses, or multi-layer service wrappers for simple one-off tasks.
   - Write clear, linear, purposeful code.
3. **Surgical Diff Principle:**
   - Never rewrite a 300-line working file just to tweak one function. Edit only the lines required for the specific fix.
   - Preserve all surrounding comments, configurations, and function signatures.
4. **No External Libraries for Trivial Tasks:**
   - Do not install `lodash`, `moment.js`, `date-fns`, or `axios`.
   - Use native `fetch()`, native `Date` / `Intl.DateTimeFormat`, and native ES6 array methods (`map`, `filter`, `reduce`).

---

### Step 4: The Accountability Check (Pre-Commit Gate)
Whenever completing a revision or feature implementation, conduct this quick accountability check:

1. **What was deliberately excluded?**
   - Identify any "nice-to-have" ideas that were discarded to keep the codebase lean and stable for the defense.
2. **Did any new dependencies get added?**
   - Ensure `package.json` remains clean and free of unnecessary bloat.
3. **Is the diff atomic and easily explained to the panel?**
   - If an engineering panelist asks, *"Why did you write this?"*, you must be able to point directly to their revision list and explain the change in two sentences.

---

### Step 5: Ponytail Verification Checklist

```markdown
### Ponytail Lean Engineering Audit
- [ ] 1. Requirement directly maps to a specific panelist revision item.
- [ ] 2. Zero speculative helper functions, unused parameters, or dead code.
- [ ] 3. Native platform features used (HTML5 attributes, native Fetch, Postgres constraints).
- [ ] 4. Zero new external npm dependencies introduced.
- [ ] 5. Existing working code was modified surgically rather than completely rewritten.
- [ ] 6. Zero emojis used in user-facing elements or code logs.
```
