/**
 * Controlador Principal da Aplicação (SPA Router e Utilitários Globais)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupConnectionMonitor(handleStatusChange);
  setupPersonalPreferences();
});

function setupPersonalPreferences() {
  const key = () => `gemino-preferences-${auth?.currentUser?.uid || 'local'}`;
  const apply = preferences => { document.documentElement.style.fontSize = `${preferences.fontSize || 16}px`; document.body.classList.toggle('theme-dark', preferences.theme === 'dark'); };
  const read = () => { try { return JSON.parse(localStorage.getItem(key())) || { fontSize: 16, theme: 'light' }; } catch { return { fontSize: 16, theme: 'light' }; } };
  const save = preferences => { localStorage.setItem(key(), JSON.stringify(preferences)); apply(preferences); };
  apply(read());
  document.getElementById('btn-font-decrease').onclick = () => { const preferences = read(); preferences.fontSize = Math.max(14, (preferences.fontSize || 16) - 1); save(preferences); };
  document.getElementById('btn-font-increase').onclick = () => { const preferences = read(); preferences.fontSize = Math.min(20, (preferences.fontSize || 16) + 1); save(preferences); };
  document.getElementById('btn-theme-toggle').onclick = () => { const preferences = read(); preferences.theme = preferences.theme === 'dark' ? 'light' : 'dark'; save(preferences); };
}

// Navegação entre Views da SPA
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view-content');

  navButtons.forEach(button => {
    button.addEventListener('click', () => navigateToView(button.getAttribute('data-target')));
  });
}

window.navigateToView = function(targetViewId) {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.getAttribute('data-target') === targetViewId));
  document.querySelectorAll('.view-content').forEach(view => view.classList.toggle('active', view.id === targetViewId));
};

function setupDashboardActions() {
  document.querySelectorAll('[data-dashboard-target]').forEach(card => card.addEventListener('click', () => window.navigateToView(card.dataset.dashboardTarget)));
  const period = document.getElementById('dash-period');
  const start = document.getElementById('dash-date-start');
  const end = document.getElementById('dash-date-end');
  const refresh = () => typeof window.updateDashboardFinancial === 'function' && window.updateDashboardFinancial();
  period.onchange = () => { const custom = period.value === 'custom'; start.disabled = !custom; end.disabled = !custom; refresh(); };
  start.onchange = refresh; end.onchange = refresh;
  period.dispatchEvent(new Event('change'));
}

document.addEventListener('DOMContentLoaded', setupDashboardActions);

// Atualização Visual de Status da Conexão
function handleStatusChange(statusState, statusText) {
  const statusBadge = document.getElementById('connection-status');
  const statusTextElem = document.getElementById('status-text');

  if (!statusBadge || !statusTextElem) return;

  statusTextElem.textContent = statusText;

  // Atualiza classes de estilo do badge
  statusBadge.className = 'status-badge';
  if (statusState === 'ONLINE') {
    statusBadge.classList.add('status-online');
  } else if (statusState === 'OFFLINE') {
    statusBadge.classList.add('status-offline');
  } else if (statusState === 'SYNCING') {
    statusBadge.classList.add('status-syncing');
  }
}

// Sistema de Notificações Pop-up (Toast)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remove o toast após 3.5 segundos
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
