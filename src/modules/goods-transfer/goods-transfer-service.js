const { sql, poolPromise } = require("../../core/config/db");
const { assertNotLocked } = require("../../core/shared/tutup-transaksi-guard");
const { applyAuditContext } = require("../../core/utils/db-audit-context");
const { scanLabel } = require("./handlers/scan-label.handler");
const { CATEGORY_CONFIG } = require("./goods-transfer-category-registry");

// ────────────────────────────────────────────────────────────────────────────
// Model baru: dbo.GoodsTransfer_h + dbo.GoodsTransferItem_d di-INSERT oleh ERP
// Ascend langsung ke DB PPS dan diperlakukan READ-ONLY di sini. PPS hanya:
//   * menampilkan transfer + baris permintaan (_d),
//   * mencatat realisasi scan label ke dbo.GoodsTransferItemScan_d (scanLabel),
//   * memindahkan label fisik saat langkah terima (acceptScannedItem).
// PPS tidak pernah menulis GoodsTransfer_h / GoodsTransferItem_d.
// ────────────────────────────────────────────────────────────────────────────

function toIntOrNull(v) {
  return v === null || v === undefined || Number.isNaN(Number(v))
    ? null
    : Number(v);
}

function normBlok(v) {
  return (v ?? "").toString().trim().toUpperCase();
}

async function _resolveWarehouseForBlok(runner, blok) {
  const b = normBlok(blok);
  if (!b) return null;
  const res = await new sql.Request(runner)
    .input("Blok", sql.VarChar(100), b)
    .query(`SELECT TOP 1 IdWarehouse FROM dbo.MstBlok WHERE Blok = @Blok`);
  return toIntOrNull(res.recordset[0]?.IdWarehouse);
}

// SELECT list bersama untuk list header + status pemenuhan turunan.
// FulfillStatus (gabungan Status kolom + agregat scan):
//   OPEN     - belum ada scan, Status IN_TRANSIT
//   PARTIAL  - ada scan tapi belum semua baris terpenuhi
//   READY    - semua baris terpenuhi, belum ditekan "Kirim" (tombol Kirim tampil)
//   SHIPPED  - Status = 'SHIPPED' (sudah dikirim, menunggu penerimaan)
//   RECEIVED - Status = 'RECEIVED' (atau SHIPPED tapi semua scan sudah diterima)
//   CANCELLED / REJECTED - ikut Status apa adanya
const _HEADER_SELECT = `
  SELECT
    h.*,
    whAsal.NamaWarehouse   AS NamaWarehouseAsal,
    whTujuan.NamaWarehouse AS NamaWarehouseTujuan,
    uKirim.Username        AS UsernameKirim,
    uTerima.Username       AS UsernameTerima,
    agg.TotalLines,
    agg.CompletedLines,
    agg.ScanCount,
    agg.InTransitCount,
    CASE
      WHEN h.Status IN ('CANCELLED', 'REJECTED') THEN h.Status
      WHEN h.Status = 'RECEIVED' THEN 'RECEIVED'
      WHEN h.Status = 'SHIPPED' AND agg.ScanCount > 0 AND agg.InTransitCount = 0
           THEN 'RECEIVED'
      WHEN h.Status = 'SHIPPED' THEN 'SHIPPED'
      WHEN agg.ScanCount = 0 THEN 'OPEN'
      WHEN agg.TotalLines > 0 AND agg.CompletedLines >= agg.TotalLines THEN 'READY'
      ELSE 'PARTIAL'
    END AS FulfillStatus
  FROM dbo.GoodsTransfer_h h
  LEFT JOIN dbo.MstWarehouse whAsal   ON whAsal.IdWarehouse   = h.IdWarehouseAsal
  LEFT JOIN dbo.MstWarehouse whTujuan ON whTujuan.IdWarehouse = h.IdWarehouseTujuan
  LEFT JOIN dbo.MstUsername  uKirim   ON uKirim.IdUsername    = h.IdUsernameKirim
  LEFT JOIN dbo.MstUsername  uTerima  ON uTerima.IdUsername   = h.IdUsernameTerima
  OUTER APPLY (
    SELECT
      COUNT(1) AS TotalLines,
      ISNULL(SUM(CASE WHEN d.PcsScanned >= d.Pcs THEN 1 ELSE 0 END), 0) AS CompletedLines,
      (SELECT COUNT(1) FROM dbo.GoodsTransferItemScan_d s
        WHERE s.NoTransfer = h.NoTransfer) AS ScanCount,
      (SELECT COUNT(1) FROM dbo.GoodsTransferItemScan_d s
        WHERE s.NoTransfer = h.NoTransfer AND s.IsReceived = 0) AS InTransitCount
    FROM (
      SELECT d0.Pcs,
        ISNULL((
          SELECT SUM(s.Pcs) FROM dbo.GoodsTransferItemScan_d s
          WHERE s.NoTransfer = d0.NoTransfer AND s.KodeKategori = d0.KodeKategori
            AND s.IdJenis = d0.IdJenis
        ), 0) AS PcsScanned
      FROM dbo.GoodsTransferItem_d d0
      WHERE d0.NoTransfer = h.NoTransfer
    ) d
  ) agg
`;

