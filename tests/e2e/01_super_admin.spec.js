// tests/e2e/01_super_admin.spec.js - Super Admin Role & Portal E2E Tests
// Reference: skills/testing-e2e/SKILL.md, user_type_expansion_plan.md

import { test, expect } from '@playwright/test';

test.describe('Super Admin Access Control & Portal Verification', () => {

  test('TC-1: Unauthenticated visitor accessing /super-admin/dashboard.html is redirected to /index.html', async ({ page }) => {
    await page.goto('/super-admin/dashboard.html');
    await expect(page).toHaveURL(/index\.html/);
  });

  test('TC-2: Authenticated Student is blocked from /super-admin/dashboard.html with 403 unauthorized redirect', async ({ page }) => {
    // Inject student role in session
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'student');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        role: 'student'
      }));
    });

    await page.goto('/super-admin/dashboard.html');
    await expect(page).toHaveURL(/shared\/unauthorized\.html/);
  });

  test('TC-3: Authenticated Admin is blocked from /super-admin/dashboard.html with 403 unauthorized redirect', async ({ page }) => {
    // Inject registrar admin role in session
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Registrar',
        last_name: 'Admin',
        role: 'admin'
      }));
    });

    await page.goto('/super-admin/dashboard.html');
    await expect(page).toHaveURL(/shared\/unauthorized\.html/);
  });

  test('TC-4: Super Admin session successfully accesses /super-admin/dashboard.html and renders all console widgets', async ({ page }) => {
    // Inject super_admin role in session
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin',
        email: 'superadmin@bcp.edu.ph'
      }));
    });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/super-admin/dashboard.html');

    // Assert main header and branding
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Super Admin Console/i);
    await expect(page.locator('.brand')).toContainText(/SUPER ADMIN/i);

    // Assert Core Subsystems and KPI widgets are rendered
    await expect(page.getByText('Active ESP32 Scanners')).toBeVisible();
    await expect(page.getByText('SMS Gateway Pipeline')).toBeVisible();
    await expect(page.getByText('Gmail Alert Engine')).toBeVisible();
    await expect(page.getByText('8-Role System Hierarchy')).toBeVisible();
    await expect(page.getByText('Recent Infrastructure & Security Events')).toBeVisible();

    // Check zero fatal console errors
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
    expect(fatalErrors.length).toBe(0);
  });

  test('TC-5: Super Admin Hardware Device Hub (/super-admin/devices.html) renders registry and provisioning controls', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin'
      }));
    });

    await page.goto('/super-admin/devices.html');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ESP32 Scanner Hub/i);
    await expect(page.locator('#btnRegisterDevice')).toBeVisible();
    await expect(page.locator('#totalScannersCount')).toBeVisible();
    await expect(page.locator('#devicesTableBody')).toBeVisible();
  });

  test('TC-6: Super Admin User Role Hierarchy (/super-admin/users.html) renders 8-role controls and search filter', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin'
      }));
    });

    await page.goto('/super-admin/users.html');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Institutional Role Hierarchy Management/i);
    await expect(page.locator('#btnCreateUser')).toBeVisible();
    await expect(page.locator('#userSearchInput')).toBeVisible();
    await expect(page.locator('#userRoleFilter')).toBeVisible();

    // Assert 8-role filter options exist
    const roleOptions = await page.locator('#userRoleFilter option').allInnerTexts();
    expect(roleOptions.some(opt => opt.includes('Super Admin'))).toBeTruthy();
    expect(roleOptions.some(opt => opt.includes('Staff'))).toBeTruthy();
    expect(roleOptions.some(opt => opt.includes('Monitoring'))).toBeTruthy();
    expect(roleOptions.some(opt => opt.includes('Acad Official'))).toBeTruthy();
  });

  test('TC-7: Super Admin Settings (/super-admin/settings.html) renders global cutoffs and API secrets form', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin'
      }));
    });

    await page.goto('/super-admin/settings.html');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/System Infrastructure & API Secrets/i);
    await expect(page.locator('#btnSaveAllSettings')).toBeVisible();
    await expect(page.locator('#settingStudentCutoff')).toBeVisible();
    await expect(page.locator('#settingTeacherCutoff')).toBeVisible();
    await expect(page.locator('#settingCooldownMins')).toBeVisible();
    await expect(page.locator('#settingSmsApiKey')).toBeVisible();
    await expect(page.locator('#settingEmailHost')).toBeVisible();
  });

  test('TC-8: Super Admin Audit Trail (/super-admin/audit.html) renders immutable log and CSV export button', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin'
      }));
    });

    await page.goto('/super-admin/audit.html');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Immutable System Audit Trail/i);
    await expect(page.locator('#btnExportAuditCsv')).toBeVisible();
    await expect(page.locator('#auditSearchInput')).toBeVisible();
    await expect(page.locator('#auditTableBody')).toBeVisible();
  });

  test('TC-9: Super Admin Navigation sidebar links route between all 5 console pages without error', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ams_cached_role', 'super_admin');
      sessionStorage.setItem('ams_cached_user', JSON.stringify({
        first_name: 'Chief',
        last_name: 'Admin',
        role: 'super_admin'
      }));
    });

    await page.goto('/super-admin/dashboard.html');

    // Click Hardware Device Hub link
    await page.locator('aside.sidebar a[href="devices.html"]').click();
    await expect(page).toHaveURL(/devices\.html/);

    // Click User Role Hierarchy link
    await page.locator('aside.sidebar a[href="users.html"]').click();
    await expect(page).toHaveURL(/users\.html/);

    // Click System & API Settings link
    await page.locator('aside.sidebar a[href="settings.html"]').click();
    await expect(page).toHaveURL(/settings\.html/);

    // Click System Audit Trail link
    await page.locator('aside.sidebar a[href="audit.html"]').click();
    await expect(page).toHaveURL(/audit\.html/);

    // Click back to Overview
    await page.locator('aside.sidebar a[href="dashboard.html"]').click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

});

