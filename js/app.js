/**
 * Controlador Principal da Aplicação (SPA Router e Utilitários Globais)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupConnectionMonitor(handleStatusChange);
  setupPersonalPreferences();
  setupMobileMoreMenu();
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
  if (targetViewId === 'view-more') {
    openMobileMoreMenu();
    return;
  }

  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.getAttribute('data-target') === targetViewId));
  document.querySelectorAll('.view-content').forEach(view => view.classList.toggle('active', view.id === targetViewId));

  // Custom mobile nav highlight logic for hidden views
  const moreBtn = document.getElementById('nav-item-more');
  if (moreBtn) {
    const hiddenViews = ['view-pdv', 'view-catalogos', 'view-configuracoes'];
    if (hiddenViews.includes(targetViewId)) {
      moreBtn.classList.add('active');
    } else {
      moreBtn.classList.remove('active');
    }
  }

  // Atualiza dados da view de Balanço Financeiro ao navegar para ela
  if (targetViewId === 'view-financeiro') {
    if (typeof window.updateFinanceiro === 'function') window.updateFinanceiro();
  }
};


function openMobileMoreMenu() {
  const modal = document.getElementById('mobile-more-menu');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('open');
  }
}

function closeMobileMoreMenu() {
  const modal = document.getElementById('mobile-more-menu');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.classList.add('hidden');
      }
    }, 300); // tempo correspondente à animação de transição do slide-up
  }
}

function setupMobileMoreMenu() {
  const closeBtn = document.getElementById('btn-close-more-menu');
  const overlay = document.getElementById('more-modal-overlay');

  if (closeBtn) closeBtn.addEventListener('click', closeMobileMoreMenu);
  if (overlay) overlay.addEventListener('click', closeMobileMoreMenu);

  // Fecha menu clicando fora ou no overlay
  document.querySelectorAll('.more-menu-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      window.navigateToView(target);
      closeMobileMoreMenu();
    });
  });

  // Vincula as preferências do menu mobile com as do desktop
  const mobTheme = document.getElementById('mobile-btn-theme');
  const mobFontDec = document.getElementById('mobile-btn-font-decrease');
  const mobFontInc = document.getElementById('mobile-btn-font-increase');
  const mobLogout = document.getElementById('mobile-btn-logout');

  if (mobTheme) {
    mobTheme.addEventListener('click', () => {
      document.getElementById('btn-theme-toggle')?.click();
    });
  }
  if (mobFontDec) {
    mobFontDec.addEventListener('click', () => {
      document.getElementById('btn-font-decrease')?.click();
    });
  }
  if (mobFontInc) {
    mobFontInc.addEventListener('click', () => {
      document.getElementById('btn-font-increase')?.click();
    });
  }
  if (mobLogout) {
    mobLogout.addEventListener('click', () => {
      closeMobileMoreMenu();
      document.getElementById('btn-logout')?.click();
    });
  }
}

function setupDashboardActions() {
  document.querySelectorAll('[data-dashboard-target]').forEach(card => card.addEventListener('click', () => window.navigateToView(card.dataset.dashboardTarget)));
}

function setupFinanceiroActions() {
  const period = document.getElementById('fin-period');
  const start = document.getElementById('fin-date-start');
  const end = document.getElementById('fin-date-end');
  if (!period) return;
  const refresh = () => typeof window.updateFinanceiro === 'function' && window.updateFinanceiro();
  period.onchange = () => {
    const custom = period.value === 'custom';
    start.disabled = !custom;
    end.disabled = !custom;
    refresh();
  };
  start.onchange = refresh;
  end.onchange = refresh;
  period.dispatchEvent(new Event('change'));
}

document.addEventListener('DOMContentLoaded', () => {
  setupDashboardActions();
  setupFinanceiroActions();
});


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

window.updateDashboardCategories = function() {
  const container = document.getElementById('dashboard-categories-list');
  if (!container) return;

  const products = window.productsCache || [];
  const categories = [...new Set(products.map(p => p.categoria || p.category).filter(Boolean))];

  if (categories.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhuma categoria encontrada.</p>';
    return;
  }

  const categoryIcons = {
    'Limpeza Geral': '🧼',
    'Cozinha': '🍽️',
    'Banheiro': '🚽',
    'Lavanderia': '🧺',
    'Automotivo': '🚗',
    'Desinfetantes': '✨',
    'Detergentes': '💧',
    'Sabões': '🧼',
    'Líquidos': '🧪',
    'Default': '📦'
  };

  container.innerHTML = categories.map(cat => {
    const icon = categoryIcons[cat] || categoryIcons['Default'];
    return `
      <button class="category-launcher-card" type="button" onclick="window.selectCategoryForBudget('${cat}')">
        <span class="category-launcher-icon">${icon}</span>
        <span class="category-launcher-label">${cat}</span>
      </button>
    `;
  }).join('');
};

window.selectCategoryForBudget = function(categoryName) {
  // Navigate to budget view
  window.navigateToView('view-orcamento');

  // Set filter in Search Input
  const searchInput = document.getElementById('orc-search-produto');
  if (searchInput) {
    searchInput.value = categoryName;
    // Trigger input event to render search results
    searchInput.dispatchEvent(new Event('input'));
    // Focus search input
    searchInput.focus();
  }
};

