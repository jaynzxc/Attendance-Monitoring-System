/**
 * charts.js - Reusable Chart.js components with theme awareness
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

const trendChartInstances = {};
const radialChartInstances = {};
const comparisonChartInstances = {};

/**
 * Renders or updates the attendance trend analytics line chart.
 * Automatically adapts gradient, grid, target line, and typography to current light/dark theme.
 * @param {string} canvasId - Canvas element ID (e.g. 'trendChart' or 'facultyTrendChart')
 * @param {Object} [customData] - Optional datasets and labels
 * @returns {Chart|null}
 */
export function renderTrendChart(canvasId = 'trendChart', customData = null) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (trendChartInstances[canvasId]) {
    trendChartInstances[canvasId].destroy();
  }

  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';
  const targetColor = isDark ? '#90CAF9' : '#0D47A1';

  const defaultLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
  const defaultPresentData = [88, 90, 87, 93, 94];
  const defaultTargetData = [92, 92, 92, 92, 92];

  const presentData = (customData?.presentData || defaultPresentData).map(v => Math.min(100, Math.max(0, Number(v) || 0)));
  const targetData = customData?.targetData || defaultTargetData;
  const labels = customData?.labels || defaultLabels;

  // Calculate smart lower bound so line uses vertical height without clipping
  const allValues = [...presentData, ...(targetData || [])].filter(v => typeof v === 'number' && !isNaN(v));
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 80;
  const dynamicMin = Math.max(0, Math.min(80, Math.floor((minVal - 6) / 5) * 5));

  trendChartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: customData?.presentLabel || 'Present rate',
          data: presentData,
          borderColor: '#2196F3',
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: cCtx, chartArea } = chart;
            if (!chartArea) return isDark ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.12)';
            const grad = cCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            if (isDark) {
              grad.addColorStop(0, 'rgba(33, 150, 243, 0.40)');
              grad.addColorStop(1, 'rgba(33, 150, 243, 0.01)');
            } else {
              grad.addColorStop(0, 'rgba(33, 150, 243, 0.24)');
              grad.addColorStop(1, 'rgba(227, 242, 253, 0.02)');
            }
            return grad;
          },
          fill: true,
          cubicInterpolationMode: 'monotone',
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6.5,
          pointHitRadius: 20,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: '#FFFFFF',
          pointBackgroundColor: '#2196F3',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          borderWidth: 2.5
        },
        {
          label: customData?.targetLabel || 'Target (92%)',
          data: targetData,
          borderColor: targetColor,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 0,
          borderWidth: 1.75,
          tension: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: customData?.hideLegend ? 6 : 10,
          right: 12,
          bottom: 4,
          left: 4
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: customData?.hideLegend ? false : true,
          position: 'top',
          align: 'end',
          labels: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif", weight: '500' },
            boxWidth: 14,
            boxHeight: 2,
            usePointStyle: false,
            padding: 10
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#0C1D38' : '#0D47A1',
          titleColor: '#FFFFFF',
          bodyColor: '#E3F2FD',
          borderColor: '#2196F3',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11, family: "'Inter', sans-serif" } },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif" },
            callback: (v) => v + '%',
            stepSize: 5
          },
          grid: { color: gridColor },
          min: dynamicMin,
          max: 100
        }
      }
    }
  });

  return trendChartInstances[canvasId];
}

/**
 * Renders or updates a radial/doughnut attendance breakdown chart matching institutional reference
 * @param {string} canvasId - Canvas element ID
 * @param {{present:number, late:number, absent:number, excused:number}} counts
 */
