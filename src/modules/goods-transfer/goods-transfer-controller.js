const goodsTransferService = require("./goods-transfer-service");

const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  NOT_IN_TRANSIT: 404,
  WAREHOUSE_MISMATCH: 409,
  INVALID_STATUS: 409,
  NOT_FULFILLED: 409,
  PARTIAL_NOT_SUPPORTED: 409,
};

function _actorCtx(req) {
  return {
    actorId: req.idUsername,
    actorUsername: req.username,
    requestId: req.headers["x-request-id"] || undefined,
  };
}

function _sendServiceResult(res, result, okStatus = 200) {
  if (!result.success) {
    const status = ERROR_STATUS[result.code] || 400;
    return res.status(status).json(result);
  }
  return res.status(okStatus).json(result);
}

function _sendThrown(res, err, logLabel) {
  console.error(logLabel, err);
  const status = err.statusCode || err.status || 500;
  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? "Terjadi kesalahan server"
        : err.message || "Terjadi kesalahan",
    code: err.code,
  });
}

async function listAllHandler(req, res) {
  try {
    const result = await goodsTransferService.listAll({
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    return _sendThrown(res, err, "Error listing goods transfers:");
  }
}

async function listOutgoingHandler(req, res) {
  try {
    const idWarehouseAsal = parseInt(req.query.idWarehouse, 10);
    if (!idWarehouseAsal) {
      return res
        .status(400)
        .json({ success: false, message: "Parameter idWarehouse wajib diisi" });
    }
    const result = await goodsTransferService.listOutgoing({
      idWarehouseAsal,
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    return _sendThrown(res, err, "Error listing outgoing transfers:");
  }
}

async function listIncomingHandler(req, res) {
  try {
    const idWarehouseTujuan = parseInt(req.query.idWarehouse, 10);
    if (!idWarehouseTujuan) {
      return res
        .status(400)
        .json({ success: false, message: "Parameter idWarehouse wajib diisi" });
    }
    const result = await goodsTransferService.listIncoming({
      idWarehouseTujuan,
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    return _sendThrown(res, err, "Error listing incoming transfers:");
  }
}

async function detailHandler(req, res) {
  try {
    const result = await goodsTransferService.getDetail(req.params.noTransfer);
    return _sendServiceResult(res, result);
  } catch (err) {
    return _sendThrown(res, err, "Error fetching goods transfer detail:");
  }
}

async function scanHandler(req, res) {
  try {
    const result = await goodsTransferService.scanLabel(
      req.params.noTransfer,
      req.body?.noLabel,
      _actorCtx(req),
      { confirmPartial: req.body?.confirmPartial === true },
    );

    if (result.needsConfirmation) {
      return res.status(200).json({
        success: true,
        needsConfirmation: true,
        message: result.message,
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Label berhasil discan",
      data: result,
    });
  } catch (err) {
    return _sendThrown(res, err, "Error scanning goods transfer label:");
  }
}

async function undoScanHandler(req, res) {
  try {
    const result = await goodsTransferService.undoScan({
      idScan: req.params.idScan,
      ..._actorCtx(req),
    });
    return _sendServiceResult(res, result);
  } catch (err) {
    return _sendThrown(res, err, "Error undoing goods transfer scan:");
  }
}

async function kirimHandler(req, res) {
  try {
    const result = await goodsTransferService.markKirim({
      noTransfer: req.params.noTransfer,
      ..._actorCtx(req),
    });
    return _sendServiceResult(res, result);
  } catch (err) {
    return _sendThrown(res, err, "Error marking goods transfer kirim:");
  }
}

async function acceptScanHandler(req, res) {
  try {
    const result = await goodsTransferService.acceptScannedItem({
      labelCode: req.body?.labelCode,
      blokTujuan: req.body?.blokTujuan,
      idLokasiTujuan: req.body?.idLokasiTujuan,
      ..._actorCtx(req),
    });
    return _sendServiceResult(res, result);
  } catch (err) {
    return _sendThrown(res, err, "Error accepting scanned item:");
  }
}

module.exports = {
  listAllHandler,
  listOutgoingHandler,
  listIncomingHandler,
  detailHandler,
  scanHandler,
  undoScanHandler,
  kirimHandler,
  acceptScanHandler,
};