async function _getHeaderRow(runner, noTransfer) {
  const res = await new sql.Request(runner)
    .input("NoTransfer", sql.VarChar(20), noTransfer)
    .query(`${_HEADER_SELECT} WHERE h.NoTransfer = @NoTransfer`);
  return res.recordset[0] || null;
}

/**
 * Detail 1 transfer: header + baris permintaan (_d, dari Ascend) + realisasi
 * scan. Bentuk mirip penjualan-service.getHeaderDetail.
 */
async function getDetail(noTransfer) {
  const pool = await poolPromise;
  const header = await _getHeaderRow(pool, noTransfer);
  if (!header) {
    return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
  }

  const linesRes = await pool
    .request()
    .input("NoTransfer", sql.VarChar(20), noTransfer).query(`
      SELECT
        d.KodeKategori,
        d.IdJenis,
        CASE
          WHEN d.KodeKategori = 'furniturewip' THEN mw.Nama
          WHEN d.KodeKategori = 'barangjadi'   THEN mbj.NamaBJ
          ELSE NULL
        END AS NamaJenis,
        d.Pcs AS PcsRequired,
        ISNULL((
          SELECT SUM(s.Pcs) FROM dbo.GoodsTransferItemScan_d s
          WHERE s.NoTransfer = d.NoTransfer AND s.KodeKategori = d.KodeKategori
            AND s.IdJenis = d.IdJenis
        ), 0) AS PcsScanned,
        d.DateTimeCreate
      FROM dbo.GoodsTransferItem_d d
      LEFT JOIN dbo.MstCabinetWIP mw
        ON d.KodeKategori = 'furniturewip' AND mw.IdCabinetWIP = d.IdJenis
      LEFT JOIN dbo.MstBarangJadi mbj
        ON d.KodeKategori = 'barangjadi' AND mbj.IdBJ = d.IdJenis
      WHERE d.NoTransfer = @NoTransfer
      ORDER BY d.KodeKategori, d.IdJenis
    `);

  const scansRes = await pool
    .request()
    .input("NoTransfer", sql.VarChar(20), noTransfer).query(`
      SELECT IdScan, KodeKategori, IdJenis, LabelCode, Pcs, IsReceived,
             BlokTujuan, IdLokasiTujuan, DateTimeScan, DateTimeTerima
      FROM dbo.GoodsTransferItemScan_d
      WHERE NoTransfer = @NoTransfer
      ORDER BY DateTimeScan ASC, IdScan ASC
    `);

  const scans = scansRes.recordset || [];
  const lines = (linesRes.recordset || []).map((r) => ({
    kodeKategori: r.KodeKategori,
    idJenis: r.IdJenis,
    namaJenis: r.NamaJenis,
    pcsRequired: r.PcsRequired,
    pcsScanned: r.PcsScanned,
    isComplete: r.PcsScanned >= r.PcsRequired,
    dateTimeCreate: r.DateTimeCreate,
    scans: scans.filter(
      (s) => s.KodeKategori === r.KodeKategori && s.IdJenis === r.IdJenis,
    ),
  }));

  return { success: true, data: { header, lines, scans } };
}

