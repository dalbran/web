/**
 * Módulo de Orçamentos e Motor Comercial
 */

let cart = [];
let quotesHistory = [];
let quotesUnsubscribe = null;
let currentQuoteNumber = null;
let selectedClientId = '';
let savedQuoteId = null;
let documentMode = 'orcamento';
let sidebarSearch = '';
let sidebarPage = 1;
let selectedVendedorId = '';

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getQuoteNumber(prefix = 'ORC') {
  return currentQuoteNumber || `${prefix}--`;
}

async function reserveDocumentNumber(prefix) {
  const counterRef = db.collection('settings').doc(`counter-${prefix.toLowerCase()}`);
  const next = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counterRef);
    const value = (snapshot.exists ? Number(snapshot.data().lastNumber) || 0 : 0) + 1;
    transaction.set(counterRef, { lastNumber: value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return value;
  });
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

window.populateOrcamentoClientsSelect = function() {
  const select = document.getElementById('orc-select-cliente');
  if (!select) return;
  const value = select.value || selectedClientId;
  select.innerHTML = '<option value="">Preencher cliente manualmente</option>' + (window.clientsCache || []).map(client => `<option value="${client.id}">${client.nome || client.nomeFantasia || 'Cliente sem nome'}</option>`).join('');
  if (value && (window.clientsCache || []).some(client => client.id === value)) select.value = value;
};

window.populateVendedorSelect = function() {
  const select = document.getElementById('orc-select-vendedor');
  if (!select) return;
  const previousValue = select.value || selectedVendedorId;
  const currentUser = typeof auth !== 'undefined' ? auth.currentUser : null;
  const operators = window.operatorsCache || [];
  select.innerHTML = '<option value="">Selecione o vendedor</option>' + operators.map(operator => `<option value="${operator.id}">${escapeProductHtml(operator.nome || operator.email)}${operator.papel === 'master' ? ' (master)' : ''}</option>`).join('');
  const currentOperator = operators.find(operator => operator.email === currentUser?.email);
  const value = previousValue || currentOperator?.id || '';
  if (value && operators.some(operator => operator.id === value)) { select.value = value; selectedVendedorId = value; }
};

function getSelectedVendedor() { return (window.operatorsCache || []).find(operator => operator.id === selectedVendedorId) || null; }

function getSelectedClient() {
  return (window.clientsCache || []).find(client => client.id === selectedClientId) || null;
}

function getVariationPrice(variation, priceTable) {
  const price = priceTable === 'atacado' ? variation.precoAtacado : priceTable === 'notaFiscal' ? (variation.precoNotaFiscal !== undefined ? variation.precoNotaFiscal : variation.precoVarejo) : variation.precoVarejo;
  return Number.isFinite(Number(price)) ? Number(price) : 0;
}

function markQuoteDirty() { savedQuoteId = null; }

// Função pública global para preencher e atualizar dinamicamente o select de produtos
window.populateOrcamentoProductsSelect = function(searchTerm = '') {
  const selectProd = document.getElementById('orc-select-produto');
  if (!selectProd) return;

  const currentValue = selectProd.value;
  const normalizedTerm = normalizeSearchText(searchTerm);
  const products = (window.productsCache || []).filter(p => {
    const productName = p.nome || p.name || '';
    return p.ativo !== false && (!normalizedTerm || normalizeSearchText(productName).includes(normalizedTerm));
  });

  let optionsHTML = '<option value="">-- Selecione um produto --</option>';
  optionsHTML += products.map(p => `<option value="${p.id}">${p.nome || p.name}</option>`).join('');

  selectProd.innerHTML = optionsHTML;

  // Preserva a seleção anterior se o item ainda existir no cache
  if (currentValue && products.some(p => p.id === currentValue)) {
    selectProd.value = currentValue;
  }
};

function renderProductSearchResults(searchTerm = '') {
  const container = document.getElementById('orc-search-results');
  if (!container) return;
  const term = normalizeSearchText(searchTerm);
  if (!term) {
    container.innerHTML = '';
    return;
  }
  const products = (window.productsCache || []).filter(product => {
    const name = product.nome || product.name || '';
    const cat = product.categoria || '';
    return product.ativo !== false && (
      normalizeSearchText(name).includes(term) ||
      normalizeSearchText(cat).includes(term)
    );
  }).slice(0, 8);
  container.innerHTML = products.length
    ? products.map(product => `<button type="button" class="product-search-result" data-product-id="${product.id}"><span>${escapeProductHtml(product.nome || product.name || 'Produto sem nome')}</span><small>${Array.isArray(product.variacoes) ? `${product.variacoes.length} variação(ões)` : 'Sem variações'}</small></button>`).join('')
    : '<p class="product-search-empty">Nenhum produto encontrado.</p>';
}

function escapeProductHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function selectProductFromSearch(productId) {
  const select = document.getElementById('orc-select-produto');
  const product = (window.productsCache || []).find(item => item.id === productId);
  if (!select || !product) return;
  // A lista de resultados não filtra nem reconstrói o seletor existente; apenas permite escolher o produto encontrado.
  select.value = productId;
  select.dispatchEvent(new Event('change'));
  document.getElementById('orc-search-produto').value = product.nome || product.name || '';
  document.getElementById('orc-search-results').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  renderOrcamentoView();

  if (typeof auth !== 'undefined' && auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        initOrcamentoModule();
      }
    });
  }

  // Escuta cliques na navegação para a aba "Orçamento" e recarrega os produtos
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-target]');
    if (navBtn && navBtn.getAttribute('data-target') === 'view-orcamento') {
      window.openQuoteView(documentMode !== 'orcamento');
    }
    if (navBtn && navBtn.getAttribute('data-target') === 'view-pdv') {
      window.openPdvView(documentMode !== 'pdv');
    }
  });
});

function initOrcamentoModule() {
  if (typeof quotesUnsubscribe === 'function') {
    quotesUnsubscribe();
  }

  renderOrcamentoView();

  if (typeof db === 'undefined' || !db) {
    console.error('Firestore is unavailable for quotes.');
    showToast('Não foi possível iniciar os orçamentos. Atualize a página.', 'error');
    return;
  }
  // Escuta os orçamentos no Firestore para histórico e métricas
  quotesUnsubscribe = db.collection('quotes').orderBy('createdAt', 'desc').limit(50)
    .onSnapshot((snapshot) => {
      quotesHistory = [];
      snapshot.forEach(doc => {
        quotesHistory.push({ id: doc.id, ...doc.data() });
      });
      updateDashboardQuoteMetrics();
    }, (error) => {
      console.error('Failed to load quote history:', error);
      updateDashboardQuoteMetrics();
    });
}

