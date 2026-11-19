/**
 * dashboard.js - Page controller for Super Admin Overview & Health Console
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { devicesApi } from '../../api/devicesApi.js';
import { openSignOutModal } from '../../components/signOutModal.js';

async function loadInfrastructureTelemetry() {
  const sb = getSupabase();

  try {
    // 1. Load Devices Heartbeat Telemetry
    const devices = await devicesApi.getDevices();
    let onlineCount = 0;
    const now = Date.now();
    devices.forEach(dev => {
      if (dev.status === 'active' || dev.status === 'online') {
        const lastBeat = dev.last_heartbeat ? new Date(dev.last_heartbeat).getTime() : now;
        if ((now - lastBeat) / 60000 <= 5) onlineCount++;
      }
    });

    const statOnlineDevices = document.getElementById('statOnlineDevices');
    if (statOnlineDevices) {
      statOnlineDevices.textContent = `${onlineCount} / ${devices.length}`;
    }

    // 2. Load User Breakdown by Role
    if (sb) {
      const { data: users, error: userErr } = await sb
        .from('users')
        .select('role');

      if (!userErr && users) {
        const counts = {
          super_admin: 0,
          admin: 0,
          staff: 0,
          acad_official: 0,
          monitoring: 0,
          faculty: 0,
          student: 0
        };

        users.forEach(u => {
          const r = u.role === 'teacher' ? 'faculty' : u.role;
          if (counts[r] !== undefined) counts[r]++;
        });

        document.getElementById('countSuperAdmin').textContent = counts.super_admin;
        document.getElementById('countAdmin').textContent = counts.admin;
        document.getElementById('countStaff').textContent = counts.staff;
        document.getElementById('countAcadOfficial').textContent = counts.acad_official;
        document.getElementById('countMonitoring').textContent = counts.monitoring;
        document.getElementById('countFaculty').textContent = counts.faculty;
        document.getElementById('countStudent').textContent = counts.student;
        document.getElementById('statTotalUsers').textContent = users.length;
      }

      // Load parent contacts count
      const { count: parentCount } = await sb
        .from('parent_contacts')
        .select('*', { count: 'exact', head: true });
      if (parentCount !== null) {
        document.getElementById('countParent').textContent = parentCount;
      }

      // 3. Load Recent Audit Trail
      const { data: auditEvents, error: auditErr } = await sb
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);

      const tbody = document.getElementById('recentAuditEventsBody');
      if (tbody) {
        if (auditErr || !auditEvents || auditEvents.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" class="py-6 text-center text-slate-400">No system audit events recorded yet.</td>
            </tr>
          `;
        } else {
          tbody.innerHTML = auditEvents.map(evt => {
            const timeStr = new Date(evt.created_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const detailsStr = evt.details ? JSON.stringify(evt.details).substring(0, 80) : '--';

            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums">${timeStr}</td>
                <td class="py-2.5 px-3">
                  <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                    System
                  </span>
                </td>
                <td class="py-2.5 px-3 font-medium text-slate-800">${evt.action}</td>
                <td class="py-2.5 px-3 font-mono text-slate-600">${evt.table_name || '--'}</td>
                <td class="py-2.5 px-3 text-slate-500 truncate max-w-xs" title="${detailsStr}">${detailsStr}</td>
              </tr>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.error('[Super Admin] Error loading telemetry:', err);
  }
}

function initLayoutControls() {
  // Mobile sidebar toggle
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

  // Profile Dropdown
  const profileBtn = document.getElementById('profileDropdownBtn');
  const profileMenu = document.getElementById('profileDropdownMenu');
  profileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenu?.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    profileMenu?.classList.add('hidden');
  });

  // Theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  themeBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ams_theme', next);
  });

  // Sign out button
  document.getElementById('btnSignOut')?.addEventListener('click', () => {
    openSignOutModal();
  });
}

async function init() {
  await requireRole('super_admin');
  initLayoutControls();
  await loadInfrastructureTelemetry();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
