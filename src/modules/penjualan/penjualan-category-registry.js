function normalizeLabelCode(labelCode) {
  return String(labelCode || "").trim();
}

// Penjualan hanya menerima 2 kategori: furniturewip & barangjadi
function detectCategory(labelCode) {
  const code = normalizeLabelCode(labelCode);
  if (code.startsWith("BA.")) return "barangjadi";
  if (code.startsWith("BB.")) return "furniturewip";
  return null;
}

module.exports = {
  detectCategory,
  normalizeLabelCode,
};
