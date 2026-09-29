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

  const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 180);
  if (isDark) {
    grad.addColorStop(0, 'rgba(33, 150, 243, 0.45)');
    grad.addColorStop(1, 'rgba(33, 150, 243, 0.02)');
  } else {
    grad.addColorStop(0, 'rgba(33, 150, 243, 0.28)');
    grad.addColorStop(1, 'rgba(227, 242, 253, 0.05)');
  }

  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';
  const targetColor = isDark ? '#90CAF9' : '#0D47A1';

  const defaultLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
  const defaultPresentData = [88, 90, 87, 93, 94];
  const defaultTargetData = [92, 92, 92, 92, 92];

  trendChartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: customData?.labels || defaultLabels,
      datasets: [
        {
          label: customData?.presentLabel || 'Present rate',
          data: customData?.presentData || defaultPresentData,
          borderColor: '#2196F3',
          backgroundColor: grad,
          fill: true,
          tension: 0.38,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2196F3',
          borderWidth: 2.5
        },
        {
          label: customData?.targetLabel || 'Target (92%)',
          data: customData?.targetData || defaultTargetData,
          borderColor: targetColor,
          borderDash: [5, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: textColor,
            font: { size: 11.5, family: "'Inter', sans-serif" },
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
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (v) => v + '%'
          },
          grid: { color: gridColor },
          min: 70,
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
    { name: 'BSIT 3-1', rate: 94.3 },
    { name: 'BSIT 3-2', rate: 89.1 },
    { name: 'BSIS 2-1', rate: 92.5 }
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