export function renderRadialAttendanceChart(canvasId = 'facultyRadialChart', counts = { present: 1042, late: 37, absent: 28, excused: 16 }) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (radialChartInstances[canvasId]) {
    radialChartInstances[canvasId].destroy();
  }

  const rawTotal = (Number(counts?.present) || 0) + (Number(counts?.late) || 0) + (Number(counts?.absent) || 0) + (Number(counts?.excused) || 0);
  const effectiveCounts = rawTotal > 0 ? counts : { present: 1042, late: 37, absent: 28, excused: 16 };
  const dataValues = [
    Number(effectiveCounts.present) || 0,
    Number(effectiveCounts.late) || 0,
    Number(effectiveCounts.absent) || 0,
    Number(effectiveCounts.excused) || 0
  ];
  const total = dataValues.reduce((a, b) => a + b, 0);
  const attendanceRate = total > 0 ? Math.round(((effectiveCounts.present + effectiveCounts.late) / total) * 100) : 94;

  radialChartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Late / Tardy', 'Absent', 'Excused'],
      datasets: [{
        data: dataValues,
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6'],
        borderColor: isDark ? '#0C1D38' : '#FFFFFF',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
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
            label: function(context) {
              const val = context.parsed || 0;
              const pct = Math.round((val / total) * 100);
              return ` ${context.label}: ${val.toLocaleString()} (${pct}%)`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      beforeDraw(chart) {
        const { width, height, ctx } = chart;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.max(14, Math.round(Math.min(width, height) / 6));
        ctx.font = `700 ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = isDark ? '#FFFFFF' : '#0D47A1';
        ctx.fillText(`${attendanceRate}%`, width / 2, height / 2 - 4);

        const subFontSize = Math.max(9, Math.round(Math.min(width, height) / 14));
        ctx.font = `600 ${subFontSize}px Inter, sans-serif`;
        ctx.fillStyle = isDark ? '#90CAF9' : '#4A657E';
        ctx.fillText('RATE', width / 2, height / 2 + fontSize * 0.65);
        ctx.restore();
      }
    }]
  });

  return radialChartInstances[canvasId];
}

/**
 * Renders or updates a section-by-section comparative attendance bar chart
 * @param {string} canvasId - Canvas element ID
 * @param {Array<{name:string, rate:number}>} sectionData
 */
export function renderSectionComparisonChart(canvasId = 'sectionComparisonChart', sectionData = null) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';

  if (comparisonChartInstance) {
    comparisonChartInstance.destroy();
  }

  const defaultSections = [
    { name: '31001', rate: 94.3 },
    { name: '31002', rate: 89.1 },
    { name: '21001', rate: 92.5 }
  ];

  const items = sectionData && sectionData.length > 0 ? sectionData : defaultSections;
  const labels = items.map(s => s.name);
  const rates = items.map(s => s.rate);

  comparisonChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Section Attendance Rate',
        data: rates,
        backgroundColor: '#2196F3',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 38
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
          callbacks: {
            label: (ctx) => ` Attendance: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11, family: "'Inter', sans-serif" } },
          grid: { display: false }
        },
        y: {
          min: 60,
          max: 100,
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (v) => v + '%'
          },
          grid: { color: gridColor }
        }
      }
    }
  });

  return comparisonChartInstance;
}

const dailyTimestampsChartInstances = {};

/**
 * Renders or updates the daily check-in and check-out timestamps line chart.
 * Bases styling on admin/teacher trend line charts with theme awareness.
 * Plots Morning Check-In, Afternoon Dismissal (Time-Out), and 08:00 AM Gate Cutoff Benchmark.
 * @param {string} canvasId - Canvas element ID (e.g. 'studentAttendanceTrendChart')
 * @param {Array} records - Array of daily attendance objects with summary_date, time_in, time_out, status
 * @returns {Chart|null}
 */
