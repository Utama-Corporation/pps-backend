// Goods Transfer (model Ascend) hanya menerima 2 kategori label: Barang Jadi
// (prefix "BA.") dan Furniture WIP (prefix "BB."). Sama seperti Penjualan.

function normalizeLabelCode(labelCode) {
  return String(labelCode || "").trim();
}

function detectCategory(labelCode) {
  const code = normalizeLabelCode(labelCode);
  if (code.startsWith("BA.")) return "barangjadi";
  if (code.startsWith("BB.")) return "furniturewip";
  return null;
}

// Konfigurasi tabel fisik per kategori (dipakai handler scan & terima).
const CATEGORY_CONFIG = {
  barangjadi: {
    parentTable: "BarangJadi",
    parentColumn: "NoBJ",
    jenisColumn: "IdBJ",
    partialTable: "BarangJadiPartial",
    partialParentColumn: "NoBJ",
    partialColumn: "NoBJPartial",
    partialPrefix: "BL.",
    masterTable: "MstBarangJadi",
    masterKeyColumn: "IdBJ",
    masterNameColumn: "NamaBJ",
  },
  furniturewip: {
    parentTable: "FurnitureWIP",
    parentColumn: "NoFurnitureWIP",
    jenisColumn: "IDFurnitureWIP",
    partialTable: "FurnitureWIPPartial",
    partialParentColumn: "NoFurnitureWIP",
    partialColumn: "NoFurnitureWIPPartial",
    partialPrefix: "BC.",
    masterTable: "MstCabinetWIP",
    masterKeyColumn: "IdCabinetWIP",
    masterNameColumn: "Nama",
  },
};

module.exports = {
  detectCategory,
  normalizeLabelCode,
  CATEGORY_CONFIG,
};