async function _listByWhere(where, bindings, { page = 1, limit = 50 }) {
  const pool = await poolPromise;
  const offset = (Math.max(page, 1) - 1) * Math.max(limit, 1);
  const req = pool.request();
  for (const [name, type, value] of bindings) req.input(name, type, value);
  req.input("Offset", sql.Int, offset).input("Limit", sql.Int, limit);
  const res = await req.query(`
    ${_HEADER_SELECT}
    ${where}
    ORDER BY h.DateTimeKirim DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);
  return { success: true, data: res.recordset };
}

async function listAll({ status, page = 1, limit = 50 }) {
  const where = status ? "WHERE h.Status = @Status" : "";
  const bindings = status ? [["Status", sql.VarChar(20), status]] : [];
  return _listByWhere(where, bindings, { page, limit });
}

async function listOutgoing({ idWarehouseAsal, status, page = 1, limit = 50 }) {
  let where = "WHERE h.IdWarehouseAsal = @IdWarehouseAsal";
  const bindings = [["IdWarehouseAsal", sql.Int, idWarehouseAsal]];
  if (status) {
    where += " AND h.Status = @Status";
    bindings.push(["Status", sql.VarChar(20), status]);
  }
  return _listByWhere(where, bindings, { page, limit });
}

async function listIncoming({ idWarehouseTujuan, status, page = 1, limit = 50 }) {
  let where = "WHERE h.IdWarehouseTujuan = @IdWarehouseTujuan";
  const bindings = [["IdWarehouseTujuan", sql.Int, idWarehouseTujuan]];
  if (status) {
    where += " AND h.Status = @Status";
    bindings.push(["Status", sql.VarChar(20), status]);
  }
  return _listByWhere(where, bindings, { page, limit });
}

/**
 * Tandai transfer "Kirim": syarat SEMUA baris permintaan _d sudah terpenuhi
 * (SUM scan pcs >= Pcs diminta). Efeknya Status IN_TRANSIT -> SHIPPED, dan
 * scan/undo dikunci. Header milik Ascend tapi Status ikut ditulis PPS.
 */
async function markKirim({ noTransfer, actorId, actorUsername, requestId }) {
  const no = String(noTransfer || "").trim();
  if (!no) {
    return { success: false, code: "VALIDATION_ERROR", message: "noTransfer wajib" };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(20), no)
      .query(`SELECT NoTransfer, Status FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @No`);
    const header = headerRes.recordset[0];
    if (!header) {
      await tx.rollback();
      return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
    }
    if (header.Status !== "IN_TRANSIT") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Transfer sudah berstatus ${header.Status}, tidak bisa dikirim lagi`,
      };
    }

    const chkRes = await new sql.Request(tx).input("No", sql.VarChar(20), no).query(`
      SELECT
        (SELECT COUNT(1) FROM dbo.GoodsTransferItem_d WHERE NoTransfer = @No) AS TotalLines,
        (SELECT COUNT(1) FROM dbo.GoodsTransferItem_d d
          WHERE d.NoTransfer = @No
            AND ISNULL((
              SELECT SUM(s.Pcs) FROM dbo.GoodsTransferItemScan_d s
              WHERE s.NoTransfer = d.NoTransfer AND s.KodeKategori = d.KodeKategori
                AND s.IdJenis = d.IdJenis
            ), 0) < d.Pcs) AS UnfilledLines
    `);
    const { TotalLines, UnfilledLines } = chkRes.recordset[0];
    if (Number(TotalLines) === 0 || Number(UnfilledLines) > 0) {
      await tx.rollback();
      return {
        success: false,
        code: "NOT_FULFILLED",
        message: "Masih ada permintaan yang belum terpenuhi — tidak bisa dikirim",
      };
    }

    await new sql.Request(tx).input("No", sql.VarChar(20), no).query(`
      UPDATE dbo.GoodsTransfer_h SET Status = 'SHIPPED', UpdatedAt = GETDATE()
      WHERE NoTransfer = @No AND Status = 'IN_TRANSIT'
    `);

    await tx.commit();
    return {
      success: true,
      code: "SHIPPED",
      message: `Transfer ${no} ditandai dikirim`,
      data: { noTransfer: no },
    };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Terima 1 label lewat scan (sisi tujuan / fitur In Transit): commit
 * perpindahan warehouse label fisik ke tujuan, tandai baris scan RECEIVED,
 * dan kalau ini scan IN_TRANSIT terakhir untuk transfer tsb, transfer selesai.
 *
 * Catatan (Open Question 3): hanya mendukung pemindahan SATU label utuh —
 * pcs baris scan harus mewakili seluruh sisa pcs label. Terima sebagian
 * (partial) belum didukung.
 */
