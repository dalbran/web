/**
 * Módulo de Configurações da Empresa, Taxas de Cartão e Parâmetros Comerciais
 */

let currentSettings = {
  nomeFantasia: "DALBRAN DISTRIBUIDORA",
  razaoSocial: "Dalbran do Brasil-Distribuidora, Comercio e Servicos LTDA",
  cnpj: "03.822.789/0001-54",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  taxaDebito: 1.5,
  taxaCredito: 3.5,
  metodoCalculoTaxa: "add", // 'add' ou 'liquid'
  prazoValidadeDias: 1,
  avisoEstoque: "Este orçamento possui validade limitada e está sujeito à disponibilidade de estoque, podendo os produtos esgotar sem aviso prévio.",
  mensagemPadrao: "Agradecemos a preferência!",
  formatoPadraoCupom: "80mm",
  fonteCupom: "Arial",
  tamanhoFonteCupom: 12,
  exibirAvisoNoCupom: true,
  compartilharWhatsAppAtivo: true,
  pixKey: "21998852318",
  pixCidade: "RIO DE JANEIRO",
  pixKeyCnpj: "03822789000154",
  logoUrl: "",
  logoLoginUrl: "logodash.png",
  logoHeaderUrl: "logoweb2.png",
  logoCupomUrl: "logoweb2.png",
  boletoUrl: "",
  gmailRemetente: ""
};
window.operatorsCache = [];

function ensureCurrentOperator(user) {
  if (!user?.email) return;
  db.collection('users').where('email', '==', user.email).limit(1).get().then(async snapshot => {
    if (!snapshot.empty) return;
    const masters = await db.collection('users').where('papel', '==', 'master').limit(1).get();
    return db.collection('users').add({ nome: user.displayName || user.email.split('@')[0], email: user.email, ativo: true, papel: masters.empty ? 'master' : 'operador', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }).catch(error => console.error('Erro ao registrar operador atual:', error));
}

function initOperatorsModule() {
  db.collection('users').orderBy('nome', 'asc').onSnapshot(snapshot => {
    window.operatorsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(operator => operator.ativo !== false);
    window.currentOperator = window.operatorsCache.find(operator => operator.email === auth.currentUser?.email) || null;
    window.isMasterUser = window.currentOperator?.papel === 'master';
    if (typeof window.populateVendedorSelect === 'function') window.populateVendedorSelect();
    if (document.getElementById('operators-list')) renderOperatorsList();
  }, error => console.error('Erro ao carregar operadores:', error));
}

document.addEventListener('DOMContentLoaded', () => {
  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        initSettingsModule();
        ensureCurrentOperator(user);
        initOperatorsModule();
      }
    });
  }
});

// Inicializa escuta das configurações no Firestore
function initSettingsModule() {
  const settingsDoc = db.collection('settings').doc('company');

  settingsDoc.onSnapshot((doc) => {
    if (doc.exists) {
      currentSettings = { ...currentSettings, ...doc.data() };
    } else {
      // Cria registro inicial com valores padrão
      settingsDoc.set(currentSettings).catch(err => console.error("Erro ao criar settings iniciais:", err));
    }
    applyCompanyBranding();
    renderSettingsView();
  }, (error) => {
    console.error("Erro ao carregar configurações:", error);
  });
}

function applyCompanyBranding() {
  const name = currentSettings.nomeFantasia || 'DALBRAN';
  ['login-brand-name'].forEach(id => { const element = document.getElementById(id); if (element) element.textContent = name; });
  const logos = { 'login-logo-image': currentSettings.logoLoginUrl || currentSettings.logoUrl, 'header-logo-image': currentSettings.logoHeaderUrl === 'logoweb.png' ? 'logoweb2.png' : (currentSettings.logoHeaderUrl || currentSettings.logoUrl) };
  Object.entries(logos).forEach(([id, url]) => { const image = document.getElementById(id); if (!image) return; image.src = url || ''; image.classList.toggle('hidden', !url); });
}

