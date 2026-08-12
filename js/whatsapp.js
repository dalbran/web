/**
 * Módulo de Integração e Formatação para WhatsApp
 */

async function sendOrcamentoWhatsApp() {
  if (!cart || cart.length === 0) {
    showToast("Adicione itens para enviar por WhatsApp.", "error");
    return;
  }

  if (typeof saveOrcamento === 'function' && !await saveOrcamento()) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  if (settings.compartilharWhatsAppAtivo === false) {
    showToast('O compartilhamento por WhatsApp está desativado nas configurações.', 'error');
    return;
  }
  const clienteNome = document.getElementById('orc-cliente-nome').value.trim() || 'Cliente';
  const clienteTelefone = document.getElementById('orc-cliente-telefone').value.replace(/\D/g, '');
  const vendedor = typeof getSelectedVendedor === 'function' ? getSelectedVendedor() : null;
  const totals = calculateTotals();

  const dataHoje = formatDateTime(new Date());
  const dataValidade = formatDateTime(addDaysToDate(new Date(), settings.prazoValidadeDias || 1));

  // Constrói Mensagem Formatada
  let text = `*${settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA'}*\n`;
  const isSale = typeof documentMode !== 'undefined' && documentMode === 'pdv';
  text += `*${isSale ? 'VENDA' : 'ORÇAMENTO'} Nº ${typeof getQuoteNumber === 'function' ? getQuoteNumber(isSale ? 'VEN' : 'ORC') : 'RASCUNHO'}*\n`;
  text += `${dataHoje.replace(' ', ' - ')}\n\n`;
  text += `👤 *Cliente:* ${clienteNome}\n`;
  text += `🧑‍💼 *Vendedor:* ${vendedor?.nome || settings.nomeFantasia || 'Não informado'}\n`;
  text += `📅 *Data:* ${dataHoje}\n`;
  text += `⏳ *Validade:* ${dataValidade}\n`;
  text += `-----------------------------------\n`;
  text += `📦 *ITENS ${isSale ? 'DA VENDA' : 'DO ORÇAMENTO'}:*\n\n`;

  cart.forEach((item, index) => {
    text += `${index + 1}. ${item.quantidade}x *${item.nome}* (${item.volume}) — *${formatCurrency(item.subtotal)}*\n`;
    if (item.fragrancia && item.fragrancia !== 'Padrão') text += `   Fragrância: ${item.fragrancia}\n`;
  });

  text += `-----------------------------------\n`;
  text += `💵 Subtotal: ${formatCurrency(totals.subtotal)}\n`;
  text += `🏷️ Desconto: -${formatCurrency(totals.desconto)}\n`;
  text += `💳 Taxa: +${formatCurrency(totals.valorTaxa)}\n`;
  text += `💰 *TOTAL GERAL: ${formatCurrency(totals.totalGeral)}*\n`;
  text += `💳 Forma de Pagamento: ${totals.formaPag.toUpperCase()}\n\n`;

  if (settings.avisoEstoque) {
    text += `⚠️ _${settings.avisoEstoque}_\n\n`;
  }

  text += `${settings.mensagemPadrao || 'Agradecemos a preferência!'}`;

  const encodedText = encodeURIComponent(text);

  // Se houver número do cliente, envia direto. Senão, abre compartilhamento geral.
  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (clienteTelefone && clienteTelefone.length >= 10) {
    const fullPhone = clienteTelefone.startsWith('55') ? clienteTelefone : `55${clienteTelefone}`;
    url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
  }

  // Copia texto para a área de transferência como backup
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Texto copiado para a área de transferência!", "info");
    });
  }

  window.open(url, '_blank');
}
