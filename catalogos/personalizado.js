let allProducts = [];
let filteredProducts = [];
let currentCategory = 'todos';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

document.addEventListener('DOMContentLoaded', () => {
    initCustomCatalog();
});

function initCustomCatalog() {
    allProducts = parseCatalogUrl();
    if (!allProducts.length) {
        showEmptyState('Nenhum produto selecionado ou link de catálogo inválido.');
        return;
    }

    renderCategoryFilters();
    filterProducts();
}

function parseCatalogUrl() {
    try {
        const rawHash = decodeURIComponent(location.hash.slice(1)).trim();
        if (!rawHash) return [];

        // Formato compacto: p=2L:1,2,3;5L:4,5 ou 2L:1,2;5L:4
        const compactMatch = rawHash.startsWith('p=') ? rawHash.slice(2) : (rawHash.includes(':') ? rawHash : null);

        if (compactMatch && window.DalbranCatalogData) {
            const items = [];
            const parts = compactMatch.split(';');

            parts.forEach(part => {
                const [source, idsStr] = part.split(':');
                if (source && idsStr && window.DalbranCatalogData[source]) {
                    const ids = idsStr.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                    const sourceProducts = window.DalbranCatalogData[source];

                    ids.forEach(id => {
                        const product = sourceProducts.find(p => p.id === id);
                        if (product) {
                            // Ajusta o caminho da imagem relativo à pasta catalogos/
                            const imagePath = product.image.startsWith('http') || product.image.startsWith('data:')
                                ? product.image
                                : (source === '2L' && !product.image.startsWith('2L/') ? `2L/${product.image}` : (source === '5L' && !product.image.startsWith('5L/') ? `5L/${product.image}` : product.image));

                            items.push({
                                ...product,
                                uid: `${source}_${product.id}`,
                                source,
                                displayImage: imagePath
                            });
                        }
                    });
                }
            });

            if (items.length) return items;
        }

        // Suporte legado: Base64 do JSON original
        const decodedJson = JSON.parse(decodeURIComponent(escape(atob(rawHash))));
        if (Array.isArray(decodedJson) && decodedJson.length) {
            return decodedJson.map((item, idx) => ({
                id: idx + 1,
                uid: `legacy_${idx + 1}`,
                title: item.t || 'Produto',
                category: catalogCategorySlug(item.c || 'geral'),
                categoryName: item.c || 'Geral',
                desc: item.d || '',
                volume: item.v || '',
                displayImage: item.i || '',
                fragrances: item.f || []
            }));
        }

    } catch (error) {
        console.error('Erro ao decodificar catálogo personalizado:', error);
    }
    return [];
}

function catalogCategorySlug(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;

    // Identifica as categorias presentes na seleção
    const categoriesMap = new Map();
    allProducts.forEach(p => {
        const slug = p.category || catalogCategorySlug(p.categoryName);
        if (!categoriesMap.has(slug)) {
            categoriesMap.set(slug, p.categoryName || 'Outros');
        }
    });

    let html = `
        <button class="filter-btn active" onclick="filterCategory('todos')">
            <i class="fa-solid fa-border-all"></i> Todos (${allProducts.length})
        </button>
    `;

    categoriesMap.forEach((name, slug) => {
        html += `
            <button class="filter-btn" data-category="${slug}" onclick="filterCategory('${slug}')">
                <i class="fa-solid fa-tag"></i> ${escapeHtml(name)}
            </button>
        `;
    });

    container.innerHTML = html;
}

function filterCategory(categorySlug) {
    currentCategory = categorySlug;

    // Atualiza botões ativos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (categorySlug === 'todos' && btn.textContent.includes('Todos')) {
            btn.classList.add('active');
        } else if (btn.getAttribute('data-category') === categorySlug) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    filterProducts();
}

function filterProducts() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';

    filteredProducts = allProducts.filter(product => {
        const prodCategorySlug = product.category || catalogCategorySlug(product.categoryName);
        const matchesCategory = (currentCategory === 'todos' || prodCategorySlug === currentCategory);

        const searchTarget = `${product.title} ${product.categoryName} ${product.desc} ${product.volume} ${(product.fragrances || []).join(' ')}`.toLowerCase();
        const matchesSearch = !searchTerm || searchTarget.includes(searchTerm);

        return matchesCategory && matchesSearch;
    });

    renderGrid(filteredProducts);
}

function renderGrid(productsList) {
    const grid = document.getElementById('productGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;

    if (!productsList.length) {
        grid.innerHTML = '';
        noResults?.classList.remove('hidden');
        return;
    }

    noResults?.classList.add('hidden');
    grid.innerHTML = productsList.map(product => `
        <article class="product-card">
            <div class="card-image-box">
                <span class="sector-tag">${escapeHtml(product.categoryName || 'Dalbran')}</span>
                <img src="${encodeURI(product.displayImage)}" alt="${escapeHtml(product.title)}" loading="lazy">
            </div>
            <div class="card-content">
                <h3 class="product-title">${escapeHtml(product.title)}</h3>
                <p class="product-desc">${escapeHtml(product.desc)}</p>
                <div class="fragrance-pills">
                    ${(product.fragrances || []).map(f => `<span class="fragrance-badge">${escapeHtml(f)}</span>`).join('')}
                </div>
                <button type="button" class="btn-card-details" onclick="openModal('${product.uid}')">Ver detalhes</button>
            </div>
        </article>
    `).join('');
}

function showEmptyState(msg) {
    const grid = document.getElementById('productGrid');
    const categorySection = document.getElementById('categorySection');
    if (categorySection) categorySection.style.display = 'none';
    if (grid) {
        grid.innerHTML = `<div class="no-results"><i class="fa-solid fa-circle-exclamation"></i><h3>Catálogo Indisponível</h3><p>${escapeHtml(msg)}</p></div>`;
    }
}

// MODAL DE DETALHES
function openModal(uid) {
    const product = allProducts.find(p => p.uid === uid);
    if (!product) return;

    document.getElementById('modalImage').src = product.displayImage;
    document.getElementById('modalCategory').textContent = product.categoryName;
    document.getElementById('modalTitle').textContent = product.title;
    document.getElementById('modalDesc').textContent = product.desc;
    document.getElementById('modalVolume').textContent = product.volume || 'Consulte';

    const fragranceList = document.getElementById('fragranceList');
    fragranceList.innerHTML = (product.fragrances || []).map(f => `<span class="fragrance-item"><i class="fa-solid fa-check"></i> ${escapeHtml(f)}</span>`).join('');

    const message = encodeURIComponent(`Olá! Vi no catálogo personalizado e gostaria de solicitar um orçamento para: ${product.title}`);
    document.getElementById('modalWhatsappBtn').href = `https://wa.me/5521998852318?text=${message}`;

    document.getElementById('productModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('productModal').classList.add('hidden');
}

document.getElementById('productModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') {
        closeModal();
    }
});

// FUNÇÕES DE IMPRESSÃO E EXPORTAÇÃO
function printCatalog() {
    window.print();
}

function exportAsImage() {
    const element = document.getElementById('catalogContent');
    const btn = event.currentTarget;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando imagem...';

    if (window.html2canvas) {
        html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'catalogo-personalizado-dalbran.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            btn.innerHTML = originalBtnText;
        }).catch(err => {
            console.error('Erro ao gerar imagem:', err);
            alert('Ocorreu um erro ao gerar a imagem do catálogo.');
            btn.innerHTML = originalBtnText;
        });
    } else {
        alert('Biblioteca de geração de imagem carregando. Tente novamente.');
        btn.innerHTML = originalBtnText;
    }
}
