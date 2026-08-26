// src/modules/laporan/broker/broker-service.js
const puppeteer = require("puppeteer");
const { sql, poolPromise } = require("../../../core/config/db");
const { badReq } = require("../../../core/utils/http-error");

let brokerBrowserPromise;

async function getBrokerBrowser() {
  if (!brokerBrowserPromise) {
    brokerBrowserPromise = puppeteer.launch({
      headless: "shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return brokerBrowserPromise;
}

process.on("SIGINT", async () => {
  if (brokerBrowserPromise) {
    const b = await brokerBrowserPromise;
    await b.close();
    brokerBrowserPromise = null;
  }
});
process.on("SIGTERM", async () => {
  if (brokerBrowserPromise) {
    const b = await brokerBrowserPromise;
    await b.close();
    brokerBrowserPromise = null;
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateId(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ---------------------------------------------------------------------------
// DATA — Laporan Stok Broker dengan QC
// ---------------------------------------------------------------------------
async function getStokBrokerQcRows(tglAkhir) {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("TglAkhir", sql.Date, tglAkhir);

  const result = await request.query(`
    ;WITH BaseBroker AS (
      SELECT
        BH.DateCreate,
        MP.Jenis,
        BH.NoBroker,
        BD.NoSak,
        BD.Berat,
        BH.IdLokasi,
        BH.Blok,
        BH.Moisture, BH.Moisture2, BH.Moisture3,
        BH.Density, BH.Density2, BH.Density3,
        BH.MFI
      FROM Broker_h BH
      INNER JOIN Broker_d BD ON BD.NoBroker = BH.NoBroker
      LEFT JOIN MstJenisPlastik MP ON MP.IdJenisPlastik = BH.IdJenisPlastik
      LEFT JOIN MstBlok MB ON MB.Blok = BH.Blok
      LEFT JOIN MstWarehouse MW ON MW.IdWarehouse = MB.IdWarehouse
      WHERE BH.DateCreate <= @TglAkhir
        AND (BD.DateUsage IS NULL OR BD.DateUsage > @TglAkhir)
    ),
    PartialUsed AS (
      SELECT
        BP.NoBroker,
        BP.NoSak,
        SUM(ISNULL(BP.Berat, 0)) AS BeratPartial
      FROM BrokerPartial BP
      INNER JOIN MixerProduksiInputBrokerPartial MIBP
        ON MIBP.NoBrokerPartial = BP.NoBrokerPartial
      INNER JOIN MixerProduksi_h MPH ON MPH.NoProduksi = MIBP.NoProduksi
      WHERE MPH.TglProduksi < @TglAkhir
      GROUP BY BP.NoBroker, BP.NoSak
    )
    SELECT
      BB.DateCreate,
      BB.Jenis,
      BB.NoBroker,
      COUNT(BB.NoSak) AS JmlhSak,
      SUM(ISNULL(BB.Berat, 0) - ISNULL(PU.BeratPartial, 0)) AS Berat,
      BB.Moisture, BB.Moisture2, BB.Moisture3,
      BB.Density, BB.Density2, BB.Density3,
      BB.MFI
    FROM BaseBroker BB
    LEFT JOIN PartialUsed PU
      ON PU.NoBroker = BB.NoBroker AND PU.NoSak = BB.NoSak
    GROUP BY
      BB.DateCreate, BB.Jenis, BB.NoBroker,
      BB.Moisture, BB.Moisture2, BB.Moisture3,
      BB.Density, BB.Density2, BB.Density3, BB.MFI
    ORDER BY BB.DateCreate, BB.Jenis, BB.NoBroker
  `);

  return result.recordset || [];
}

// ---------------------------------------------------------------------------
// TEMPLATE HTML
// ---------------------------------------------------------------------------
function buildStokBrokerQcHtml({ tglAkhir, rows }) {
  const totalSak = rows.reduce((s, r) => s + Number(r.JmlhSak || 0), 0);
  const totalBerat = rows.reduce((s, r) => s + Number(r.Berat || 0), 0);

  const bodyRows = rows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.NoBroker ?? "-")}</td>
          <td class="center">${escapeHtml(formatDateId(r.DateCreate))}</td>
          <td>${escapeHtml(r.Jenis ?? "-")}</td>
          <td class="right">${formatNumber(r.JmlhSak, 0)}</td>
          <td class="right">${formatNumber(r.Berat)}</td>
          <td class="right">${escapeHtml(r.Moisture ?? "-")}</td>
          <td class="right">${escapeHtml(r.Moisture2 ?? "-")}</td>
          <td class="right">${escapeHtml(r.Moisture3 ?? "-")}</td>
          <td class="right">${escapeHtml(r.Density ?? "-")}</td>
          <td class="right">${escapeHtml(r.Density2 ?? "-")}</td>
          <td class="right">${escapeHtml(r.Density3 ?? "-")}</td>
          <td class="right">${escapeHtml(r.MFI ?? "-")}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 9px;
    color: #1e293b;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #1e40af;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .report-title { font-size: 16px; font-weight: 700; color: #1e40af; }
  .report-subtitle { font-size: 10px; color: #64748b; margin-top: 2px; }
  .report-meta { text-align: right; font-size: 9px; color: #475569; }
  table.data {
    width: 100%;
    border-collapse: collapse;
  }
  table.data th {
    background: #1e40af;
    color: #fff;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 5px 6px;
    border: 1px solid #1e3a8a;
  }
  table.data td {
    padding: 4px 6px;
    border: 1px solid #e2e8f0;
  }
  table.data tr:nth-child(even) td { background: #f8fafc; }
  .center { text-align: center; }
  .right { text-align: right; }
  tfoot td {
    background: #eef2ff !important;
    font-weight: 700;
    border-top: 2px solid #1e40af;
  }
  .summary-strip {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }
  .summary-card {
    flex: 1;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .summary-label { font-size: 8px; color: #64748b; text-transform: uppercase; }
  .summary-value { font-size: 14px; font-weight: 700; color: #1e40af; }
</style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="report-title">Laporan Stok Broker dengan QC</div>
      <div class="report-subtitle">Posisi stok per tanggal: ${escapeHtml(formatDateId(tglAkhir))}</div>
    </div>
    <div class="report-meta">
      Dicetak: ${escapeHtml(new Date().toLocaleString("id-ID"))}
    </div>
  </div>

  <div class="summary-strip">
    <div class="summary-card">
      <div class="summary-label">Total Baris</div>
      <div class="summary-value">${rows.length}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Sak</div>
      <div class="summary-value">${formatNumber(totalSak, 0)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Berat (Kg)</div>
      <div class="summary-value">${formatNumber(totalBerat)}</div>
    </div>
  </div>

  <table class="data">
    <thead>
      <tr>
        <th>No. Broker</th>
        <th class="center">Tanggal</th>
        <th>Jenis</th>
        <th class="right">Jml Sak</th>
        <th class="right">Berat (Kg)</th>
        <th class="right">Moisture</th>
        <th class="right">Moisture 2</th>
        <th class="right">Moisture 3</th>
        <th class="right">Density</th>
        <th class="right">Density 2</th>
        <th class="right">Density 3</th>
        <th class="right">MFI</th>
      </tr>
    </thead>
    <tbody>${bodyRows || '<tr><td colspan="12" class="center">Tidak ada data.</td></tr>'}</tbody>
  </table>

  <table class="data total-table">
    <tfoot>
      <tr>
        <td colspan="3" class="center">TOTAL</td>
        <td class="right">${formatNumber(totalSak, 0)}</td>
        <td class="right">${formatNumber(totalBerat)}</td>
        <td colspan="7"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF — Laporan Stok Broker dengan QC (A4 landscape)
// ---------------------------------------------------------------------------
async function getStokBrokerQcPdf({ tglAkhir }) {
  if (!tglAkhir) throw badReq("Parameter tanggal wajib diisi.");

  const rows = await getStokBrokerQcRows(tglAkhir);
  const html = buildStokBrokerQcHtml({ tglAkhir, rows });

  const browser = await getBrokerBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1123, height: 794 });

  try {
    await page.goto("about:blank", { waitUntil: "domcontentloaded" });
    await page.evaluate((h) => {
      document.open();
      document.write(h);
      document.close();
    }, html);

    return await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%; font-size:8px; color:#94a3b8; text-align:center; font-family:'Segoe UI',Arial,sans-serif;">
          Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span>
        </div>`,
      margin: { top: "8mm", right: "8mm", bottom: "14mm", left: "8mm" },
    });
  } finally {
    await page.close();
  }
}

module.exports = {
  getStokBrokerQcRows,
  getStokBrokerQcPdf,
};