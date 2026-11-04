---
name: a11y-audit
description: Audit and enforce web accessibility (WCAG 2.1 AA), Color Hunt palette contrast, tabular numerals layout stability, and strict SVG iconography (zero-emoji standard) across all frontend portals in the Bestlink College Attendance Monitoring System. Use when building or refactoring UI components, styling forms, adding real-time indicators, or preparing for defense visual evaluation.
---

# Accessibility (a11y) & UI/UX Audit Skill

This skill defines the visual quality, accessibility standards, and design system verification procedures for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**. It guarantees that all portal pages across Admin, Teacher, and Student interfaces meet institutional presentation standards, maintain high contrast compliance, and deliver layout stability.

---

## Instructions

### Step 1: Color Hunt Blue Palette Compliance
All user interface elements must strictly adhere to the official **Color Hunt Blue Palette** tokens defined in `:root`:

```css
/* Color Hunt Blue Palette */
--ch-900: #0D47A1; /* Deep Royal Navy: Primary brand mark, headings, dark foundations */
--ch-500: #2196F3; /* Vibrant Primary Blue: Interactive CTAs, active navigation, trend lines */
--ch-200: #90CAF9; /* Pastel Sky Blue: Card borders, focus rings, subtle tags */
--ch-100: #E3F2FD; /* Soft Ice Blue: Light canvas background, badge backdrops */

/* Semantic Attendance Status Tokens */
--present: #10B981; --present-soft: rgba(16, 185, 129, 0.12);
--late:    #F59E0B; --late-soft:    rgba(245, 158, 11, 0.12);
--absent:  #EF4444; --absent-soft:  rgba(239, 68, 68, 0.12);
--excused: #0288D1; --excused-soft: rgba(2, 136, 209, 0.12);
```

* **Pass Criteria:**
  - Verify that borders use consistent radii: cards (`14px` / `rounded-xl`), buttons (`8px` / `rounded-lg`), badges/pills (`20px` / `rounded-full`).
  - Confirm semantic status colors are applied consistently across tables, badges, and calendar cells.

---

### Step 2: Dual-Theme Contrast Audit (WCAG 2.1 AA)
Every page must support authoritative **Light Mode** (`[data-theme="light"]`) and **Midnight Navy Dark Mode** (`[data-theme="dark"]`).

1. **Contrast Ratio Thresholds:**
   - **Body text and table data:** Minimum **4.5:1** contrast ratio against its surface.
   - **Large text, headings, and interactive buttons:** Minimum **3.0:1** contrast ratio.
2. **Theme Switching Verification:**
   - Toggle theme switch in the top navigation bar.
   - Confirm background switches between soft canvas (`--ch-100` / `#F8FAFC`) and Midnight Navy (`#0B1528`).
   - Verify that Chart.js axes, grid lines, and tooltips re-render their color tokens immediately without requiring a browser page reload.

---

### Step 3: Layout Stability & Tabular Numerals Verification
When real-time attendance scans trigger live counter updates, the UI must never experience visual layout shifts (CLS):

1. **Enforce Tabular Numerals:**
   Verify that all KPI counters, timestamps, percentage rates, and student ID numbers apply `font-variant-numeric: tabular-nums` or the Tailwind class `tabular-nums`:
   ```html
   <!-- Correct implementation -->
   <span class="tabular-nums font-semibold text-lg text-slate-800">08:04:12 AM</span>
   <div class="tabular-nums text-3xl font-bold" data-testid="kpi-present-count">142</div>
   ```
2. **Layout Jitter Check:**
   - During live scan ingestion, observe KPI cards.
   - Digits must animate smoothly via count-up transitions without shifting adjacent cards or table column widths.

---

### Step 4: Strict Iconography Standard (Zero-Emoji Ban)
Institutional capstone guidelines strictly prohibit the use of raw Unicode emojis in any portal:

1. **Strictly Prohibited:** NEVER use Unicode emojis (e.g., 📊, 🚀, 🔔, ⚠️, ❌, ✅, 📅, 👤) in:
   - Sidebar navigation links and headers
   - Table rows, status badges, and action buttons
   - Modal dialogs and toast alert messages
   - Console logs or error dialogs
2. **Required Standard:** Always use crisp, scalable vector SVG icons (e.g., Lucide, Heroicons, or Feather SVGs) with explicit dimensions:
   ```html
   <!-- Correct: Crisp SVG vector icon -->
   <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
   </svg>
   ```
3. **Automated Audit Check:**
   Run a scan for common emoji Unicode ranges across all portal HTML and JS files:
   ```powershell
   Get-ChildItem -Path ./admin, ./teacher, ./student, ./shared -Filter *.html | 
     Select-String -Pattern "[\uD83C-\uDBFF\uDC00-\uDFFF]"
   ```
   **Pass Criteria:** Zero emoji occurrences returned.

---

### Step 5: Screen Reader Accessibility & Live Regions
AMS features real-time WebSocket feeds that update without user interaction:

1. **Live Regions:**
   - The live gate scanner table or notification toast container must include `aria-live="polite"` and `aria-atomic="true"`.
   - This ensures screen readers announce incoming scans without rudely interrupting current focus.
2. **Form Input Labels:**
   - Every `<input>`, `<select>`, and `<textarea>` must have an explicitly associated `<label for="inputId">` or `aria-label`.
   - Never rely solely on `placeholder` attributes for form labeling.
3. **Keyboard Navigation & Focus Rings:**
   - Tab through the page: confirm logical focus order from top navigation to main content.
   - Interactive elements must show a distinct, accessible focus ring using `--ch-200` or `ring-2 ring-blue-500`.

---

### Step 6: Quick a11y Audit Checklist

```markdown
### AMS Accessibility & Design Audit Checklist
- [ ] 1. All text meets WCAG 2.1 AA 4.5:1 contrast in both Light and Dark themes.
- [ ] 2. All KPI counters, percentages, and timestamps use tabular-nums.
- [ ] 3. Zero raw emojis used anywhere in UI; all icons are clean vector SVGs.
- [ ] 4. Real-time scan containers declare aria-live="polite".
- [ ] 5. All form controls have associated <label> elements.
- [ ] 6. Live gate feed features pulsing indicator (@keyframes pulse-dot).
- [ ] 7. Theme toggle updates Chart.js colors dynamically without page reload.
```

