const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "barang-dagang-label-pdf.html");

function buildBarangDagangLabelHtml(data) {
  const templateHtml = fs.readFileSync(templatePath, "utf8");
  return templateHtml
    .replace(/{{noLabel}}/g, data.noLabel || "-")
    .replace("{{namaProduk}}", data.namaProduk || "-")
    .replace("{{kode}}", data.kode || "-")
    .replace("{{tanggal}}", data.tanggal || "-")
    .replace("{{createBy}}", data.createBy || "-")
    .replace("{{qrBase64}}", data.qrBase64 || "")
    .replace("{{watermarkText}}", data.watermarkText || "");
}

module.exports = { buildBarangDagangLabelHtml };
