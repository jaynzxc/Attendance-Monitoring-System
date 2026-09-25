/**
 * charts.js - Reusable Chart.js components with theme awareness
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

let trendChartInstance = null;

/**
 * Renders or updates the 5-week attendance trend line chart.
 * Automatically adapts gradient, grid, target line, and typography to current light/dark theme.
 * @param {string} canvasId - Canvas element ID (e.g. 'trendChart')
 * @param {Object} [customData] - Optional datasets and labels
 * @returns {Chart|null}
 */
export function renderTrendChart(canvasId = 'trendChart', customData = null) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
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

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: customData?.labels || defaultLabels,
      datasets: [
        {
          label: 'Present rate',
          data: customData?.presentData || defaultPresentData,
          borderColor: '#2196F3',
          backgroundColor: grad,
          fill: true,
          tension: 0.38,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2196F3',
          borderWidth: 2.5
        },
        {
          label: 'Target',
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
      maintainAspectRatio: true,
      plugins: {
        legend: {
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
          cornerRadius: 8
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

  return trendChartInstance;
}