async function acceptScannedItem({
  labelCode,
  blokTujuan,
  idLokasiTujuan,
  actorId,
  actorUsername,
  requestId,
}) {
  const code = String(labelCode || "").trim();
  const blok = normBlok(blokTujuan);
  const idLokasi = toIntOrNull(idLokasiTujuan);

  if (!code || !blok || idLokasi === null) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "labelCode, blokTujuan, dan idLokasiTujuan wajib diisi",
    };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    await assertNotLocked({
      date: new Date(),
      runner: tx,
      action: "menerima Goods Transfer",
      useLock: true,
    });

    const scanRes = await new sql.Request(tx)
      .input("LabelCode", sql.VarChar(50), code).query(`
        SELECT TOP 1 * FROM dbo.GoodsTransferItemScan_d WITH (UPDLOCK, HOLDLOCK)
        WHERE LabelCode = @LabelCode AND IsReceived = 0
        ORDER BY IdScan ASC
      `);
    const scan = scanRes.recordset[0];
    if (!scan) {
      await tx.rollback();
      return {
        success: false,
        code: "NOT_IN_TRANSIT",
        message: `Label ${code} tidak sedang dalam proses penerimaan Goods Transfer`,
      };
    }

    const headerRes = await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), scan.NoTransfer)
      .query(`SELECT * FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @NoTransfer`);
    const header = headerRes.recordset[0];
    if (!header) {
      await tx.rollback();
      return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
    }
    if (header.Status !== "SHIPPED") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message:
          header.Status === "RECEIVED"
            ? `Transfer ${scan.NoTransfer} sudah selesai diterima`
            : `Transfer ${scan.NoTransfer} belum ditandai "Kirim"`,
      };
    }

    const blokWarehouse = await _resolveWarehouseForBlok(tx, blok);
    if (blokWarehouse === null || blokWarehouse !== header.IdWarehouseTujuan) {
      await tx.rollback();
      return {
        success: false,
        code: "WAREHOUSE_MISMATCH",
        message: `Blok ${blok} bukan milik warehouse tujuan transfer ${scan.NoTransfer}`,
      };
    }

    const cfg = CATEGORY_CONFIG[scan.KodeKategori];
    if (!cfg) {
      await tx.rollback();
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: `Kategori ${scan.KodeKategori} tidak dikenali`,
      };
    }

    const parentRes = await new sql.Request(tx)
      .input("NoLabel", sql.VarChar(50), code).query(`
        SELECT Pcs AS ParentPcs
        FROM dbo.${cfg.parentTable} WITH (UPDLOCK, HOLDLOCK)
        WHERE ${cfg.parentColumn} = @NoLabel AND DateUsage IS NULL
      `);
    const parent = parentRes.recordset[0];
    if (!parent) {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Label ${code} sudah tidak tersedia di gudang asal`,
      };
    }

    const partialRes = await new sql.Request(tx)
      .input("NoLabel", sql.VarChar(50), code).query(`
        SELECT ISNULL(SUM(Pcs), 0) AS PartialPcs
        FROM dbo.${cfg.partialTable}
        WHERE ${cfg.partialParentColumn} = @NoLabel
      `);
    const availablePcs = Math.max(
      Math.round(
        Number(parent.ParentPcs || 0) -
          Number(partialRes.recordset[0]?.PartialPcs || 0),
      ),
      0,
    );

    if (Number(scan.Pcs) < availablePcs) {
      await tx.rollback();
      return {
        success: false,
        code: "PARTIAL_NOT_SUPPORTED",
        message:
          `Label ${code} berisi ${availablePcs} pcs tetapi baris scan hanya ${scan.Pcs} pcs. ` +
          `Terima sebagian (partial) belum didukung — scan harus mewakili seluruh label.`,
      };
    }

    // Pindahkan label fisik ke warehouse/blok/lokasi tujuan.
    await new sql.Request(tx)
      .input("Blok", sql.VarChar(50), blok)
      .input("IdLokasi", sql.Int, idLokasi)
      .input("IdWarehouse", sql.Int, header.IdWarehouseTujuan)
      .input("NoLabel", sql.VarChar(50), code).query(`
        UPDATE dbo.${cfg.parentTable}
        SET Blok = @Blok, IdLokasi = @IdLokasi, IdWarehouse = @IdWarehouse
        WHERE ${cfg.parentColumn} = @NoLabel
      `);

    await new sql.Request(tx)
      .input("IdScan", sql.Int, scan.IdScan)
      .input("BlokTujuan", sql.VarChar(50), blok)
      .input("IdLokasiTujuan", sql.Int, idLokasi)
      .input("IdUsernameTerima", sql.Int, actorId).query(`
        UPDATE dbo.GoodsTransferItemScan_d
        SET IsReceived = 1, BlokTujuan = @BlokTujuan, IdLokasiTujuan = @IdLokasiTujuan,
            IdUsernameTerima = @IdUsernameTerima,
            DateTimeTerima = SYSUTCDATETIME(), UpdatedAt = GETDATE()
        WHERE IdScan = @IdScan
      `);

    const remainingRes = await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), scan.NoTransfer).query(`
        SELECT COUNT(1) AS Remaining FROM dbo.GoodsTransferItemScan_d
        WHERE NoTransfer = @NoTransfer AND IsReceived = 0
      `);
    const remaining = Number(remainingRes.recordset[0]?.Remaining || 0);

    // Semua label diterima -> tandai header RECEIVED.
    if (remaining === 0) {
      await new sql.Request(tx)
        .input("NoTransfer", sql.VarChar(20), scan.NoTransfer)
        .input("IdUsernameTerima", sql.Int, actorId).query(`
          UPDATE dbo.GoodsTransfer_h
          SET Status = 'RECEIVED', IdUsernameTerima = @IdUsernameTerima,
              DateTimeTerima = GETDATE(), TanggalTerima = CONVERT(date, GETDATE()),
              UpdatedAt = GETDATE()
          WHERE NoTransfer = @NoTransfer AND Status = 'SHIPPED'
        `);
    }

    await tx.commit();

    return {
      success: true,
      code: "RECEIVED",
      message: `Label ${code} berhasil diterima`,
      data: {
        labelCode: code,
        noTransfer: scan.NoTransfer,
        kodeKategori: scan.KodeKategori,
        remainingItems: remaining,
        transferCompleted: remaining === 0,
      },
    };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Batalkan 1 baris scan yang belum diterima penerima (IsReceived = 0) —
 * menghapus barisnya sehingga pcs kembali tersedia untuk label tsb.
 */
async function undoScan({ idScan, actorId, actorUsername, requestId }) {
  const id = toIntOrNull(idScan);
  if (id === null) {
    return { success: false, code: "VALIDATION_ERROR", message: "idScan tidak valid" };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    // Hanya boleh undo kalau transfer masih IN_TRANSIT (belum ditekan "Kirim").
    const res = await new sql.Request(tx)
      .input("IdScan", sql.Int, id).query(`
        DELETE s
        FROM dbo.GoodsTransferItemScan_d s
        INNER JOIN dbo.GoodsTransfer_h h ON h.NoTransfer = s.NoTransfer
        WHERE s.IdScan = @IdScan AND s.IsReceived = 0
          AND h.Status = 'IN_TRANSIT'
      `);

    if (!res.rowsAffected?.[0]) {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message:
          "Baris scan tidak bisa dibatalkan (sudah diterima atau transfer sudah dikirim)",
      };
    }

    await tx.commit();
    return { success: true, code: "DELETED", message: "Scan dibatalkan" };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

module.exports = {
  getDetail,
  listAll,
  listOutgoing,
  listIncoming,
  scanLabel,
  markKirim,
  acceptScannedItem,
  undoScan,
};