// Renderiza a Interface de Configurações
function renderSettingsView() {
  const container = document.getElementById('view-configuracoes');
  if (!container) return;

  const masterOnly = window.isMasterUser === false ? 'disabled' : '';
  const masterNotice = window.isMasterUser === false ? '<p class="master-notice">Somente o usuário master pode editar as configurações da empresa.</p>' : '';
  container.innerHTML = `
    <div class="view-header" style="margin-bottom:1.5rem;">
      <h2>Configurações do Sistema</h2>
    </div>

    ${masterNotice}<form id="form-settings" class="settings-panel">
      
      <h3>Dados da Empresa</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
        <div class="form-group">
          <label>Nome Fantasia</label>
          <input type="text" id="set-nomeFantasia" value="${currentSettings.nomeFantasia || ''}" required>
        </div>
        <div class="form-group">
          <label>Razão Social</label>
          <input type="text" id="set-razaoSocial" value="${currentSettings.razaoSocial || ''}" required>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>CNPJ</label>
          <input type="text" id="set-cnpj" value="${currentSettings.cnpj || ''}">
        </div>
        <div class="form-group">
          <label>Telefone</label>
          <input type="text" id="set-telefone" value="${currentSettings.telefone || ''}">
        </div>
        <div class="form-group">
          <label>WhatsApp</label>
          <input type="text" id="set-whatsapp" value="${currentSettings.whatsapp || ''}">
        </div>
      </div>

      <div class="form-group">
        <label>Endereço Completo</label>
        <input type="text" id="set-endereco" value="${currentSettings.endereco || ''}">
      </div>
      <div class="brand-settings"><h3>Logos da empresa</h3><p>Use URL direta de imagem <strong>PNG</strong>. Para cupom térmico, prefira logo simples, preta/cinza, horizontal e compacta.</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem"><div class="form-group"><label>Logo do login (PNG)</label><input type="url" id="set-logoLoginUrl" value="${currentSettings.logoLoginUrl || currentSettings.logoUrl || ''}" placeholder="https://exemplo.com/logo-login.png"></div><div class="form-group"><label>Logo do cabeçalho (PNG)</label><input type="url" id="set-logoHeaderUrl" value="${currentSettings.logoHeaderUrl === 'logoweb.png' ? 'logoweb2.png' : (currentSettings.logoHeaderUrl || currentSettings.logoUrl || '')}" placeholder="https://exemplo.com/logo-cabecalho.png"></div><div class="form-group"><label>Logo do cupom térmico (PNG)</label><input type="url" id="set-logoCupomUrl" value="${currentSettings.logoCupomUrl || currentSettings.logoUrl || ''}" placeholder="https://exemplo.com/logo-cupom.png"></div></div><small>Para térmica: PNG de até 384 px de largura, sem transparências complexas. A compatibilidade final depende da impressora e do navegador.</small></div>

      <hr style="margin:1.5rem 0;">

      <h3>Taxas de Cartão e Regras Comerciais</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1rem; margin-top:1rem;">
        <div class="form-group">
          <label>Taxa Débito (%)</label>
          <input type="text" inputmode="decimal" id="set-taxaDebito" value="${currentSettings.taxaDebito || 0}" placeholder="Ex: 1,6">
        </div>
        <div class="form-group">
          <label>Taxa Crédito (%)</label>
          <input type="text" inputmode="decimal" id="set-taxaCredito" value="${currentSettings.taxaCredito || 0}" placeholder="Ex: 1,6">
        </div>
        <div class="form-group">
          <label>Validade do Orçamento (Dias)</label>
          <input type="number" id="set-prazoValidadeDias" value="${currentSettings.prazoValidadeDias || 1}">
        </div>
      </div>

      <div class="form-group">
        <label>Método de Cálculo da Taxa do Cartão</label>
        <select id="set-metodoCalculoTaxa">
          <option value="add" ${currentSettings.metodoCalculoTaxa === 'add' ? 'selected' : ''}>Acrescentar taxa (Subtotal + X%)</option>
          <option value="liquid" ${currentSettings.metodoCalculoTaxa === 'liquid' ? 'selected' : ''}>Calcular valor necessário para receber o valor líquido</option>
        </select>
      </div>

      <div class="form-group">
        <label>Aviso de Estoque / Validade (Exibido no Cupom)</label>
        <textarea id="set-avisoEstoque" rows="2">${currentSettings.avisoEstoque || ''}</textarea>
      </div>

      <hr style="margin:1.5rem 0;">

      <h3>Orçamentos, Cupons e WhatsApp</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
        <div class="form-group"><label>Formato padrão de impressão</label><select id="set-formatoPadraoCupom"><option value="a4" ${currentSettings.formatoPadraoCupom === 'a4' ? 'selected' : ''}>A4 / PDF</option><option value="80mm" ${currentSettings.formatoPadraoCupom === '80mm' ? 'selected' : ''}>Cupom térmico 80 mm</option><option value="58mm" ${currentSettings.formatoPadraoCupom === '58mm' ? 'selected' : ''}>Cupom térmico 58 mm</option></select></div>
        <div class="form-group"><label>Fonte do cupom</label><select id="set-fonteCupom"><option value="Arial" ${currentSettings.fonteCupom === 'Arial' ? 'selected' : ''}>Arial</option><option value="Courier New" ${currentSettings.fonteCupom === 'Courier New' ? 'selected' : ''}>Courier New</option><option value="Verdana" ${currentSettings.fonteCupom === 'Verdana' ? 'selected' : ''}>Verdana</option></select></div>
        <div class="form-group"><label>Tamanho da fonte (px)</label><input id="set-tamanhoFonteCupom" type="number" min="8" max="18" value="${currentSettings.tamanhoFonteCupom || 12}"></div>
      </div>
      <div class="form-group"><label>Mensagem final para orçamento, cupom e WhatsApp</label><textarea id="set-mensagemPadrao" rows="2">${currentSettings.mensagemPadrao || ''}</textarea></div>
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;"><label><input id="set-exibirAvisoNoCupom" type="checkbox" ${currentSettings.exibirAvisoNoCupom !== false ? 'checked' : ''}> Exibir aviso/validade no cupom</label><label><input id="set-compartilharWhatsAppAtivo" type="checkbox" ${currentSettings.compartilharWhatsAppAtivo !== false ? 'checked' : ''}> Habilitar compartilhamento via WhatsApp</label></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem;"><div class="form-group"><label>Chave PIX (celular)</label><input id="set-pixKey" inputmode="numeric" value="${currentSettings.pixKey || ''}"></div><div class="form-group"><label>Chave PIX (CNPJ)</label><input id="set-pixKeyCnpj" value="${currentSettings.pixKeyCnpj || ''}"></div><div class="form-group"><label>Cidade do recebedor (PIX)</label><input id="set-pixCidade" value="${currentSettings.pixCidade || ''}"></div><div class="form-group"><label>Gmail remetente (preparação)</label><input id="set-gmailRemetente" type="email" value="${currentSettings.gmailRemetente || ''}" placeholder="empresa@gmail.com"><small>O envio será ativado depois com integração segura.</small></div></div>
      <div class="bank-future-note"><strong>Integração bancária futura</strong><span>Os boletos são definidos individualmente em cada venda. Uma integração automática poderá ser configurada aqui futuramente.</span></div>

      <div style="text-align:right; margin-top:1.5rem;">
        <button type="submit" class="btn btn-primary" ${masterOnly}>Salvar Configurações</button>
      </div>
    </form>

    <section class="operators-panel ${window.isMasterUser === false ? 'hidden' : ''}">
      <div class="view-header"><h3>vendedores / operadores</h3><span>Cadastre quem poderá ser selecionado nos orçamentos e vendas.</span></div>
      <form id="form-operator" class="operator-form"><div class="form-group"><label>Nome do vendedor</label><input id="operator-nome" required placeholder="Ex.: João Silva"></div><div class="form-group"><label>E-mail de login</label><input id="operator-email" type="email" required placeholder="vendedor@empresa.com"></div><button class="btn btn-primary" type="submit">Adicionar vendedor</button></form>
      <div id="operators-list" class="operators-list"></div>
    </section>
  `;

  bindSettingsFormEvent();
  document.querySelectorAll('#form-settings input, #form-settings select, #form-settings textarea').forEach(element => { if (window.isMasterUser === false) element.disabled = true; });
  bindOperatorsEvents();
}

