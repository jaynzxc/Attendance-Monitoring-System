/**
 * settings.js - Page controller for Super Admin System Settings & API Secrets
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { toast } from '../../components/toast.js';

async function loadSettings() {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data, error } = await sb
      .from('system_settings')
      .select('*');

    if (!error && data && data.length > 0) {
      data.forEach(item => {
        if (item.setting_key === 'student_cutoff') {
          const el = document.getElementById('settingStudentCutoff');
          if (el) el.value = item.setting_value;
        } else if (item.setting_key === 'teacher_cutoff') {
          const el = document.getElementById('settingTeacherCutoff');
          if (el) el.value = item.setting_value;
        } else if (item.setting_key === 'cooldown_minutes') {
          const el = document.getElementById('settingCooldownMins');
          if (el) el.value = item.setting_value;
        } else if (item.setting_key === 'sms_sender_name') {
          const el = document.getElementById('settingSmsSenderName');
          if (el) el.value = item.setting_value;
        }
      });
    }
  } catch (err) {
    console.warn('[Super Admin Settings] Could not load remote settings:', err);
  }
}

async function saveSettings() {
  const studentCutoff = document.getElementById('settingStudentCutoff')?.value || '08:00';
  const teacherCutoff = document.getElementById('settingTeacherCutoff')?.value || '07:30';
  const cooldown = document.getElementById('settingCooldownMins')?.value || '5';
  const smsSender = document.getElementById('settingSmsSenderName')?.value || 'BCP-AMS';

  const sb = getSupabase();
  if (sb) {
    try {
      const updates = [
        { setting_key: 'student_cutoff', setting_value: studentCutoff },
        { setting_key: 'teacher_cutoff', setting_value: teacherCutoff },
        { setting_key: 'cooldown_minutes', setting_value: cooldown },
        { setting_key: 'sms_sender_name', setting_value: smsSender }
      ];

      for (const u of updates) {
        await sb.from('system_settings').upsert(u, { onConflict: 'setting_key' });
      }

      // Log in audit trail
      await sb.from('audit_log').insert({
        action: 'system_settings_updated',
        table_name: 'system_settings',
        details: { studentCutoff, teacherCutoff, cooldown, smsSender }
      });
    } catch (err) {
      console.warn('[Super Admin Settings] DB save warning:', err);
    }
  }

  // Also store in localStorage for offline availability
  localStorage.setItem('ams_cutoff_time', studentCutoff);
  localStorage.setItem('ams_teacher_cutoff_time', teacherCutoff);
  localStorage.setItem('ams_cooldown_minutes', cooldown);

  toast.show('System settings & API credentials saved successfully!', 'success');
}

function initLayoutControls() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  });

  const themeBtn = document.getElementById('themeToggleBtn');
  themeBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ams_theme', next);
  });
}

async function init() {
  await requireRole('super_admin');
  initLayoutControls();

  document.getElementById('btnSaveAllSettings')?.addEventListener('click', saveSettings);
  loadSettings();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
