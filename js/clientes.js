/** Cadastro de clientes e histórico de orçamentos (Firestore). */
window.clientsCache = [];
window.quotesCache = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof auth === 'undefined') return;
  auth.onAuthStateChanged(user => {
    if (user) initClientsModule();
  });
});

function initClientsModule() {
  db.collection('clients').orderBy('nome', 'asc').onSnapshot(snapshot => {
    window.clientsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderClientsView();
    updateDashboardClients();
    if (typeof window.populateOrcamentoClientsSelect === 'function') window.populateOrcamentoClientsSelect();
  }, error => {
    console.error('Erro ao carregar clientes:', error);
    showToast('Não foi possível sincronizar os clientes.', 'error');
  });

  db.collection('quotes').orderBy('createdAt', 'desc').limit(100).onSnapshot(snapshot => {
    window.quotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSavedQuotesSidebar();
    if (typeof window.updateDashboardFinancial === 'function') window.updateDashboardFinancial();
  }, error => {
    console.error('Erro ao carregar orçamentos:', error);
  });
}

function renderClientsView() {
  const container = document.getElementById('view-clientes');
  if (!container) return;
  container.innerHTML = `
    <div class="view-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><h2>Clientes</h2><button id="btn-new-client" class="btn btn-primary btn-sm">+ Novo cliente</button></div>
    <div class="form-group"><input id="search-client" type="search" placeholder="Buscar por nome, empresa, telefone ou documento"></div>
    <div style="overflow-x:auto;background:white;border:1px solid #e2e8f0;border-radius:8px;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8fafc;text-align:left;"><th style="padding:.75rem">Cliente</th><th style="padding:.75rem">Tipo de preço</th><th style="padding:.75rem">Contato</th><th style="padding:.75rem;text-align:right">Ação</th></tr></thead><tbody id="clients-table-body"></tbody></table></div>
    <div id="modal-client" class="modal hidden print-modal"><div class="print-modal-card" style="max-width:620px;max-height:90vh;overflow:auto;position:relative;"><button type="button" class="modal-close-x" id="btn-close-client-x" aria-label="Fechar">&times;</button><h3 id="client-modal-title">Cadastrar cliente</h3><form id="form-client" style="margin-top:1rem;"><input id="client-id" type="hidden"><div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem"><div class="form-group"><label>Nome completo / Razão social</label><input id="client-nome" required></div><div class="form-group"><label>Nome fantasia</label><input id="client-fantasia"></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem"><div class="form-group"><label>E-mail</label><input id="client-email" type="email"></div><div class="form-group"><label>Telefone</label><input id="client-telefone"></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem"><div class="form-group"><label>WhatsApp</label><input id="client-whatsapp"></div><div class="form-group"><label>CPF ou CNPJ</label><input id="client-documento"></div></div><div class="form-group"><label>URL da foto de perfil</label><input id="client-foto-url" type="url" placeholder="https://exemplo.com/foto.jpg"><small>Opcional. A foto é carregada pela URL, sem ocupar armazenamento.</small></div><div class="form-group"><label>Tipo de preço</label><select id="client-tipo-preco"><option value="varejo">Varejo</option><option value="atacado">Atacado</option><option value="notaFiscal">Nota fiscal</option></select></div><div style="display:flex;justify-content:flex-end;gap:.5rem"><button type="button" id="btn-cancel-client" class="btn btn-outline">Cancelar</button><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form></div></div><div id="modal-client-profile" class="modal hidden print-modal"><div class="print-modal-card client-profile-card"><button type="button" class="modal-close" id="btn-close-client-profile" aria-label="Fechar">×</button><div id="client-profile-content"></div></div></div>`;
  bindClientsEvents();
  renderClientsRows(window.clientsCache);
}

function renderClientsRows(clients) {
  const body = document.getElementById('clients-table-body');
  if (!body) return;
  body.innerHTML = clients.length ? clients.map(client => {
    const whatsapp = String(client.whatsapp || '').replace(/\D/g, '');
    const name = escapeClientHtml(client.nome || 'Cliente sem nome');
    const fantasia = escapeClientHtml(client.nomeFantasia || '');
    const contact = escapeClientHtml(client.whatsapp || client.telefone || '-');
    return `<tr style="border-top:1px solid #e2e8f0"><td style="padding:.75rem"><button class="client-profile-trigger" type="button" onclick="openClientProfile('${client.id}')"><div class="client-identity"><img class="client-avatar" src="${getClientAvatar(client)}" alt="Foto de perfil de ${name}"><div><strong>${name}</strong>${fantasia ? `<br><small>${fantasia}</small>` : ''}</div></div></button></td><td style="padding:.75rem">${client.tipoPreco === 'notaFiscal' ? 'Nota fiscal' : client.tipoPreco === 'atacado' ? 'Atacado' : 'Varejo'}</td><td style="padding:.75rem">${contact}<br><small>${escapeClientHtml(client.documento || '')}</small></td><td style="padding:.75rem;text-align:right"><div class="client-actions">${whatsapp ? `<button class="btn-whatsapp" type="button" onclick="openClientWhatsApp('${whatsapp}')" title="Conversar no WhatsApp" aria-label="Conversar no WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.05 0C5.47 0 .12 5.35.12 11.93c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.74 1.46h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.19-1.24-6.18-3.48-8.38ZM12.05 21.8a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.23-.38a9.85 9.85 0 1 1 8.36 4.64Zm5.4-7.37c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.24-.46-2.37-1.47-.87-.78-1.46-1.74-1.63-2.04-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.13 4.55.72.31 1.28.5 1.72.64.72.23 1.37.2 1.88.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg></button>` : ''}<button class="btn btn-outline btn-sm" onclick="editClient('${client.id}')">Editar</button></div></td></tr>`;
  }).join('') : '<tr><td colspan="4" style="padding:1rem;text-align:center">Nenhum cliente cadastrado.</td></tr>';
}

function escapeClientHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function getClientAvatar(client) { return client.fotoUrl || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#e2e8f0"/><circle cx="40" cy="29" r="14" fill="#94a3b8"/><path d="M15 74c3-16 13-25 25-25s22 9 25 25" fill="#94a3b8"/></svg>'); }
window.openClientWhatsApp = phone => window.open(`https://wa.me/55${String(phone).replace(/^55/, '')}`, '_blank', 'noopener');

function updateDashboardClients() {
  const count = window.clientsCache.length;
  const total = document.getElementById('dash-total-clients');
  const label = document.getElementById('dash-clients-count');
  const list = document.getElementById('dash-clients-list');
  if (total) total.textContent = count;
  if (label) label.textContent = `${count} ${count === 1 ? 'cliente' : 'clientes'}`;
  if (!list) return;
  list.innerHTML = count ? window.clientsCache.map(client => `<button type="button" class="dashboard-client" onclick="navigateToClientProfile('${client.id}')"><img class="client-avatar" src="${getClientAvatar(client)}" alt=""><div><strong>${escapeClientHtml(client.nome || 'Cliente sem nome')}</strong>${client.nomeFantasia ? `<small>${escapeClientHtml(client.nomeFantasia)}</small>` : ''}</div></button>`).join('') : '<p class="empty-state">Nenhum cliente cadastrado.</p>';
}

window.navigateToClientProfile = id => { if (typeof window.navigateToView === 'function') window.navigateToView('view-clientes'); window.setTimeout(() => window.openClientProfile(id), 0); };

function bindClientsEvents() {
  document.getElementById('btn-new-client').onclick = () => openClientModal();
  document.getElementById('btn-cancel-client').onclick = closeClientModal;
  
  const btnCloseX = document.getElementById('btn-close-client-x');
  if (btnCloseX) btnCloseX.onclick = closeClientModal;

  document.getElementById('btn-close-client-profile').onclick = () => document.getElementById('modal-client-profile').classList.add('hidden');
  document.getElementById('search-client').oninput = event => {
    const term = normalizeSearchText(event.target.value);
    renderClientsRows(window.clientsCache.filter(c => normalizeSearchText(`${c.nome} ${c.nomeFantasia} ${c.telefone} ${c.whatsapp} ${c.documento}`).includes(term)));
  };
  document.getElementById('form-client').onsubmit = saveClient;
}

function openClientModal(client = null) {
  const modal = document.getElementById('modal-client');
  document.getElementById('form-client').reset();
  document.getElementById('client-id').value = client?.id || '';
  document.getElementById('client-modal-title').textContent = client ? 'Editar cliente' : 'Cadastrar cliente';
  if (client) ['nome','email','telefone','whatsapp','documento'].forEach(field => document.getElementById(`client-${field}`).value = client[field] || '');
  if (client) document.getElementById('client-foto-url').value = client.fotoUrl || '';
  if (client) document.getElementById('client-fantasia').value = client.nomeFantasia || '';
  if (client) document.getElementById('client-tipo-preco').value = client.tipoPreco || 'varejo';
  modal.classList.remove('hidden'); modal.style.display = 'flex';
}
function closeClientModal() { const modal = document.getElementById('modal-client'); modal.classList.add('hidden'); modal.style.display = 'none'; }
window.editClient = id => { const client = window.clientsCache.find(c => c.id === id); if (client) openClientModal(client); };
window.openClientProfile = id => {
  const client = window.clientsCache.find(c => c.id === id); const modal = document.getElementById('modal-client-profile'); const content = document.getElementById('client-profile-content');
  if (!client || !modal || !content) return;
  const clientQuotes = window.quotesCache.filter(q => q.cliente?.id === id && q.tipo !== 'venda');
  const clientSales = window.quotesCache.filter(q => q.cliente?.id === id && q.tipo === 'venda');
  const receivable = clientSales.filter(sale => sale.financeiro?.formaPag === 'receber').reduce((total, sale) => total + Number(sale.financeiro?.totalGeral || 0), 0);
  const list = (items, empty) => items.length ? items.map(q => `<button type="button" onclick="openSavedQuoteActions('${q.id}')"><strong>${escapeClientHtml(q.numero || q.id)}</strong><span>${formatCurrency(q.financeiro?.totalGeral)}</span><small>${q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : '-'}</small></button>`).join('') : `<p class="empty-state">${empty}</p>`;
  content.innerHTML = `<div class="client-profile-heading"><img class="client-avatar client-avatar-large" src="${getClientAvatar(client)}" alt=""><div><h3>${escapeClientHtml(client.nome || 'Cliente')}</h3><p>${escapeClientHtml(client.whatsapp || client.telefone || 'Sem contato')}</p><small>${client.tipoPreco === 'atacado' ? 'Atacado' : client.tipoPreco === 'notaFiscal' ? 'Nota fiscal' : 'Varejo'}</small></div></div>${receivable ? `<div class="receivable-card"><span>Valor a receber</span><strong>${formatCurrency(receivable)}</strong></div>` : ''}<h4>Orçamentos emitidos (${clientQuotes.length})</h4><div class="client-quotes-history">${list(clientQuotes, 'Nenhum orçamento emitido para este cliente.')}</div><h4 style="margin-top:1rem">Vendas finalizadas (${clientSales.length})</h4><div class="client-quotes-history">${list(clientSales, 'Nenhuma venda finalizada para este cliente.')}</div>`;
  modal.classList.remove('hidden'); modal.style.display = 'flex';
};

async function saveClient(event) {
  event.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = { nome: document.getElementById('client-nome').value.trim(), nomeFantasia: document.getElementById('client-fantasia').value.trim(), email: document.getElementById('client-email').value.trim(), telefone: document.getElementById('client-telefone').value.trim(), whatsapp: document.getElementById('client-whatsapp').value.trim(), documento: document.getElementById('client-documento').value.trim(), fotoUrl: document.getElementById('client-foto-url').value.trim(), tipoPreco: document.getElementById('client-tipo-preco').value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  try { if (id) await db.collection('clients').doc(id).set(payload, { merge: true }); else { payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection('clients').add(payload); } closeClientModal(); showToast('Cliente salvo com sucesso!', 'success'); } catch (error) { console.error('Erro ao salvar cliente:', error); showToast('Não foi possível salvar o cliente.', 'error'); }
}

function renderSavedQuotesSidebar() {
  const container = document.getElementById('saved-quotes-list');
  const count = document.getElementById('saved-quotes-count');
  const isPdv = typeof documentMode !== 'undefined' && documentMode === 'pdv';
  const allDocuments = window.quotesCache.filter(q => isPdv ? q.tipo === 'venda' : q.tipo !== 'venda');
  const search = normalizeSearchText(sidebarSearch || '');
  const documents = allDocuments.filter(q => {
    const date = q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : '';
    return !search || normalizeSearchText(`${q.numero || ''} ${date}`).includes(search);
  });
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize));
  sidebarPage = Math.min(Math.max(1, sidebarPage), totalPages);
  const visibleDocuments = documents.slice((sidebarPage - 1) * pageSize, sidebarPage * pageSize);
  if (count) count.textContent = allDocuments.length;
  if (!container) return;
  container.innerHTML = visibleDocuments.length ? visibleDocuments.map(q => `<div class="saved-quote-row"><button type="button" class="saved-quote" onclick="openSavedQuoteActions('${q.id}')"><strong>${escapeClientHtml(q.numero || q.id)}</strong><span>${escapeClientHtml(q.cliente?.nome || 'Cliente não informado')}</span><b>${formatCurrency(q.financeiro?.totalGeral)}</b><small>${q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : 'Data não informada'}</small></button><button type="button" class="quick-delete-document" onclick="quickDeleteDocument('${q.id}')" title="Excluir" aria-label="Excluir">×</button></div>`).join('') : `<p class="empty-state">Nenhuma ${isPdv ? 'venda' : 'orçamento'} encontrada.</p>`;
  const pagination = document.getElementById('saved-documents-pagination');
  const searchInput = document.getElementById('saved-documents-search');
  if (searchInput) { searchInput.value = sidebarSearch; searchInput.oninput = event => { sidebarSearch = event.target.value; sidebarPage = 1; renderSavedQuotesSidebar(); }; }
  if (pagination) pagination.innerHTML = totalPages > 1 ? `<button type="button" ${sidebarPage === 1 ? 'disabled' : ''} onclick="changeSavedDocumentsPage(-1)">‹</button><span>${sidebarPage} / ${totalPages}</span><button type="button" ${sidebarPage === totalPages ? 'disabled' : ''} onclick="changeSavedDocumentsPage(1)">›</button>` : '';
}

window.changeSavedDocumentsPage = delta => { sidebarPage += delta; renderSavedQuotesSidebar(); };
window.quickDeleteDocument = id => { const documentItem = (window.quotesCache || []).find(item => item.id === id); if (documentItem && typeof deleteSavedDocument === 'function') deleteSavedDocument(documentItem); };