// Renderiza a interface do módulo de Orçamento
function renderOrcamentoView(viewId = 'view-orcamento', mode = 'orcamento') {
  const container = document.getElementById(viewId);
  if (!container) return;
  documentMode = mode;
  const isPdv = mode === 'pdv';
  const otherView = document.getElementById(viewId === 'view-pdv' ? 'view-orcamento' : 'view-pdv');
  if (otherView) otherView.innerHTML = '';

  container.innerHTML = `
    <div class="view-header" style="margin-bottom:1rem;">
      <h2>${isPdv ? 'Nova Venda (PDV)' : 'Novo Orçamento'}</h2>
    </div>

    <!-- 1. DADOS DO CLIENTE E VENDEDOR (Etapa 1) -->
    <section class="step-section step-section-client" data-step="1">
      <div class="step-card">
        <h3><i class="fa-solid fa-user"></i> 1. Dados do Cliente e Vendedor</h3>
        <p style="color:#64748b; font-size:0.88rem; margin-bottom:1.25rem;">Informe o vendedor responsável e os dados do cliente.</p>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">
          <div class="form-group">
            <label>Vendedor responsável</label>
            <select id="orc-select-vendedor"><option value="">Selecione o vendedor</option></select>
          </div>

          <div class="form-group">
            <label>Cliente cadastrado (opcional)</label>
            <select id="orc-select-cliente"><option value="">Preencher cliente manualmente</option></select>
          </div>

          <div class="form-group">
            <label>Nome do Cliente / Empresa</label>
            <input type="text" id="orc-cliente-nome" placeholder="Ex: Mercado Silva">
          </div>

          <div class="form-group">
            <label>Telefone / WhatsApp</label>
            <input type="text" id="orc-cliente-telefone" placeholder="(00) 00000-0000">
          </div>
        </div>

        <div class="step-footer-actions">
          <div></div>
          <button type="button" class="btn btn-primary step-btn-next">
            Adicionar Itens →
          </button>
        </div>
      </div>
    </section>

    <!-- 2. ADICIONAR ITENS (Etapa 2) -->
    <section class="step-section step-section-items" data-step="2">
      <div class="step-card">
        <h3><i class="fa-solid fa-cart-plus"></i> 2. Adicionar Itens ${isPdv ? 'à Venda' : 'ao Orçamento'}</h3>
        
        <div class="form-group" style="margin-top:1rem; margin-bottom:.5rem;">
          <label>Pesquisar produto no estoque</label>
          <input type="search" id="orc-search-produto" placeholder="Digite parte do nome do produto..." autocomplete="off">
        </div>
        <div id="orc-search-results" class="product-search-results" aria-live="polite"></div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; margin-top:1rem;">
          <div class="form-group">
            <label>Selecione o Produto</label>
            <select id="orc-select-produto" style="width:100%; padding:0.6rem;">
              <option value="">-- Selecione um produto --</option>
            </select>
          </div>

          <div class="form-group">
            <label>Variação / Volume</label>
            <select id="orc-select-variacao" style="width:100%; padding:0.6rem;" disabled>
              <option value="">-- Selecione o produto primeiro --</option>
            </select>
          </div>

          <div class="form-group">
            <label>Fragrância / Opção</label>
            <select id="orc-select-fragrancia" style="width:100%; padding:0.6rem;" disabled>
              <option value="">-- Nenhuma / Padrão --</option>
            </select>
          </div>

          <div class="form-group">
            <label>Tabela de Preço</label>
            <select id="orc-select-tabela" style="width:100%; padding:0.6rem;">
              <option value="atacado">Atacado</option>
              <option value="varejo">Varejo</option>
              <option value="notaFiscal">Nota Fiscal</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:0.75rem; margin-top:0.75rem; align-items:end;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Quantidade</label>
            <div class="quantity-control">
              <button type="button" id="btn-qtd-minus" aria-label="Diminuir quantidade">−</button>
              <input type="number" id="orc-input-qtd" min="1" value="1" inputmode="numeric">
              <button type="button" id="btn-qtd-plus" aria-label="Aumentar quantidade">+</button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label>Preço Unitário (R$)</label>
            <input type="number" step="0.01" id="orc-input-preco" placeholder="0.00" readonly style="width:100%; padding:0.6rem; background:#f8fafc;">
          </div>

          <button type="button" id="btn-add-item" class="btn btn-primary" style="height:46px; white-space:nowrap; padding:0 1.25rem;">+ Adicionar Item</button>
        </div>
      </div>

      <!-- Tabela do Carrinho -->
      <div class="step-card">
        <h3><i class="fa-solid fa-list-check"></i> Itens Selecionados (${isPdv ? 'Venda' : 'Orçamento'})</h3>
        <div style="overflow-x:auto; margin-top:0.75rem;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left; font-size:0.85rem;">
                <th style="padding:0.5rem;">Item</th>
                <th style="padding:0.5rem;">Qtd</th>
                <th style="padding:0.5rem;">Unit.</th>
                <th style="padding:0.5rem;">Total</th>
                <th style="padding:0.5rem; text-align:right;">Ação</th>
              </tr>
            </thead>
            <tbody id="cart-table-body">
              ${generateCartRows()}
            </tbody>
          </table>
        </div>

        <div class="step-footer-actions">
          <button type="button" class="btn btn-outline step-btn-prev">← Voltar para Cliente</button>
          <button type="button" class="btn btn-primary step-btn-next">Ir para Pagamento →</button>
        </div>
      </div>
    </section>

    <!-- 3. FORMA DE PAGAMENTO E FINALIZAÇÃO (Etapa 3 - FORMA DE PAGAMENTO POR ÚLTIMO) -->
    <section class="step-section step-section-finish" data-step="3">
      <div class="step-card">
        <h3><i class="fa-solid fa-credit-card"></i> 3. Forma de Pagamento e Finalização</h3>
        
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-top:1rem;">
          <div class="form-group">
            <label>Meio de Pagamento</label>
            <select id="orc-forma-pagamento" style="width:100%; padding:0.6rem;">
              <option value="pix">PIX (Sem Taxa)</option>
              <option value="dinheiro">Dinheiro (Sem Taxa)</option>
              <option value="debito">Cartão de Débito</option>
              <option value="credito">Cartão de Crédito</option>
              <option value="boleto">Boleto</option>
              <option value="receber">A receber</option>
            </select>
          </div>

          <div class="form-group">
            <label>Desconto Adicional (R$)</label>
            <input type="number" step="0.01" id="orc-desconto" value="0.00" style="width:100%; padding:0.6rem;">
          </div>

          <div class="form-group">
            <label>Prazo de entrega / previsão</label>
            <input type="text" id="orc-prazo-entrega" placeholder="Ex.: 2 dias úteis">
          </div>
        </div>

        <div id="orc-pix-panel" class="pix-panel hidden" style="margin-top:0.75rem;">
          <label>Chave PIX para esta operação</label>
          <select id="orc-pix-key"><option value="celular">Celular</option><option value="cnpj">CNPJ</option></select>
          <button type="button" id="btn-generate-pix" class="btn btn-outline btn-block">Gerar PIX copia e cola / QR Code</button>
          <div id="orc-pix-result" class="pix-result"></div>
        </div>

        <div id="orc-boleto-panel" class="boleto-panel hidden" style="margin-top:0.75rem;">
          <label>URL do boleto desta venda</label>
          <input type="url" id="orc-boleto-url" placeholder="https://drive.google.com/... ou outra URL externa">
          <small>Este link fica vinculado somente a esta venda.</small>
        </div>

        <div class="form-group" style="margin-top:1rem;">
          <label>Observação extra</label>
          <textarea id="orc-observacao" rows="2" placeholder="Ex.: sujeito à disponibilidade, conferir pedido na entrega"></textarea>
        </div>

        <!-- RESUMO FINANCEIRO -->
        <div style="background:#f8fafc; padding:1.25rem; border-radius:8px; border:1px solid #e2e8f0; margin:1.25rem 0;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
            <span>Subtotal:</span>
            <strong id="orc-subtotal-val">R$ 0,00</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; color:#ef4444;">
            <span>Desconto:</span>
            <span id="orc-desconto-val">- R$ 0,00</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; color:#3b82f6;">
            <span>Taxa Cartão:</span>
            <span id="orc-taxa-val">+ R$ 0,00</span>
          </div>
          <hr style="margin:0.5rem 0;">
          <div style="display:flex; justify-content:space-between; font-size:1.3rem;">
            <strong>Total Geral:</strong>
            <strong id="orc-total-val" style="color:#0284c7;">R$ 0,00</strong>
          </div>
        </div>

        <!-- BOTÕES DE AÇÃO PRINCIPAIS -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem;">
          <button id="btn-save-orcamento" class="btn btn-primary">${isPdv ? 'Finalizar Venda' : 'Salvar Orçamento'}</button>
          <button id="btn-whatsapp-orcamento" class="btn btn-outline" style="border-color:#10b981; color:#10b981;">${isPdv ? 'Compartilhar no WhatsApp' : 'Enviar via WhatsApp'}</button>
          <button id="btn-print-cupom" class="btn btn-outline">${isPdv ? 'Imprimir Cupom' : 'Imprimir Orçamento'}</button>
        </div>

        <div class="step-footer-actions">
          <button type="button" class="btn btn-outline step-btn-prev">← Voltar para Itens</button>
          <button type="button" class="btn btn-secondary step-btn-next">Ver ${isPdv ? 'Vendas Salvas' : 'Orçamentos Salvos'} →</button>
        </div>
      </div>
    </section>

    <!-- 4. SEÇÃO ABAIXO: DOCUMENTOS SALVOS (Etapa 4) -->
    <section class="step-section step-section-saved" data-step="4">
      <div class="step-card saved-quotes-sidebar" style="margin-bottom:0;">
        <div class="saved-quotes-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h3><i class="fa-solid fa-clock-rotate-left"></i> ${isPdv ? 'Vendas Salvas no Sistema' : 'Orçamentos Salvos no Sistema'}</h3>
          <span id="saved-quotes-count" class="badge" style="background:var(--primary); color:white; padding:4px 10px; border-radius:12px; font-weight:700;">${(window.quotesCache || []).length}</span>
        </div>
        <input id="saved-documents-search" class="saved-documents-search" type="search" placeholder="Buscar por número, cliente ou data..." style="margin-bottom:1rem;">
        <div id="saved-quotes-list" class="saved-quotes-list"></div>
        <div id="saved-documents-pagination" class="saved-documents-pagination" style="margin-top:1rem;"></div>

        <div class="step-footer-actions">
          <button type="button" class="btn btn-outline step-btn-prev">← Voltar ao Pagamento</button>
          <button type="button" class="btn btn-primary" onclick="${isPdv ? 'window.openPdvView(true)' : 'window.openQuoteView(true)'}">+ Novo ${isPdv ? 'Pedido' : 'Orçamento'}</button>
        </div>
      </div>
    </section>

    <div id="print-area" class="print-document" style="display:none;"></div>
    <div id="modal-print-type" class="modal hidden print-modal">
      <div class="print-modal-card">
        <h3>Formato de impressão</h3>
        <p>Escolha o formato adequado para sua impressora.</p>
        <button type="button" class="btn btn-primary btn-block" data-print-type="a4">A4 / Salvar como PDF</button>
        <button type="button" class="btn btn-outline btn-block" data-print-type="80mm">Cupom térmico 80 mm</button>
        <button type="button" class="btn btn-outline btn-block" data-print-type="58mm">Cupom térmico 58 mm</button>
        <button type="button" id="btn-close-print-modal" class="btn btn-outline btn-block">Cancelar</button>
      </div>
    </div>
    <div id="modal-saved-quote" class="modal hidden print-modal"><div class="print-modal-card"><button type="button" class="modal-close" id="btn-close-saved-quote" aria-label="Fechar">×</button><div id="saved-quote-actions"></div></div></div>
  `;

  bindOrcamentoEvents();
  setupDocumentFlow(container, isPdv);

  // Preenche a lista com os dados em cache no momento da renderização
  window.populateOrcamentoProductsSelect();
  window.populateOrcamentoClientsSelect();
  window.populateVendedorSelect();
  if (typeof renderSavedQuotesSidebar === 'function') renderSavedQuotesSidebar();
}

