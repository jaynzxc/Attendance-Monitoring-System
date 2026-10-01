/**
 * analytics.js - Page controller for Institutional Performance Analytics
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let programChartInstance = null;
let arrivalChartInstance = null;

/**
 * Renders or updates the Program Comparison Bar Chart
 */
function renderProgramChart() {
  const ctx = document.getElementById('programBarChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';

  if (programChartInstance) programChartInstance.destroy();

  programChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['BSIT', 'BSIS', 'BSEMC', 'BSCS'],
      datasets: [{
        label: 'Attendance Rate (%)',
        data: [94.5, 92.1, 89.8, 93.6],
        backgroundColor: [
          '#2196F3',
          '#0D47A1',
          '#90CAF9',
          '#1976D2'
        ],
        borderRadius: 6,
        maxBarThickness: 54
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
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
          displayColors: false,
          callbacks: {
            title: (items) => `Department: ${items[0].label}`,
            label: (c) => ` Attendance Rate: ${c.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11.5, weight: '600' } },
          grid: { display: false }
        },
        y: {
          ticks: { color: textColor, font: { size: 11 }, callback: v => v + '%' },
          grid: { color: gridColor },
          min: 80,
          max: 100
        }
      }
    }
  });
}

/**
 * Renders or updates the Morning Arrival Curve Chart
 */
function renderArrivalCurve() {
  const ctx = document.getElementById('arrivalCurveChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';

  if (arrivalChartInstance) arrivalChartInstance.destroy();

  arrivalChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['06:45', '07:00', '07:15', '07:30', '07:45', '08:00 (Cutoff)', '08:15', '08:30'],
      datasets: [{
        label: 'Arrival Volume',
        data: [45, 120, 290, 480, 520, 210, 65, 20],
        borderColor: '#2196F3',
        backgroundColor: isDark ? 'rgba(33, 150, 243, 0.25)' : 'rgba(33, 150, 243, 0.15)',
        fill: true,
        cubicInterpolationMode: 'monotone',
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 20,
        pointBackgroundColor: '#0D47A1',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 1.5,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
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
          displayColors: false,
          callbacks: {
            title: (items) => `Time Slot: ${items[0].label}`,
            label: (c) => ` Arrival Volume: ${c.parsed.y} students`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10.5 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        }
      }
    }
  });
}

/**
 * Initializes Analytics view
 */
async function init() {
  await requireRole(['admin']);

  renderProgramChart();
  renderArrivalCurve();

  window.addEventListener('ams-theme-changed', () => {
    renderProgramChart();
    renderArrivalCurve();
  });

  document.getElementById('timeRangeSelect')?.addEventListener('change', () => {
    toast.show('Analytics timeframe updated.', 'info');
    renderProgramChart();
    renderArrivalCurve();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