export function renderDailyTimestampsLineChart(canvasId = 'studentAttendanceTrendChart', records = []) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (dailyTimestampsChartInstances[canvasId]) {
    dailyTimestampsChartInstances[canvasId].destroy();
  }

  // Theme-aware tokens matching Color Hunt system
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';
  const cutoffColor = isDark ? '#F59E0B' : '#D97706';
  const checkInColor = '#2196F3';
  const checkOutColor = isDark ? '#818CF8' : '#4F46E5';

  const gradIn = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
  if (isDark) {
    gradIn.addColorStop(0, 'rgba(33, 150, 243, 0.35)');
    gradIn.addColorStop(1, 'rgba(33, 150, 243, 0.02)');
  } else {
    gradIn.addColorStop(0, 'rgba(33, 150, 243, 0.22)');
    gradIn.addColorStop(1, 'rgba(227, 242, 253, 0.04)');
  }

  // Ensure chronological order (oldest to newest)
  const sorted = [...records].sort((a, b) => a.summary_date.localeCompare(b.summary_date));
  const todayIso = new Date().toISOString().split('T')[0];

  const labels = sorted.map(r => {
    const d = new Date(r.summary_date + 'T00:00:00');
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const md = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    return r.summary_date === todayIso ? `Today (${day})` : `${day} ${md}`;
  });

  const checkInData = sorted.map(r => {
    if (!r.time_in) return null;
    const d = new Date(r.time_in);
    return +(d.getHours() + d.getMinutes() / 60).toFixed(2);
  });

  const checkOutData = sorted.map(r => {
    if (!r.time_out) return null;
    const d = new Date(r.time_out);
    return +(d.getHours() + d.getMinutes() / 60).toFixed(2);
  });

  const cutoffData = sorted.map(() => 8.0); // 08:00 AM

  const pointBgIn = sorted.map(r => r.status === 'late' ? '#F59E0B' : '#2196F3');

  dailyTimestampsChartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Check-In (Arrival)',
          data: checkInData,
          borderColor: checkInColor,
          backgroundColor: gradIn,
          fill: true,
          cubicInterpolationMode: 'monotone',
          tension: 0.35,
          pointRadius: 4.5,
          pointHoverRadius: 7.5,
          pointHitRadius: 20,
          pointBackgroundColor: pointBgIn,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          borderWidth: 2.5
        },
        {
          label: 'Check-Out (Dismissal)',
          data: checkOutData,
          borderColor: checkOutColor,
          backgroundColor: 'transparent',
          fill: false,
          cubicInterpolationMode: 'monotone',
          tension: 0.35,
          pointRadius: 4.5,
          pointHoverRadius: 7.5,
          pointHitRadius: 20,
          pointBackgroundColor: checkOutColor,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          borderWidth: 2.5
        },
        {
          label: 'Gate Cutoff (08:00 AM)',
          data: cutoffData,
          borderColor: cutoffColor,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 0,
          borderWidth: 1.5,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif", weight: '500' },
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#0C1D38' : '#0D47A1',
          titleColor: '#FFFFFF',
          bodyColor: '#E3F2FD',
          borderColor: '#2196F3',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              if (!items || items.length === 0) return '';
              const r = sorted[items[0].dataIndex];
              if (!r) return items[0].label;
              const d = new Date(r.summary_date + 'T00:00:00');
              return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            },
            label: (c) => {
              if (c.dataset.label.includes('Cutoff')) {
                return ' Official Cutoff: 08:00 AM (Post-08:00 is marked Late)';
              }
              if (c.parsed.y == null) {
                return ` ${c.dataset.label}: None recorded / In Session`;
              }
              const h = Math.floor(c.parsed.y);
              const m = Math.round((c.parsed.y - h) * 60);
              const h12 = h % 12 || 12;
              const ampm = h >= 12 ? 'PM' : 'AM';
              const mStr = m < 10 ? '0' + m : m;
              return ` ${c.dataset.label}: ${h12}:${mStr} ${ampm}`;
            },
            afterBody: (items) => {
              if (!items || items.length === 0) return [];
              const r = sorted[items[0].dataIndex];
              if (!r) return [];
              const lines = [];
              const statusText = r.status === 'late' ? 'Tardy / Late' : (r.status || 'present').toUpperCase();
              lines.push(`Attendance Status: ${statusText}`);
              if (r.duration_minutes != null) {
                const hrs = Math.floor(r.duration_minutes / 60);
                const mins = r.duration_minutes % 60;
                lines.push(`Campus Duration: ${hrs}h ${mins}m`);
              } else if (r.time_in && !r.time_out) {
                lines.push(`Campus Status: Currently In Session`);
              }
              if (r.device_location) {
                lines.push(`Ingress Point: ${r.device_location} (${(r.scan_method || 'rfid').toUpperCase()})`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif" }
          },
          grid: { display: false }
        },
        y: {
          min: 6,
          max: 19,
          ticks: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif" },
            stepSize: 2,
            callback: (val) => {
              const h = Math.floor(val);
              const h12 = h % 12 || 12;
              const ampm = h >= 12 ? 'PM' : 'AM';
              return `${h12}:00 ${ampm}`;
            }
          },
          grid: { color: gridColor }
        }
      }
    }
  });

  return dailyTimestampsChartInstances[canvasId];
}
