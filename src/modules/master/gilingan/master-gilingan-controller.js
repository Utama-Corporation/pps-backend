const service = require("./master-gilingan-service");

async function getAllActive(req, res) {
  const { username } = req;
  console.log("Fetching master gilingan (active only) | Username:", username);

  try {
    const data = await service.getAllActive();
    return res.status(200).json({
      success: true,
      message: "Data master gilingan (active) berhasil diambil",
      totalData: data.length,
      data,
    });
  } catch (error) {
    console.error("Error fetching master gilingan (active):", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

async function getStokProses(req, res) {
  try {
    const data = await service.getStokProses();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get Stok Gilingan Proses Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
}

async function getLabelByIdGilingan(req, res) {
  try {
    const idGilingan = parseInt(req.params.idgilingan, 10);

    if (!Number.isFinite(idGilingan)) {
      return res.status(400).json({
        success: false,
        message: "idgilingan wajib berupa angka",
      });
    }

    const data = await service.getLabelByIdGilingan(idGilingan);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get Label Gilingan By IdGilingan Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
}

module.exports = { getAllActive, getStokProses, getLabelByIdGilingan };