function renderOperatorsList() {
  const list = document.getElementById('operators-list');
  if (!list) return;
  list.innerHTML = window.operatorsCache.length ? window.operatorsCache.map(operator => `<div class="operator-row"><div><strong>${escapeOperatorHtml(operator.nome || operator.email)}</strong><small>${escapeOperatorHtml(operator.email || '')}${operator.papel === 'master' ? ' · master' : ''}</small></div><button type="button" class="btn btn-outline btn-sm" onclick="toggleOperator('${operator.id}')">Desativar</button></div>`).join('') : '<p class="empty-state">Nenhum vendedor cadastrado.</p>';
}
function escapeOperatorHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function bindOperatorsEvents() {
  const form = document.getElementById('form-operator');
  if (!form) return;
  form.onsubmit = async event => { event.preventDefault(); const nome = document.getElementById('operator-nome').value.trim(); const email = document.getElementById('operator-email').value.trim().toLowerCase(); try { const found = await db.collection('users').where('email', '==', email).limit(1).get(); if (!found.empty) { showToast('Este e-mail já está cadastrado como operador.', 'error'); return; } await db.collection('users').add({ nome, email, ativo: true, papel: 'operador', createdAt: firebase.firestore.FieldValue.serverTimestamp() }); form.reset(); showToast('Vendedor cadastrado.', 'success'); } catch (error) { console.error(error); showToast('Não foi possível cadastrar o vendedor.', 'error'); } };
}
window.toggleOperator = async id => { try { await db.collection('users').doc(id).set({ ativo: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); showToast('Vendedor desativado.', 'info'); } catch (error) { console.error(error); showToast('Não foi possível desativar o vendedor.', 'error'); } };

// Evento de Gravação no Firestore
function bindSettingsFormEvent() {
  const form = document.getElementById('form-settings');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();

    const payload = {
      nomeFantasia: document.getElementById('set-nomeFantasia').value.trim(),
      razaoSocial: document.getElementById('set-razaoSocial').value.trim(),
      cnpj: document.getElementById('set-cnpj').value.trim(),
      telefone: document.getElementById('set-telefone').value.trim(),
      whatsapp: document.getElementById('set-whatsapp').value.trim(),
      endereco: document.getElementById('set-endereco').value.trim(),
      taxaDebito: parseCurrency(document.getElementById('set-taxaDebito').value),
      taxaCredito: parseCurrency(document.getElementById('set-taxaCredito').value),
      prazoValidadeDias: parseInt(document.getElementById('set-prazoValidadeDias').value, 10) || 1,
      metodoCalculoTaxa: document.getElementById('set-metodoCalculoTaxa').value,
      avisoEstoque: document.getElementById('set-avisoEstoque').value.trim(),
      mensagemPadrao: document.getElementById('set-mensagemPadrao').value.trim(),
      formatoPadraoCupom: document.getElementById('set-formatoPadraoCupom').value,
      fonteCupom: document.getElementById('set-fonteCupom').value,
      tamanhoFonteCupom: Math.min(18, Math.max(8, parseInt(document.getElementById('set-tamanhoFonteCupom').value, 10) || 12)),
      exibirAvisoNoCupom: document.getElementById('set-exibirAvisoNoCupom').checked,
      compartilharWhatsAppAtivo: document.getElementById('set-compartilharWhatsAppAtivo').checked,
      pixKey: document.getElementById('set-pixKey').value.trim(),
      pixKeyCnpj: document.getElementById('set-pixKeyCnpj').value.trim(),
      pixCidade: document.getElementById('set-pixCidade').value.trim().toUpperCase(),
      logoUrl: document.getElementById('set-logoLoginUrl').value.trim(),
      logoLoginUrl: document.getElementById('set-logoLoginUrl').value.trim(),
      logoHeaderUrl: document.getElementById('set-logoHeaderUrl').value.trim(),
      logoCupomUrl: document.getElementById('set-logoCupomUrl').value.trim(),
      gmailRemetente: document.getElementById('set-gmailRemetente').value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection('settings').doc('company').set(payload, { merge: true });
      showToast("Configurações salvas com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      showToast("Erro ao salvar configurações.", "error");
    }
  };
}

// Exporta objeto de configurações globalmente para o motor de orçamentos
window.getCompanySettings = () => currentSettings;
