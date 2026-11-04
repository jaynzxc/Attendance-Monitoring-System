---
name: testing-e2e
description: Design, author, and execute automated end-to-end (E2E) browser tests using Playwright for the Bestlink College Attendance Monitoring System. Use when writing automated test suites, establishing resilient UI selector conventions, simulating user flows across Admin, Teacher, and Student portals, or integrating test runs into CI/CD pipelines.
---

# End-to-End (E2E) Testing Skill

This skill defines the authoritative specification and best practices for automated browser-based end-to-end testing using **Playwright** for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. It ensures all critical user journeys remain resilient, regression-free, and verifiable across releases.

---

## Instructions

### Step 1: E2E Test Suite Architecture & Directory Structure
Automated E2E tests reside in the `tests/e2e/` directory and are organized by functional domain:

```
tests/e2e/
├── fixtures/                      # Seed data fixtures and test user definitions
│   └── test-users.json
├── helpers/                       # Reusable authentication and navigation helpers
│   ├── auth.helper.js             # Fast session login via Supabase API or UI
│   └── realtime.helper.js         # WebSocket sync wait utilities
├── suites/
│   ├── 01_auth_guard.spec.js      # RBAC, login redirects, and 403 barriers
│   ├── 02_ingress_scan.spec.js    # RFID/QR scan emulation & Realtime stream update
│   ├── 03_excuse_slip.spec.js     # Student submission -> Teacher/Admin approval lifecycle
│   └── 04_teacher_rollcall.spec.js# Section attendance and manual override
└── playwright.config.js           # Playwright configuration (baseURL, timeouts, viewports)
```

---

### Step 2: Resilient Selector Conventions
To ensure tests do not break when Tailwind utility classes or layout styling changes, tests must adhere strictly to these selector rules:

1. **Preferred: Accessible Role Selectors:**
   ```javascript
   page.getByRole('button', { name: /sign in/i });
   page.getByRole('heading', { level: 1, name: /attendance logs/i });
   page.getByLabel('Student ID');
   ```
2. **Dedicated Test Attributes (`data-testid`):**
   When semantic labels are insufficient (e.g., dynamically rendered KPI cards or table action buttons), use `data-testid`:
   ```javascript
   page.locator('[data-testid="kpi-present-count"]');
   page.locator('[data-testid="approve-slip-btn"]');
   ```
3. **Strict Ban:** NEVER select elements using unstable Tailwind utility class strings (e.g., `button.bg-blue-600.px-4.py-2`).

---

### Step 3: Test Suite Specifications

#### Suite 1: Authentication & Route Protection (`01_auth_guard.spec.js`)
* **Test Case 1.1:** Unauthenticated navigation to `/admin/dashboard.html` redirects to `/index.html`.
* **Test Case 1.2:** Successful login with valid Student credentials navigates to `/student/dashboard.html` and persists session in `localStorage`.
* **Test Case 1.3:** Authenticated Student attempting to access `/admin/users.html` is redirected to `/shared/unauthorized.html` (403 Forbidden).
* **Test Case 1.4:** Sign out button revokes Supabase session and redirects to `/index.html`.

#### Suite 2: Ingress & Realtime Stream Update (`02_ingress_scan.spec.js`)
* **Test Case 2.1 (Present):** 
  1. Open Admin Dashboard `/admin/dashboard.html`. Note initial present count.
  2. Dispatch a simulated on-time scan payload to `/functions/v1/scan-ingest`.
  3. Assert that the live scan table in Admin updates within 2 seconds with the student's name and **Present** badge.
  4. Assert that the KPI present counter increments by 1.
* **Test Case 2.2 (Cooldown):**
  1. Dispatch the identical scan payload within 5 minutes.
  2. Expect HTTP 429 response.
  3. Assert that no duplicate row appears in the Admin live table.

#### Suite 3: Excuse Slip Workflow (`03_excuse_slip.spec.js`)
* **Test Case 3.1:** Log in as Student. Open `/student/excuse-slip-submit.html`.
* **Test Case 3.2:** Fill reason, select date, attach a sample PDF proof (`tests/fixtures/sample-proof.pdf`), and submit.
* **Test Case 3.3:** Assert confirmation toast appears and slip is listed as **Pending**.
* **Test Case 3.4:** Log in as Teacher/Admin. Open `/teacher/excuse-slips.html`.
* **Test Case 3.5:** Locate the pending slip, click "Approve", enter review note.
* **Test Case 3.6:** Assert slip status changes to **Approved** in both Admin and Student portals.

---

### Step 4: Web-First Assertions & Realtime Handling
AMS relies heavily on Supabase Realtime WebSocket events. To prevent flaky tests caused by network latency:

1. Always use **Web-First Assertions** with automatic retries:
   ```javascript
   // Recommended: Auto-retries until timeout (default 5000ms)
   await expect(page.locator('[data-testid="live-scan-stream"]')).toContainText('Juan Dela Cruz');
   await expect(page.locator('[data-testid="kpi-present-count"]')).toHaveText('42');
   ```
2. **Never** use hardcoded arbitrary delays:
   ```javascript
   // STRICTLY FORBIDDEN:
   await page.waitForTimeout(3000); // Flaky and prohibited
   ```
3. Wait for network idle or specific Supabase REST responses when submitting forms:
   ```javascript
   await Promise.all([
     page.waitForResponse(resp => resp.url().includes('/rest/v1/excuse_slips') && resp.status() === 201),
     page.getByRole('button', { name: /submit excuse slip/i }).click()
   ]);
   ```

---

### Step 5: Test Execution & Local Runner Commands

```bash
# Run all E2E test suites in headless mode
npx playwright test

# Run a specific test suite
npx playwright test tests/e2e/suites/01_auth_guard.spec.js

# Run with interactive UI mode for debugging
npx playwright test --ui

# Run with visible browser window (headed)
npx playwright test --headed
```

---

### Step 6: Test Isolation & Cleanup Rules
* Each test run must use dedicated test accounts defined in environment variables (`E2E_STUDENT_EMAIL`, `E2E_TEACHER_EMAIL`, `E2E_ADMIN_EMAIL`).
* Never use production accounts or modify production data during test execution.
* Test fixtures that insert database records must clean up created rows via `test.afterAll()` hooks or reset the staging database state.

