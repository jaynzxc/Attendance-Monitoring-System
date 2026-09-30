/**
 * analytics.js - Student Personal Attendance Analytics & Honors Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let arrivalTimeChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    role: 'student'
  };

  // 3. Initialize Certificate Frame
  const certName = document.getElementById('certStudentName');
  if (certName) {
    certName.textContent = `${currentStudent.first_name || ''} ${currentStudent.last_name || ''}`.trim() || 'Juan Dela Cruz';
  }

  // 4. Load Retention & Policy Standing
  await loadRetentionStanding(currentStudent.id);

  // 5. Render Arrival Distribution Chart
  await renderArrivalChart(currentStudent.id);

  // 6. Load Parent SMS Dispatch Logs
  await loadParentAlerts(currentStudent.id);

  // 7. Theme change redraw listener
  window.addEventListener('ams-theme-changed', () => {
    if (currentStudent) {
      renderArrivalChart(currentStudent.id);
    }
  });
});

async function loadRetentionStanding(studentId) {
  const policyRateBadge = document.getElementById('policyRateBadge');
  const policyStandingTitle = document.getElementById('policyStandingTitle');
  const meterPercent = document.getElementById('meterPercent');
  const meterFill = document.getElementById('meterFill');
  const awardStatusPill = document.getElementById('awardStatusPill');

  try {
    const stats = await attendanceApi.getStudentAttendanceStats(studentId);
    const rate = stats.attendanceRate;

    if (policyRateBadge) policyRateBadge.textContent = `${rate}% Rate`;
    if (meterPercent) meterPercent.textContent = `${rate}%`;
    if (meterFill) {
      meterFill.style.width = `${Math.min(rate, 100)}%`;
      if (rate >= 85) {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-emerald-500';
      } else if (rate >= 75) {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-amber-500';
      } else {
        meterFill.className = 'h-full rounded-full transition-all duration-500 bg-rose-500';
      }
    }

    if (policyStandingTitle) {
      if (rate >= 90) {
        policyStandingTitle.textContent = 'In Good Standing — Above 85% Minimum Requirement';
      } else if (rate >= 85) {
        policyStandingTitle.textContent = 'Near Cutoff — Maintain Attendance to Stay Compliant';
      } else {
        policyStandingTitle.textContent = 'Academic Warning — Below 85% Attendance Threshold';
        policyStandingTitle.className = 'text-base font-bold text-rose-600 dark:text-rose-400';
      }
    }

    if (awardStatusPill) {
      if (stats.isAwardEligible) {
        awardStatusPill.className = 'pill pill-present text-[11px] uppercase font-bold';
        awardStatusPill.textContent = 'Qualified';
      } else {
        awardStatusPill.className = 'pill pill-late text-[11px] uppercase font-bold';
        awardStatusPill.textContent = 'In Progress';
      }
    }
  } catch (err) {
    console.error('[AMS Student Analytics] Error loading retention standing:', err);
  }
}

async function renderArrivalChart(studentId) {
  const ctx = document.getElementById('arrivalTimeChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (arrivalTimeChartInstance) {
    arrivalTimeChartInstance.destroy();
  }

  // Sample arrival curve for enrolled student
  const labels = ['Before 07:30', '07:30 - 07:45', '07:45 - 08:00', '08:01 - 08:30 (Late)', 'After 08:30'];
  const data = [14, 22, 5, 2, 0];

  arrivalTimeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Arrival Taps',
        data,
        backgroundColor: [
          '#10B981',
          '#2196F3',
          '#60A5FA',
          '#F59E0B',
          '#EF4444'
        ],
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: isDark ? '#1A3866' : '#E2ECF7' },
          ticks: {
            stepSize: 5,
            color: isDark ? '#90CAF9' : '#4A657E'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: isDark ? '#90CAF9' : '#4A657E',
            font: { size: 10 }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#0C1D38' : '#0D47A1',
          titleColor: '#FFFFFF',
          bodyColor: '#E3F2FD',
          borderColor: '#2196F3',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` Gate Scans: ${ctx.parsed.y} days`
          }
        }
      }
    }
  });
}

async function loadParentAlerts(studentId) {
  const tbody = document.getElementById('parentAlertsTableBody');
  if (!tbody) return;

  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data: alerts } = await sb
      .from('alerts_log')
      .select('*')
      .eq('student_id', studentId)
      .order('sent_at', { ascending: false })
      .limit(5);

    if (alerts && alerts.length > 0) {
      tbody.innerHTML = alerts.map(a => {
        const dateFormatted = new Date(a.sent_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });
        const timeFormatted = new Date(a.sent_at).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: true
        });

        const isDelivered = a.status === 'sent' || a.status === 'delivered';
        const typeBadge = a.alert_type === 'absent' ? 'pill-absent' : 'pill-late';
        const typeLabel = a.alert_type === 'absent' ? 'Absence Alert' : 'Tardiness Notice';

        return `
          <tr class="hover:bg-[var(--surface-hover)] transition-colors">
            <td class="py-3 px-4 font-mono text-xs tabular-nums" style="color: var(--text-2);">${dateFormatted} · ${timeFormatted}</td>
            <td class="py-3 px-4">
              <span class="pill ${typeBadge} text-[10px] uppercase font-bold tracking-wider">${typeLabel}</span>
            </td>
            <td class="py-3 px-4 text-xs font-mono" style="color: var(--text-2);">${a.message_body || 'SMS Notification'}</td>
            <td class="py-3 px-4">
              <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold ${isDelivered ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700'}">
                ${isDelivered ? 'Delivered (Semaphore)' : 'Pending'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('[AMS Student Analytics] Alerts load note:', err);
  }
}
