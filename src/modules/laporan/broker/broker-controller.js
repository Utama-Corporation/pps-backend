// src/modules/laporan/broker/broker-controller.js
const brokerService = require("./broker-service");

async function stokBrokerQcPdfHandler(req, res) {
  const tglAkhir = String(req.query.tglAkhir || "").trim();

  console.log(
    "Generating Laporan Stok Broker QC PDF | Username:",
    req.username,
    "| tglAkhir:",
    tglAkhir,
  );

  try {
    const pdfBuffer = await brokerService.getStokBrokerQcPdf({ tglAkhir });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Laporan-Stok-Broker-QC-${tglAkhir}.pdf"`,
    );
    return res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error generating Laporan Stok Broker QC PDF:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
}

module.exports = {
  stokBrokerQcPdfHandler,
};