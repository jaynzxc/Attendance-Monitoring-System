---
name: ams-ui-ux
description: Enforce the Color Hunt Blue design system, dual-theme switching, WCAG AA accessibility, Anti AI Slop standards, and the strict No Emoji (use SVG icons only) rule for the Bestlink College Attendance Monitoring System. Use when designing, creating, or modifying HTML views, Tailwind CSS styles, components, charts, and dashboard layouts.
---

# AMS UI/UX Skill

This skill enforces the visual identity, Color Hunt design tokens, theme dynamics, and iconography standards for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)**.

## Instructions

### Step 1: Color Hunt Blue Palette Enforcement
All views and components must strictly use the official Color Hunt palette tokens:
```css
/* Color Hunt Blue Palette */
--ch-900: #0D47A1; /* Deep Royal Navy: Primary brand mark, authoritative headings, dark foundations */
--ch-500: #2196F3; /* Vibrant Primary Blue: Interactive buttons, CTAs, active nav links, trend line */
--ch-200: #90CAF9; /* Pastel Sky Blue: Card borders, chart target line, focus rings, subtle tags */
--ch-100: #E3F2FD; /* Soft Ice Blue: Light canvas background, badge backdrops, pill highlights */

/* Semantic Status Tokens */
--present: #10B981; --present-soft: rgba(16, 185, 129, 0.12);
--late:    #F59E0B; --late-soft:    rgba(245, 158, 11, 0.12);
--absent:  #EF4444; --absent-soft:  rgba(239, 68, 68, 0.12);
--excused: #0288D1; --excused-soft: rgba(2, 136, 209, 0.12);
```

### Step 2: Strict Iconography Rule — No Emoji, Just Use an Icon Instead
- **Strict Emoji Ban:** NEVER use raw Unicode emojis (e.g., 📊, 🚀, 🔔, ⚠️, ❌, ✅, 📅, 👤, 🏫) anywhere in UI views, buttons, navigation bars, KPI cards, table rows, badges, modal dialogs, toast notifications, or console logs.
- **Crisp Vector SVGs:** Always use clean, lightweight, scalable SVG vector icons (or standardized icon libraries like Lucide, Heroicons, or FontAwesome).
- **Tailwind Styling:** Size and color icons using utility classes (e.g., `<svg class="w-5 h-5 text-ch-500" ...>`).
- **Accessibility:** Include `aria-hidden="true"` on decorative icons and provide `<span class="sr-only">Description</span>` for icon-only action buttons.
- **Rationale:** Emojis degrade academic institutional prestige, render unpredictably across OS platforms, and clash with the institutional Color Hunt design system.

### Step 3: Anti AI Slop in Frontend Code
- **No Generic AI Boilerplate:** Avoid generic, cluttered markup or unnecessary wrapper divs. Use semantic HTML5 (`<aside>`, `<header>`, `<main>`, `<nav>`, `<section>`).
- **No Inline Style Sprawl:** Rely on Tailwind utility classes and design system CSS custom properties (`:root`).
- **No Obvious Comments:** Eliminate trivial comments like `// button click listener` or `// render table`.
- **Consistent Dimensions:** Maintain exact radius tokens: card radius `14px` (`rounded-[14px]`), button radius `8px` (`rounded-lg`), pill radius `20px` (`rounded-full`).

### Step 4: Dual-Theme Switching & Dynamic Charts
- Support Light Mode (`[data-theme="light"]`, default) and Midnight Navy (`[data-theme="dark"]`).
- Re-render Chart.js grid lines, text colors, and background gradients dynamically on theme toggle without full page reloads.

### Step 5: Layout Stability & Typography
- Enforce `font-variant-numeric: tabular-nums` (`tabular-nums`) on all timestamps, counters, student IDs, and KPI metrics to eliminate layout jitter.
- Implement animated count-up numerical transitions on dashboard KPIs.
- Ensure minimum **WCAG 2.1 AA** contrast ratios (`4.5:1` body text, `3.0:1` UI components).
