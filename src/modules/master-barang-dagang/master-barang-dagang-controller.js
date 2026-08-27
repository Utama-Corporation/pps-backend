const service = require("./master-barang-dagang-service");

async function getMasterBarangDagang(req, res) {
  try {
    const result = await service.getMasterBarangDagang();

    return res.status(200).json({
      success: true,
      message: `Found ${result.count} barang dagang`,
      totalRecords: result.count,
      data: result.data,
    });
  } catch (e) {
    console.error("[getMasterBarangDagang]", e);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: e.message,
    });
  }
}

module.exports = { getMasterBarangDagang };