function setupDocumentFlow(container, isPdv) {
  const oldFlow = container.querySelector('.document-flow-wizard');
  if (oldFlow) oldFlow.remove();

  const flow = document.createElement('div');
  flow.className = 'document-flow-wizard';
  flow.innerHTML = `
    <div class="flow-progress-bar">
      <button type="button" class="flow-step-btn active" data-step="0"><span class="step-num">1</span> <span class="step-label">Cliente</span></button>
      <i class="flow-line"></i>
      <button type="button" class="flow-step-btn" data-step="1"><span class="step-num">2</span> <span class="step-label">Itens</span></button>
      <i class="flow-line"></i>
      <button type="button" class="flow-step-btn" data-step="2"><span class="step-num">3</span> <span class="step-label">Pagamento</span></button>
      <i class="flow-line"></i>
      <button type="button" class="flow-step-btn" data-step="3"><span class="step-num">4</span> <span class="step-label">${isPdv ? 'Vendas' : 'Orçamentos'}</span></button>
    </div>
    <div class="flow-header-controls">
      <strong class="flow-current-title">Dados do cliente</strong>
      <div class="flow-action-buttons">
        <button type="button" class="btn btn-outline" id="flow-prev-btn" disabled>← Voltar</button>
        <button type="button" class="btn btn-primary" id="flow-next-btn">Próximo →</button>
      </div>
    </div>
  `;

  container.querySelector('.view-header').after(flow);

  const sections = [
    container.querySelector('.step-section-client'),
    container.querySelector('.step-section-items'),
    container.querySelector('.step-section-finish'),
    container.querySelector('.step-section-saved')
  ];

  const titles = [
    'Dados do cliente e vendedor',
    isPdv ? 'Adicionar itens à venda' : 'Adicionar itens ao orçamento',
    'Forma de pagamento e finalização',
    isPdv ? 'Vendas salvas no sistema' : 'Orçamentos salvos no sistema'
  ];

  let currentStep = 0;

  const renderStep = (stepIndex) => {
    currentStep = Math.max(0, Math.min(stepIndex, sections.length - 1));
    container.dataset.documentStep = String(currentStep + 1);

    flow.querySelector('.flow-current-title').textContent = titles[currentStep];
    flow.querySelectorAll('.flow-step-btn').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === currentStep);
      btn.classList.toggle('completed', idx < currentStep);
    });

    const prevBtn = flow.querySelector('#flow-prev-btn');
    const nextBtn = flow.querySelector('#flow-next-btn');

    prevBtn.disabled = (currentStep === 0);
    if (currentStep === sections.length - 1) {
      nextBtn.textContent = '+ Novo ' + (isPdv ? 'pedido' : 'orçamento');
    } else if (currentStep === 2) {
      nextBtn.textContent = isPdv ? 'Finalizar Venda →' : 'Salvar Orçamento →';
    } else {
      nextBtn.textContent = 'Próximo →';
    }

    sections.forEach((sec, idx) => {
      if (sec) sec.style.display = idx === currentStep ? 'block' : 'none';
    });

    window.scrollTo({ top: container.offsetTop - 60, behavior: 'smooth' });
  };

  // Botões de progresso do topo
  flow.querySelectorAll('.flow-step-btn').forEach((btn, idx) => {
    btn.onclick = () => renderStep(idx);
  });

  // Botões do cabeçalho do wizard
  flow.querySelector('#flow-prev-btn').onclick = () => renderStep(currentStep - 1);
  flow.querySelector('#flow-next-btn').onclick = () => {
    if (currentStep < sections.length - 1) {
      renderStep(currentStep + 1);
    } else {
      if (isPdv) window.openPdvView(true); else window.openQuoteView(true);
    }
  };

  // Botões de rodapé das seções
  container.querySelectorAll('.step-btn-prev').forEach(btn => {
    btn.onclick = () => renderStep(currentStep - 1);
  });
  container.querySelectorAll('.step-btn-next').forEach(btn => {
    btn.onclick = () => renderStep(currentStep + 1);
  });

  // Função pública global para forçar troca de etapa (ex: ao salvar)
  window.goToDocumentStep = (stepIdx) => renderStep(stepIdx);

  renderStep(0);
}

