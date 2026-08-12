/** Catálogos locais e gerador de seleções compartilháveis. */
window.catalogSourceProducts = {};
window.customCatalogSelection = [];

document.addEventListener('DOMContentLoaded', () => {
  loadCatalogSources().finally(renderCatalogosView);
});

async function loadCatalogSources() {
  if (window.DalbranCatalogData) {
    Object.entries(window.DalbranCatalogData).forEach(([key, products]) => {
      window.catalogSourceProducts[key] = (products || []).map(product => ({ ...product, source: key }));
    });
    return;
  }
  const sources = [{ key: '2L', script: 'catalogos/2L/script.js' }, { key: '5L', script: 'catalogos/5L/script.js' }];
  await Promise.all(sources.map(async source => {
    try {
      const response = await fetch(source.script);
      const text = await response.text();
      const match = text.match(/const\s+products\s*=\s*(\[[\s\S]*?\n\]);\s*\n\s*let\s+currentCategory/);
      if (!match) throw new Error('Lista de produtos não encontrada');
      const products = Function(`return (${match[1]});`)();
      window.catalogSourceProducts[source.key] = products.map(product => ({ ...product, source: source.key }));
    } catch (error) { console.error(`Erro ao carregar catálogo ${source.key}:`, error); window.catalogSourceProducts[source.key] = []; }
  }));
}

function renderCatalogosView() {
  const container = document.getElementById('view-catalogos');
  if (!container) return;
  container.innerHTML = `
    <div class="view-header catalog-header"><div><h2>Catálogos visuais</h2><p>Abra os catálogos completos ou monte uma seleção para compartilhar.</p></div></div>
    <div class="catalog-shortcuts">
      ${catalogShortcut('2L', 'Catálogo 2 litros', 'Linha de produtos 2 L e embalagens menores.')}
      ${catalogShortcut('5L', 'Catálogo 5 litros', 'Linha institucional e galões de 5 L.')}
    </div>
    <section class="custom-catalog-builder"><div class="dashboard-section-header"><div><h3>Catálogo personalizado</h3><span>Escolha os itens abaixo e gere o link visual para o cliente.</span></div><span id="custom-catalog-count">0 selecionados</span></div><div class="catalog-builder-toolbar"><select id="custom-catalog-source"><option value="all">2 L e 5 L</option><option value="2L">Somente 2 L</option><option value="5L">Somente 5 L</option></select><input id="custom-catalog-search" type="search" placeholder="Buscar produto"></div><div id="custom-catalog-products" class="custom-catalog-products"></div><div class="custom-catalog-actions"><button type="button" class="btn btn-outline" id="clear-custom-catalog">Limpar seleção</button><button type="button" class="btn btn-primary" id="generate-custom-catalog">Gerar link do catálogo</button></div><div id="custom-catalog-link" class="custom-catalog-link hidden"></div><p class="catalog-share-note">O link funciona para qualquer pessoa quando o sistema estiver hospedado em uma URL pública. Localmente, ele abre no mesmo dispositivo/rede onde o sistema estiver disponível.</p></section>`;
  ['2L', '5L'].forEach(size => { document.getElementById(`open-catalog-${size}`).onclick = () => window.open(`catalogos/${size}/index.html`, '_blank', 'noopener'); document.getElementById(`share-catalog-${size}`).onclick = () => shareCatalogUrl(`catalogos/${size}/index.html`, `Catálogo Dalbran ${size}`); });
  document.getElementById('custom-catalog-search').oninput = renderCustomCatalogProducts;
  document.getElementById('custom-catalog-source').onchange = renderCustomCatalogProducts;
  document.getElementById('clear-custom-catalog').onclick = () => { window.customCatalogSelection = []; renderCustomCatalogProducts(); document.getElementById('custom-catalog-link').classList.add('hidden'); };
  document.getElementById('generate-custom-catalog').onclick = generateCustomCatalogLink;
  renderCustomCatalogProducts();
}

function catalogShortcut(size, title, description) { return `<article class="catalog-card"><div class="catalog-card-icon">${size}</div><div><h3>${title}</h3><p>${description}</p></div><div class="catalog-card-actions"><button type="button" class="btn btn-primary" id="open-catalog-${size}">Abrir catálogo</button><button type="button" class="btn btn-outline" id="share-catalog-${size}">Compartilhar</button></div></article>`; }
function getCatalogItems() { return Object.values(window.catalogSourceProducts).flat(); }
function renderCustomCatalogProducts() {
  const container = document.getElementById('custom-catalog-products'); if (!container) return;
  const source = document.getElementById('custom-catalog-source')?.value || 'all'; const search = catalogSearchText(document.getElementById('custom-catalog-search')?.value || '');
  const products = getCatalogItems().filter(product => (source === 'all' || product.source === source) && (!search || catalogSearchText(`${product.title} ${product.categoryName} ${product.volume} ${(product.fragrances || []).join(' ')}`).includes(search)));
  container.innerHTML = products.length ? products.map(product => { const key = `${product.source}:${product.id}`; const selected = window.customCatalogSelection.includes(key); return `<button type="button" class="custom-catalog-product ${selected ? 'selected' : ''}" onclick="toggleCustomCatalogProduct('${product.source}:${product.id}')"><img src="catalogos/${product.source}/${product.image}" alt=""><span><strong>${escapeCatalogHtml(product.title)}</strong><small>${product.source} · ${escapeCatalogHtml(product.volume)}</small></span><b>${selected ? '✓' : '+'}</b></button>`; }).join('') : '<p class="empty-state">Nenhum produto encontrado.</p>';
  document.getElementById('custom-catalog-count').textContent = `${window.customCatalogSelection.length} selecionado(s)`;
}
function catalogSearchText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
window.toggleCustomCatalogProduct = key => { const selected = window.customCatalogSelection; const index = selected.indexOf(key); if (index >= 0) selected.splice(index, 1); else selected.push(key); renderCustomCatalogProducts(); };
function generateCustomCatalogLink() {
  const selected = getCatalogItems().filter(product => window.customCatalogSelection.includes(`${product.source}:${product.id}`)); if (!selected.length) { showToast('Selecione ao menos um produto.', 'error'); return; }
  const data = selected.map(product => ({ t: product.title, c: product.categoryName, d: product.desc, v: product.volume, i: `catalogos/${product.source}/${product.image}`, f: product.fragrances }));
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
  const url = new URL(`catalogos/personalizado.html#${encoded}`, window.location.href).href;
  const output = document.getElementById('custom-catalog-link'); output.classList.remove('hidden'); output.innerHTML = `<input readonly value="${url}"><button type="button" class="btn btn-primary" id="copy-custom-link" title="Copiar link do catálogo"><span class="copy-pages-icon" aria-hidden="true"></span>Copiar link</button><button type="button" class="btn btn-outline" id="share-custom-link">Compartilhar catálogo</button>`;
  document.getElementById('copy-custom-link').onclick = () => navigator.clipboard.writeText(url).then(() => showToast('Link do catálogo copiado.', 'success'));
  document.getElementById('share-custom-link').onclick = () => navigator.share ? navigator.share({ title: 'Catálogo Dalbran', url }).catch(() => {}) : navigator.clipboard.writeText(url).then(() => showToast('Link copiado.', 'success'));
}
function shareCatalogUrl(relativeUrl, title) { const url = new URL(relativeUrl, window.location.href).href; if (navigator.share) navigator.share({ title, url }).catch(() => {}); else navigator.clipboard?.writeText(url).then(() => showToast('Link do catálogo copiado.', 'success')); }
function escapeCatalogHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[char]); }
