// Chave única de uma subcategoria dentro da sua categoria: ignora acentos,
// maiúsculas e espaços repetidos ("Analgésico" = " analgesico ").
function normalizeSubcategoryName(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSubcategoryKey(categoriaId, nome) {
  return `${Number(categoriaId) || 0}::${normalizeSubcategoryName(nome)}`;
}

module.exports = { normalizeSubcategoryName, normalizeSubcategoryKey };