window.openQuoteView = function(reset = true) {
  if (reset) { cart = []; savedQuoteId = null; currentQuoteNumber = null; selectedClientId = ''; }
  renderOrcamentoView('view-orcamento', 'orcamento');
};
window.openPdvView = function(reset = true) {
  if (reset) { cart = []; savedQuoteId = null; currentQuoteNumber = null; selectedClientId = ''; }
  renderOrcamentoView('view-pdv', 'pdv');
};

function activateDocumentView(mode) {
  const target = mode === 'venda' ? 'view-pdv' : 'view-orcamento';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.target === target));
  document.querySelectorAll('.view-content').forEach(view => view.classList.toggle('active', view.id === target));
  if (mode === 'venda') window.openPdvView(false); else window.openQuoteView(false);
}

function loadSavedDocument(saved) {
  cart = Array.isArray(saved.itens) ? saved.itens.map(item => ({ ...item })) : [];
  savedQuoteId = saved.id;
  currentQuoteNumber = saved.numero || null;
  selectedClientId = saved.cliente?.id || '';
  selectedVendedorId = saved.vendedor?.id || '';
  const selectClient = document.getElementById('orc-select-cliente');
  const selectVendedor = document.getElementById('orc-select-vendedor');
  if (selectClient && selectedClientId) selectClient.value = selectedClientId;
  if (selectVendedor && selectedVendedorId) selectVendedor.value = selectedVendedorId;
  document.getElementById('orc-cliente-nome').value = saved.cliente?.nome || '';
  document.getElementById('orc-cliente-telefone').value = saved.cliente?.telefone || '';
  document.getElementById('orc-forma-pagamento').value = saved.financeiro?.formaPag || 'pix';
  document.getElementById('orc-desconto').value = saved.financeiro?.desconto || 0;
  document.getElementById('orc-prazo-entrega').value = saved.entrega?.prazo || '';
  document.getElementById('orc-observacao').value = saved.entrega?.observacao || '';
  document.getElementById('orc-boleto-url').value = saved.boletoUrl || '';
  document.getElementById('orc-boleto-panel').classList.toggle('hidden', saved.financeiro?.formaPag !== 'boleto');
  renderCartTable();
  updateTotals();
}

window.openSavedQuoteActions = function(id) {
  const saved = (window.quotesCache || []).find(item => item.id === id);
  if (!saved) return;
  activateDocumentView(saved.tipo === 'venda' ? 'venda' : 'orcamento');
  loadSavedDocument(saved);
  const modal = document.getElementById('modal-saved-quote');
  const content = document.getElementById('saved-quote-actions');
  if (!modal || !content) return;
  const label = saved.tipo === 'venda' ? 'Venda' : 'Orçamento';
  content.innerHTML = `<h3>${label} ${escapeProductHtml(saved.numero || saved.id)}</h3><p>${escapeProductHtml(saved.cliente?.nome || 'Cliente não informado')} · ${formatCurrency(saved.financeiro?.totalGeral)}</p><p class="saved-vendedor">vendedor: <strong>${escapeProductHtml(saved.vendedor?.nome || saved.criadoPor?.email || 'Não informado')}</strong></p><div class="saved-document-items">${(saved.itens || []).map(item => `<div><span>${item.quantidade}x ${escapeProductHtml(item.nome || 'Item')} ${escapeProductHtml(item.volume || '')}</span><strong>${formatCurrency(item.subtotal)}</strong></div>`).join('') || '<p class="empty-state">Sem itens registrados.</p>'}</div><div class="saved-quote-action-buttons"><button type="button" id="btn-edit-saved" class="btn btn-primary btn-block">Editar</button>${saved.tipo !== 'venda' ? '<button type="button" id="btn-convert-sale" class="btn btn-outline btn-block">Concretizar venda</button>' : ''}<button type="button" id="btn-print-saved" class="btn btn-outline btn-block">Imprimir cupom</button><button type="button" id="btn-whatsapp-saved" class="btn btn-outline btn-block" style="border-color:#10b981;color:#10b981;">Compartilhar no WhatsApp</button>${saved.tipo === 'venda' ? '<button type="button" id="btn-pix-saved" class="btn btn-outline btn-block">PIX</button>' : ''}${saved.financeiro?.formaPag === 'boleto' ? '<button type="button" id="btn-boleto-saved" class="btn btn-outline btn-block">Abrir boleto bancário</button>' : ''}<button type="button" id="btn-delete-saved" class="btn btn-outline btn-block" style="border-color:#ef4444;color:#ef4444;">Excluir ${label.toLowerCase()}</button></div>`;
  modal.classList.remove('hidden'); modal.style.display = 'flex';
  document.getElementById('btn-edit-saved').onclick = () => { modal.classList.add('hidden'); modal.style.display = 'none'; showToast(`${label} carregado para edição.`, 'info'); };
  document.getElementById('btn-print-saved').onclick = () => printQuote('80mm');
  document.getElementById('btn-whatsapp-saved').onclick = () => typeof sendOrcamentoWhatsApp === 'function' && sendOrcamentoWhatsApp();
  if (document.getElementById('btn-convert-sale')) document.getElementById('btn-convert-sale').onclick = () => convertQuoteToSale(saved);
  if (document.getElementById('btn-pix-saved')) document.getElementById('btn-pix-saved').onclick = () => showPixForSavedSale(saved);
  if (document.getElementById('btn-boleto-saved')) document.getElementById('btn-boleto-saved').onclick = () => openBoletoUrl(saved.boletoUrl);
  document.getElementById('btn-delete-saved').onclick = () => deleteSavedDocument(saved);
};

async function convertQuoteToSale(saved) {
  if (!window.confirm(`Concretizar ${saved.numero} como venda?`)) return;
  try {
    const number = await reserveDocumentNumber('VEN');
    await db.collection('quotes').doc(saved.id).set({ tipo: 'venda', numero: number, convertidoEmVendaEm: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    currentQuoteNumber = number; documentMode = 'pdv';
    document.getElementById('modal-saved-quote').classList.add('hidden');
    showToast('Orçamento concretizado como venda.', 'success');
  } catch (error) { console.error(error); showToast('Não foi possível concretizar a venda.', 'error'); }
}

async function deleteSavedDocument(saved) {
  if (!window.confirm(`Excluir ${saved.tipo === 'venda' ? 'a venda' : 'o orçamento'} ${saved.numero}? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.collection('quotes').doc(saved.id).delete();
    document.getElementById('modal-saved-quote').classList.add('hidden');
    showToast('Registro excluído com sucesso.', 'success');
  } catch (error) { console.error(error); showToast('Não foi possível excluir o registro.', 'error'); }
}

function pixCrc16(payload) { let crc = 0xFFFF; for (let i = 0; i < payload.length; i++) { crc ^= payload.charCodeAt(i) << 8; for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1; } return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); }
function pixField(id, value) { const text = String(value || ''); return `${id}${String(text.length).padStart(2, '0')}${text}`; }
function buildPixPayload(amount, keyType = 'celular', overrideKey = '') {
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  // Sanitiza a chave: remove espaços, pontuação e formatação
  let rawKey = String(overrideKey || (keyType === 'cnpj' ? settings.pixKeyCnpj : settings.pixKey) || '').trim();
  // Para celular: remove tudo exceto dígitos e +
  if (keyType === 'celular' && !overrideKey) rawKey = rawKey.replace(/\D/g, '');
  // Para CNPJ: remove tudo exceto dígitos
  if (keyType === 'cnpj' && !overrideKey) rawKey = rawKey.replace(/\D/g, '');
  const key = rawKey;
  if (!key) return null;

  const merchant = (settings.nomeFantasia || 'DALBRAN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, 25).trim();
  const city = (settings.pixCidade || 'RIO DE JANEIRO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, 15).trim();
  const amountStr = Number(amount || 0).toFixed(2);

  // Monta o Merchant Account Information (ID 26)
  const gui = pixField('00', 'br.gov.bcb.pix');
  const pixKey = pixField('01', key);
  const merchantAccountInfo = pixField('26', gui + pixKey);

  // Campo 62 - Additional Data Field (subcampo 05 = referência)
  const additionalData = pixField('62', pixField('05', '***'));

  const base =
    pixField('00', '01') +          // Payload Format Indicator
    merchantAccountInfo +             // Merchant Account Information
    pixField('52', '0000') +          // Merchant Category Code
    pixField('53', '986') +           // Transaction Currency (BRL)
    pixField('54', amountStr) +       // Transaction Amount
    pixField('58', 'BR') +            // Country Code
    pixField('59', merchant) +        // Merchant Name
    pixField('60', city) +            // Merchant City
    additionalData +                  // Additional Data
    '6304';                           // CRC16 placeholder

  return base + pixCrc16(base);
}
function showPixForCurrentDocument() {
  const result = document.getElementById('orc-pix-result');
  const payload = buildPixPayload(calculateTotals().totalGeral, document.getElementById('orc-pix-key').value);
  if (!payload) { showToast('Cadastre a chave PIX escolhida nas Configurações.', 'error'); return; }
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payload)}`;
  result.innerHTML = `<img src="${qrUrl}" alt="QR Code PIX"><button type="button" class="btn btn-outline btn-block" id="btn-copy-current-pix">Copiar PIX</button>`;
  document.getElementById('btn-copy-current-pix').onclick = async () => { try { await navigator.clipboard.writeText(payload); showToast('PIX copia e cola copiado.', 'success'); } catch { showToast('Não foi possível copiar o PIX.', 'error'); } };
}
function showPixForSavedSale(sale) {
  const content = document.getElementById('saved-quote-actions');
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  content.innerHTML = `<button type="button" id="btn-back-saved-actions" class="btn btn-outline btn-sm">← Voltar</button><h3>PIX ${escapeProductHtml(sale.numero || '')}</h3><p>${formatCurrency(sale.financeiro?.totalGeral)}</p><div class="pix-panel"><label>Chave PIX</label><select id="saved-pix-key-type"><option value="celular">Celular cadastrado</option><option value="cnpj">CNPJ cadastrado</option><option value="manual">Outra chave</option></select><input id="saved-pix-key-manual" class="hidden" placeholder="Informe a chave PIX"><button id="btn-generate-saved-pix" type="button" class="btn btn-primary btn-block">Gerar QR Code</button><div id="saved-pix-result" class="pix-result"></div></div>`;
  const type = document.getElementById('saved-pix-key-type'); const manual = document.getElementById('saved-pix-key-manual');
  type.onchange = () => manual.classList.toggle('hidden', type.value !== 'manual');
  document.getElementById('btn-back-saved-actions').onclick = () => window.openSavedQuoteActions(sale.id);
  document.getElementById('btn-generate-saved-pix').onclick = () => { const key = type.value === 'manual' ? manual.value.trim() : (type.value === 'cnpj' ? settings.pixKeyCnpj : settings.pixKey); const payload = buildPixPayload(sale.financeiro?.totalGeral, type.value, key); if (!payload) { showToast('Informe uma chave PIX válida.', 'error'); return; } const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`; document.getElementById('saved-pix-result').innerHTML = `<img src="${qrUrl}" alt="QR Code PIX"><button type="button" class="btn btn-outline btn-block" id="btn-copy-saved-pix">Copiar PIX</button>`; document.getElementById('btn-copy-saved-pix').onclick = () => navigator.clipboard.writeText(payload).then(() => showToast('PIX copia e cola copiado.', 'success')); };
}
function openBoletoUrl(url) { if (!url) { showToast('Adicione a URL do boleto ao editar esta venda.', 'error'); return; } window.open(url, '_blank', 'noopener'); }
async function copySalePix(sale) {
  const payload = buildPixPayload(sale.financeiro?.totalGeral, 'celular');
  if (!payload) { showToast('Cadastre uma chave PIX nas Configurações.', 'error'); return; }
  try { await navigator.clipboard.writeText(payload); showToast('PIX copia e cola com o valor da venda copiado.', 'success'); } catch { showToast('Não foi possível copiar o PIX.', 'error'); }
}

// Vincula os eventos do módulo de orçamentos
function bindOrcamentoEvents() {
  const searchProd = document.getElementById('orc-search-produto');
  const selectProd = document.getElementById('orc-select-produto');
  const selectVar = document.getElementById('orc-select-variacao');
  const selectFrag = document.getElementById('orc-select-fragrancia');
  const selectTabela = document.getElementById('orc-select-tabela');
  const inputPreco = document.getElementById('orc-input-preco');
  const btnAddItem = document.getElementById('btn-add-item');
  
  const formaPag = document.getElementById('orc-forma-pagamento');
  const pixPanel = document.getElementById('orc-pix-panel');
  const boletoPanel = document.getElementById('orc-boleto-panel');
  const inputDesc = document.getElementById('orc-desconto');
  const inputPrazo = document.getElementById('orc-prazo-entrega');
  const inputObservacao = document.getElementById('orc-observacao');
  const selectClient = document.getElementById('orc-select-cliente');
  const selectVendedor = document.getElementById('orc-select-vendedor');

  if (selectVendedor) selectVendedor.onchange = () => { selectedVendedorId = selectVendedor.value; markQuoteDirty(); };

  if (selectClient) {
    selectClient.onchange = () => {
      selectedClientId = selectClient.value;
      const client = getSelectedClient();
      if (!client) { markQuoteDirty(); return; }
      document.getElementById('orc-cliente-nome').value = client.nomeFantasia || client.nome || '';
      document.getElementById('orc-cliente-telefone').value = client.whatsapp || client.telefone || '';
      const priceTable = client.tipoPreco === 'notaFiscal' ? 'notaFiscal' : client.tipoPreco === 'atacado' ? 'atacado' : 'varejo';
      selectTabela.value = priceTable;
      selectTabela.dispatchEvent(new Event('change'));
      markQuoteDirty();
    };
  }

  if (searchProd) {
    searchProd.oninput = () => renderProductSearchResults(searchProd.value);
  }

  document.getElementById('orc-search-results').onclick = event => {
    const button = event.target.closest('[data-product-id]');
    if (!button) return;
    selectProductFromSearch(button.dataset.productId);
  };

  const adjustQuantity = (delta) => {
    const input = document.getElementById('orc-input-qtd');
    const quantity = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
    input.value = quantity;
  };
  document.getElementById('btn-qtd-minus').onclick = () => adjustQuantity(-1);
  document.getElementById('btn-qtd-plus').onclick = () => adjustQuantity(1);

  // Seleção de Produto -> Carrega Variações
  if (selectProd) {
    selectProd.onchange = () => {
      const prodId = selectProd.value;
      const product = (window.productsCache || []).find(p => p.id === prodId);

      selectVar.innerHTML = '<option value="">-- Selecione o volume --</option>';
      selectFrag.innerHTML = '<option value="">-- Nenhuma / Padrão --</option>';
      selectFrag.disabled = true;

      if (product && Array.isArray(product.variacoes) && product.variacoes.length > 0) {
        selectVar.disabled = false;
        product.variacoes.forEach((v, index) => {
          const opt = document.createElement('option');
          opt.value = index;
          opt.textContent = `${v.volume} - Atacado: ${formatCurrency(v.precoAtacado)} | Varejo: ${formatCurrency(v.precoVarejo)} | Nota fiscal: ${formatCurrency(v.precoNotaFiscal !== undefined ? v.precoNotaFiscal : v.precoVarejo)}`;
          selectVar.appendChild(opt);
        });
      } else {
        selectVar.disabled = true;
      }

      if (product && product.variacoes && product.variacoes.length === 1) {
        selectVar.value = '0';
        selectVar.dispatchEvent(new Event('change'));
      }
    };
  }

  // Seleção de Variação -> Carrega Fragrâncias e Preço Padrão
  if (selectVar) {
    selectVar.onchange = () => {
      const prodId = selectProd.value;
      const vIndex = selectVar.value;
      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (product && Array.isArray(product.variacoes) && product.variacoes[vIndex]) {
        const v = product.variacoes[vIndex];
        
        // Atualiza Preço conforme Tabela selecionada
        const tabela = selectTabela.value;
        inputPreco.value = getVariationPrice(v, tabela);

        // Atualiza Fragrâncias
        selectFrag.innerHTML = '<option value="">-- Nenhuma / Padrão --</option>';
        if (v.fragrancias && v.fragrancias.length > 0) {
          selectFrag.disabled = false;
          v.fragrancias.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            selectFrag.appendChild(opt);
          });
        } else {
          selectFrag.disabled = true;
        }

        if (Array.isArray(v.fragrancias) && v.fragrancias.length === 1) {
          selectFrag.value = v.fragrancias[0];
        }
      }
    };
  }

  // Mudança da Tabela de Preço
  if (selectTabela) {
    selectTabela.onchange = () => {
      const prodId = selectProd.value;
      const vIndex = selectVar.value;
      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (product && Array.isArray(product.variacoes) && product.variacoes[vIndex]) {
        const v = product.variacoes[vIndex];
        inputPreco.value = getVariationPrice(v, selectTabela.value);
      }
      applyPriceTableToCart(selectTabela.value);
    };
  }

  // Botão Adicionar Item
  if (btnAddItem) {
    btnAddItem.onclick = () => {
      const prodId = selectProd.value;
      const vIndex = selectVar.value;
      const fragrancia = selectFrag.value;
      const qtd = parseInt(document.getElementById('orc-input-qtd').value, 10);
      const precoUnit = parseCurrency(inputPreco.value);

      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (!product) {
        showToast("Selecione um produto.", "error");
        return;
      }
      if (vIndex === '') {
        showToast("Selecione um volume válido.", "error");
        return;
      }
      if (!Number.isInteger(qtd) || qtd <= 0) {
        showToast("Informe uma quantidade válida.", "error");
        return;
      }
      if (!Number.isFinite(precoUnit) || precoUnit <= 0) {
        showToast("O produto selecionado não possui um preço válido.", "error");
        return;
      }
      if (!Array.isArray(product.variacoes) || !product.variacoes[vIndex]) {
        showToast("Selecione um produto e um volume válido.", "error");
        return;
      }

      const variacao = product.variacoes[vIndex];

      cart.push({
        produtoId: product.id,
        nome: product.nome || product.name || 'Produto sem nome',
        volume: variacao.volume,
        fragrancia: fragrancia || 'Padrão',
        quantidade: qtd,
        precoUnitario: precoUnit,
        subtotal: qtd * precoUnit
      });

      renderCartTable();
      markQuoteDirty();
      updateTotals();
      showToast("Item adicionado ao orçamento.", "info");
    };
  }

  // Recalcular em mudanças de Pagamento e Desconto
  if (formaPag) formaPag.onchange = () => { pixPanel.classList.toggle('hidden', formaPag.value !== 'pix'); boletoPanel.classList.toggle('hidden', formaPag.value !== 'boleto'); markQuoteDirty(); updateTotals(); };
  document.getElementById('btn-generate-pix').onclick = () => showPixForCurrentDocument();
  if (inputDesc) inputDesc.oninput = () => { markQuoteDirty(); updateTotals(); };
  if (inputPrazo) inputPrazo.oninput = markQuoteDirty;
  if (inputObservacao) inputObservacao.oninput = markQuoteDirty;
  document.getElementById('orc-boleto-url').oninput = markQuoteDirty;
  document.getElementById('orc-cliente-nome').oninput = markQuoteDirty;
  document.getElementById('orc-cliente-telefone').oninput = markQuoteDirty;

  // Ações de Salvar, WhatsApp e Impressão
  document.getElementById('btn-save-orcamento').onclick = saveOrcamento;
  if (document.getElementById('btn-whatsapp-orcamento')) {
    document.getElementById('btn-whatsapp-orcamento').onclick = typeof sendOrcamentoWhatsApp === 'function' ? sendOrcamentoWhatsApp : null;
  }
  document.getElementById('btn-print-cupom').onclick = openPrintModal;
  document.getElementById('btn-close-print-modal').onclick = closePrintModal;
  document.getElementById('btn-close-saved-quote').onclick = () => { const modal = document.getElementById('modal-saved-quote'); modal.classList.add('hidden'); modal.style.display = 'none'; };
  document.querySelectorAll('[data-print-type]').forEach(button => {
    button.onclick = () => printQuote(button.dataset.printType);
  });
}

// Renderiza Tabela de Itens
function generateCartRows() {
  if (cart.length === 0) {
    return `<tr><td colspan="5" style="padding:1rem; text-align:center; color:#666;">Nenhum item adicionado.</td></tr>`;
  }

  return cart.map((item, index) => `
    <tr style="border-bottom:1px solid #e2e8f0; font-size:0.85rem;">
      <td style="padding:0.5rem;">
        <strong>${item.nome}</strong> (${item.volume})
        <br><small style="color:#64748b;">Frag: ${item.fragrancia}</small>
      </td>
      <td style="padding:0.5rem;">
        <div class="quantity-control quantity-control-small">
          <button type="button" onclick="changeCartQuantity(${index}, -1)" aria-label="Diminuir quantidade">−</button>
          <input type="number" min="1" value="${item.quantidade}" onchange="setCartQuantity(${index}, this.value)" inputmode="numeric">
          <button type="button" onclick="changeCartQuantity(${index}, 1)" aria-label="Aumentar quantidade">+</button>
        </div>
      </td>
      <td style="padding:0.5rem;">${formatCurrency(item.precoUnitario)}</td>
      <td style="padding:0.5rem;">${formatCurrency(item.subtotal)}</td>
      <td style="padding:0.5rem; text-align:right;">
        <button onclick="removeCartItem(${index})" style="color:red; background:none; border:none; cursor:pointer;">✖</button>
      </td>
    </tr>
  `).join('');
}

function renderCartTable() {
  document.getElementById('cart-table-body').innerHTML = generateCartRows();
}

window.removeCartItem = (index) => {
  cart.splice(index, 1);
  markQuoteDirty();
  renderCartTable();
  updateTotals();
};

window.setCartQuantity = (index, value) => {
  const quantity = parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity <= 0 || !cart[index]) {
    showToast('Informe uma quantidade válida.', 'error');
    renderCartTable();
    return;
  }
  cart[index].quantidade = quantity;
  cart[index].subtotal = Number((cart[index].precoUnitario * quantity).toFixed(2));
  markQuoteDirty();
  renderCartTable();
  updateTotals();
};

window.changeCartQuantity = (index, delta) => {
  if (!cart[index]) return;
  window.setCartQuantity(index, cart[index].quantidade + delta);
};

function applyPriceTableToCart(priceTable) {
  if (!cart.length) return;
  cart = cart.map(item => {
    const product = (window.productsCache || []).find(productItem => productItem.id === item.produtoId);
    const variation = product?.variacoes?.find(variationItem => String(variationItem.volume || '') === String(item.volume || ''));
    if (!variation) return item;
    const precoUnitario = getVariationPrice(variation, priceTable);
    return { ...item, precoUnitario, subtotal: Number((precoUnitario * item.quantidade).toFixed(2)) };
  });
  renderCartTable();
  updateTotals();
}

// Calcula Totais, Taxas e Descontos
function calculateTotals() {
  const subtotal = Number(cart.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0).toFixed(2));
  const desconto = Math.min(subtotal, Math.max(0, parseCurrency(document.getElementById('orc-desconto')?.value || 0)));
  const formaPag = document.getElementById('orc-forma-pagamento')?.value || 'pix';

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  let taxaPercent = 0;

  if (formaPag === 'debito') taxaPercent = Number(settings.taxaDebito) || 0;
  if (formaPag === 'credito') taxaPercent = Number(settings.taxaCredito) || 0;

  const baseCalculo = Math.max(0, subtotal - desconto);
  const calcTaxa = typeof calculateCardFee === 'function' 
    ? calculateCardFee(baseCalculo, taxaPercent, settings.metodoCalculoTaxa || 'add')
    : { totalAmount: baseCalculo, feeAmount: 0 };

  const totalGeral = calcTaxa.totalAmount;
  const valorTaxa = calcTaxa.feeAmount;

  return { subtotal, desconto, formaPag, taxaPercent, valorTaxa, totalGeral };
}

function updateTotals() {
  const { subtotal, desconto, valorTaxa, totalGeral } = calculateTotals();

  document.getElementById('orc-subtotal-val').textContent = formatCurrency(subtotal);
  document.getElementById('orc-desconto-val').textContent = `- ${formatCurrency(desconto)}`;
  document.getElementById('orc-taxa-val').textContent = `+ ${formatCurrency(valorTaxa)}`;
  document.getElementById('orc-total-val').textContent = formatCurrency(totalGeral);
}

// Salva Orçamento no Firestore
async function saveOrcamento() {
  if (cart.length === 0) {
    showToast("Adicione ao menos um item ao orçamento.", "error");
    return;
  }

  const clienteNome = document.getElementById('orc-cliente-nome').value.trim() || 'Cliente Não Informado';
  const clienteTelefone = document.getElementById('orc-cliente-telefone').value.trim();
  const totals = calculateTotals();
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const user = typeof auth !== 'undefined' ? auth.currentUser : null;
  const selectedClient = getSelectedClient();
  const selectedVendedor = getSelectedVendedor();

  let documentNumber;
  try {
    documentNumber = currentQuoteNumber || await reserveDocumentNumber(documentMode === 'pdv' ? 'VEN' : 'ORC');
  } catch (err) {
    console.error('Erro ao reservar numeração:', err);
    showToast('Não foi possível gerar a numeração do documento.', 'error');
    return false;
  }

  const payload = {
    numero: documentNumber,
    tipo: documentMode === 'pdv' ? 'venda' : 'orcamento',
    cliente: {
      id: selectedClient?.id || null,
      nome: clienteNome,
      telefone: clienteTelefone,
      email: selectedClient?.email || '',
      documento: selectedClient?.documento || '',
      tipoPreco: selectedClient?.tipoPreco || document.getElementById('orc-select-tabela').value
    },
    itens: cart,
    financeiro: totals,
    validadeDias: settings.prazoValidadeDias || 1,
    criadoPor: { uid: user?.uid || '', email: user?.email || 'Usuário não identificado' },
    vendedor: { id: selectedVendedor?.id || null, nome: selectedVendedor?.nome || user?.displayName || user?.email || 'Não informado', email: selectedVendedor?.email || user?.email || '' },
    entrega: { prazo: document.getElementById('orc-prazo-entrega').value.trim(), observacao: document.getElementById('orc-observacao').value.trim() },
    boletoUrl: document.getElementById('orc-boleto-url').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    currentQuoteNumber = payload.numero;
    if (savedQuoteId) {
      await db.collection('quotes').doc(savedQuoteId).set(payload, { merge: true });
    } else {
      const savedDocument = await db.collection('quotes').add(payload);
      savedQuoteId = savedDocument.id;
    }
    showToast(documentMode === 'pdv' ? 'Venda salva com sucesso!' : 'Orçamento salvo com sucesso!', "success");
    if (typeof window.goToDocumentStep === 'function') {
      window.goToDocumentStep(3);
    }
    return true;
  } catch (err) {
    console.error("Erro ao salvar orçamento:", err);
    showToast("Erro ao salvar orçamento.", "error");
    return false;
  }
}

// Imprime Cupom para Impressora Térmica de 80mm
function openPrintModal() {
  if (cart.length === 0) {
    showToast(documentMode === 'pdv' ? 'Adicione itens para imprimir o cupom.' : 'Adicione itens para imprimir o orçamento.', 'error');
    return;
  }
  const modal = document.getElementById('modal-print-type');
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  document.querySelectorAll('[data-print-type]').forEach(button => {
    const isDefault = button.dataset.printType === (settings.formatoPadraoCupom || '80mm');
    button.classList.toggle('btn-primary', isDefault);
    button.classList.toggle('btn-outline', !isDefault);
  });
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closePrintModal() {
  const modal = document.getElementById('modal-print-type');
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function printQuote(printType) {
  closePrintModal();
  if (cart.length === 0) return;
  if (!await saveOrcamento()) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const clienteNome = document.getElementById('orc-cliente-nome').value.trim() || 'Cliente Balcão';
  const clienteTelefone = document.getElementById('orc-cliente-telefone').value.trim() || '-';
  const vendedor = getSelectedVendedor();
  const totals = calculateTotals();
  const isThermal = printType === '80mm' || printType === '58mm';

  let printArea = document.getElementById('print-area');
  if (!printArea) {
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    document.body.appendChild(printArea);
  } else if (printArea.parentElement !== document.body) {
    document.body.appendChild(printArea);
  }

  printArea.className = `print-document print-${printType}`;
  printArea.style.fontFamily = isThermal ? "'Courier New', Courier, monospace" : (settings.fonteCupom || "'Plus Jakarta Sans', Arial, sans-serif");
  printArea.style.fontSize = `${settings.tamanhoFonteCupom || (isThermal ? 11 : 12)}px`;
  printArea.style.display = 'block';

  printArea.innerHTML = `
    <header class="print-header">
      ${(settings.logoCupomUrl || settings.logoUrl) ? `<img class="print-logo" src="${settings.logoCupomUrl || settings.logoUrl}" alt="Logo">` : ''}
      <h1>${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</h1>
      <p>${escapeProductHtml(settings.razaoSocial || '')}</p>
      <p>CNPJ: ${escapeProductHtml(settings.cnpj || '')}</p>
      <p>${escapeProductHtml(settings.whatsapp || settings.telefone || '')}</p>
    </header>
    <div class="print-title">${documentMode === 'pdv' ? 'CUPOM NÃO FISCAL' : 'ORÇAMENTO'} Nº ${getQuoteNumber(documentMode === 'pdv' ? 'VEN' : 'ORC')}</div>
    <div class="print-meta">
      <span>Data: ${formatDateTime(new Date())}</span>
      <span>Cliente: ${escapeProductHtml(clienteNome)}</span>
      <span>Telefone: ${escapeProductHtml(clienteTelefone)}</span>
      <span>Vendedor: ${escapeProductHtml(vendedor?.nome || (typeof auth !== 'undefined' ? auth.currentUser?.email : '') || '-')}</span>
    </div>
    <table class="print-items">
      <thead>
        <tr>
          <th>Qtd</th>
          <th>Item</th>
          ${isThermal ? '' : '<th>Unitário</th>'}
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${cart.map(item => `
          <tr>
            <td>${item.quantidade}x</td>
            <td>${escapeProductHtml(item.nome)} ${escapeProductHtml(item.volume)}<br><small style="color:#555;">${escapeProductHtml(item.fragrancia)}</small></td>
            ${isThermal ? '' : `<td>${formatCurrency(item.precoUnitario)}</td>`}
            <td style="text-align:right;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <section class="print-totals">
      <p><span>Subtotal</span><span>${formatCurrency(totals.subtotal)}</span></p>
      <p><span>Desconto</span><span>- ${formatCurrency(totals.desconto)}</span></p>
      <p><span>Taxa</span><span>+ ${formatCurrency(totals.valorTaxa)}</span></p>
      <p class="print-total"><span>TOTAL</span><span>${formatCurrency(totals.totalGeral)}</span></p>
      <p><span>Pagamento</span><span>${totals.formaPag.toUpperCase()}</span></p>
    </section>
    <footer class="print-footer">
      ${document.getElementById('orc-prazo-entrega')?.value ? `Prazo de entrega: ${escapeProductHtml(document.getElementById('orc-prazo-entrega').value)}<br>` : ''}
      ${document.getElementById('orc-observacao')?.value ? `${escapeProductHtml(document.getElementById('orc-observacao').value)}<br>` : ''}
      ${settings.exibirAvisoNoCupom !== false && settings.avisoEstoque ? `${escapeProductHtml(settings.avisoEstoque)}<br>` : ''}
      <strong style="display:block; margin-top:4px;">${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência!')}</strong>
    </footer>
  `;

  window.print();
  window.setTimeout(() => {
    if (printArea) printArea.style.display = 'none';
  }, 500);
}

// Atualiza Métricas no Dashboard
function updateDashboardQuoteMetrics() {
  const recentElem = document.getElementById('dash-recent-quotes');
  const totalValElem = document.getElementById('dash-total-quotes-value');
  const salesElem = document.getElementById('dash-total-sales');
  const salesValueElem = document.getElementById('dash-total-sales-value');

  if (recentElem && totalValElem) {
    const quotes = quotesHistory.filter(q => q.tipo !== 'venda');
    const sales = quotesHistory.filter(q => q.tipo === 'venda');
    recentElem.textContent = quotes.length;
    const totalSuma = quotes.reduce((acc, q) => acc + (q.financeiro?.totalGeral || 0), 0);
    totalValElem.textContent = formatCurrency(totalSuma);
    if (salesElem) salesElem.textContent = sales.length;
    if (salesValueElem) salesValueElem.textContent = formatCurrency(sales.reduce((acc, sale) => acc + (sale.financeiro?.totalGeral || 0), 0));
  }
  if (typeof window.updateFinanceiro === 'function') window.updateFinanceiro();
}

// Helper: filtra vendas por período conforme os seletores informados
function _filterSalesByPeriod(periodValue, startInput, endInput) {
  const getDate = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;
  const now = new Date(); now.setHours(23, 59, 59, 999);
  let start = null; let end = now;
  if (periodValue === 'week') { start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
  if (periodValue === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (periodValue === 'custom') {
    start = startInput?.value ? new Date(`${startInput.value}T00:00:00`) : null;
    end = endInput?.value ? new Date(`${endInput.value}T23:59:59`) : null;
  }
  return (window.quotesCache?.length ? window.quotesCache : quotesHistory).filter(doc => {
    if (doc.tipo !== 'venda') return false;
    const date = getDate(doc.createdAt);
    return (!start || (date && date >= start)) && (!end || (date && date <= end));
  });
}

// Atualiza apenas o card de resumo no Dashboard
window.updateDashboardFinancial = function() {
  const period = document.getElementById('fin-period');
  const startInput = document.getElementById('fin-date-start');
  const endInput = document.getElementById('fin-date-end');
  const periodValue = period ? period.value : 'month';
  const sales = _filterSalesByPeriod(periodValue, startInput, endInput);
  const revenue = sales.reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);
  const countEl = document.getElementById('dash-period-sales-count');
  const valueEl = document.getElementById('dash-period-sales-value');
  if (countEl) countEl.textContent = sales.length;
  if (valueEl) valueEl.textContent = formatCurrency(revenue);
};

// Atualiza a view dedicada de Balanço Financeiro
window.updateFinanceiro = function() {
  const period = document.getElementById('fin-period');
  const startInput = document.getElementById('fin-date-start');
  const endInput = document.getElementById('fin-date-end');
  if (!period) return;

  const sales = _filterSalesByPeriod(period.value, startInput, endInput);
  const revenue = sales.reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);
  const receivable = sales.filter(s => s.financeiro?.formaPag === 'receber').reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);

  const revEl = document.getElementById('fin-revenue');
  const cntEl = document.getElementById('fin-count');
  const recEl = document.getElementById('fin-receivable');
  if (revEl) revEl.textContent = formatCurrency(revenue);
  if (cntEl) cntEl.textContent = sales.length;
  if (recEl) recEl.textContent = formatCurrency(receivable);

  // Também atualiza o card do dashboard
  const dashCount = document.getElementById('dash-period-sales-count');
  const dashValue = document.getElementById('dash-period-sales-value');
  if (dashCount) dashCount.textContent = sales.length;
  if (dashValue) dashValue.textContent = formatCurrency(revenue);

  const list = document.getElementById('fin-sales-list');
  if (!list) return;
  list.innerHTML = sales.length
    ? sales.map(sale => `
        <button type="button" class="fin-sale-item" onclick="openSavedQuoteActions('${sale.id}')">
          <div class="fin-sale-info">
            <strong>${escapeProductHtml(sale.numero || sale.id)}</strong>
            <small>${sale.cliente?.nome || 'Cliente não informado'} · ${sale.createdAt?.toDate ? formatDateTime(sale.createdAt.toDate()) : '-'}</small>
          </div>
          <div class="fin-sale-right">
            <span class="fin-sale-value">${formatCurrency(sale.financeiro?.totalGeral)}</span>
            <span class="fin-sale-badge fin-badge-${sale.financeiro?.formaPag === 'receber' ? 'pending' : 'paid'}">${sale.financeiro?.formaPag === 'receber' ? 'A receber' : 'Pago'}</span>
          </div>
        </button>`).join('')
    : '<p class="empty-state">Nenhuma venda no período selecionado.</p>';
};
