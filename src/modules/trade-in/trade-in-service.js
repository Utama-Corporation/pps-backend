const { sql, poolPromise } = require("../../core/config/db");
const {
  generateNextCode,
} = require("../../core/utils/sequence-code-helper");
const { badReq, notFound } = require("../../core/utils/http-error");
const { formatDate } = require("../../core/utils/date-helper");

// =========================
// LIST PENERIMAAN
// =========================
async function getList(filter) {
  const pool = await poolPromise;
  let query = `
    SELECT h.NoPenerimaan,
           h.Tanggal,
           h.Supplier,
           h.SalesPersonCode,
           ISNULL(sp.SalesPersonName, '') AS SalesPersonName
      FROM dbo.PenerimaanTradeIn_h h
      LEFT JOIN dbo.MstSalesPerson sp
        ON sp.SalesPersonCode = h.SalesPersonCode
     WHERE 1 = 1`;

  const request = pool.request();
  if (filter && String(filter).trim() !== "") {
    query += `
       AND (
         h.NoPenerimaan LIKE @Filter
         OR h.Supplier LIKE @Filter
         OR sp.SalesPersonName LIKE @Filter
       )`;
    request.input("Filter", sql.VarChar(100), `%${String(filter).trim()}%`);
  }

  query += ` ORDER BY h.NoPenerimaan DESC`;

  const result = await request.query(query);
  return result.recordset.map((r) => ({
    NoPenerimaan: r.NoPenerimaan,
    Tanggal: r.Tanggal ? formatDate(r.Tanggal) : "-",
    Supplier: r.Supplier || "",
    SalesPersonCode: r.SalesPersonCode || "",
    SalesPersonName: r.SalesPersonName || "",
  }));
}

// =========================
// PREVIEW NoPenerimaan berikutnya (AC.xxxxx)
// =========================
async function getNextNo() {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const noPenerimaan = await generateNextCode(tx, {
      tableName: "dbo.PenerimaanTradeIn_h",
      columnName: "NoPenerimaan",
      prefix: "AC.",
      width: 5,
    });
    await tx.rollback();
    return noPenerimaan;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// =========================
// MASTER SALES PERSON
// =========================
async function getSalesPersons() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT SalesPersonCode, SalesPersonName
      FROM dbo.MstSalesPerson
     WHERE ISNULL(Enable, 1) = 1
     ORDER BY SalesPersonName`);
  return result.recordset;
}

// =========================
// MASTER JENIS REJECT
// =========================
async function getJenisReject() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT IdReject, NamaReject
      FROM dbo.MstReject
     WHERE ISNULL(Enable, 1) = 1
     ORDER BY NamaReject`);
  return result.recordset;
}

// =========================
// DETAIL (header + jenis + reject)
// =========================
async function getDetail(noPenerimaan) {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan));

  const headerResult = await request.query(`
    SELECT NoPenerimaan,
           CONVERT(varchar(10), Tanggal, 23) AS Tanggal,
           Supplier,
           SalesPersonCode
      FROM dbo.PenerimaanTradeIn_h
     WHERE NoPenerimaan = @NoPenerimaan`);

  if (!headerResult.recordset.length) {
    return null;
  }
  const header = headerResult.recordset[0];

  const jenisResult = await request.query(`
    SELECT Jenis
      FROM dbo.PenerimaanTradeInInput
     WHERE NoPenerimaan = @NoPenerimaan`);

  const rejectResult = await request.query(`
    SELECT o.NoReject, v.IdReject, r.NamaReject, v.Berat
      FROM dbo.PenerimaanTradeInOutputRejectV2 o
      INNER JOIN dbo.RejectV2 v ON v.NoReject = o.NoReject
      LEFT JOIN dbo.MstReject r ON r.IdReject = v.IdReject
     WHERE o.NoPenerimaan = @NoPenerimaan`);

  const rejects = rejectResult.recordset;

  return {
    noPenerimaan: header.NoPenerimaan,
    tanggal: header.Tanggal || "",
    supplier: header.Supplier || "",
    salesPersonCode: header.SalesPersonCode || "",
    jenis: jenisResult.recordset.length
      ? jenisResult.recordset[0].Jenis
      : "",
    reject: rejects.length ? rejects[0] : null,
  };
}

// Mengubah angka yang dikirim sebagai 5,25 atau 5.25 menjadi Number 5.25.
// Format ribuan umum seperti 1.234,56 dan 1,234.56 juga diterima.
function parseFlexibleNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  let text = String(value ?? "").trim().replace(/\s+/g, "");
  if (!text) return NaN;

  const commaIndex = text.lastIndexOf(",");
  const dotIndex = text.lastIndexOf(".");

  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      // 1.234,56 -> 1234.56
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 -> 1234.56
      text = text.replace(/,/g, "");
    }
  } else if (commaIndex >= 0) {
    // 5,25 -> 5.25
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// =========================
// VALIDASI BODY (dipakai saveNew & saveUpdate)
// =========================
function validateBody(body) {
  const supplier = String(body.supplier || "").trim();
  if (!supplier) {
    throw badReq("Supplier harus diisi.");
  }
  const salesPersonCode = String(body.salesPersonCode || "").trim();
  if (!salesPersonCode) {
    throw badReq("Sales Person harus dipilih.");
  }
  const jenis = String(body.jenis || "").trim().toUpperCase();
  if (!jenis) {
    throw badReq("Jenis harus diisi.");
  }

  if (!body.reject || typeof body.reject !== "object") {
    throw badReq("Jenis Reject dan berat harus diisi.");
  }

  const idReject = Number(body.reject.idReject);
  if (!Number.isInteger(idReject) || idReject <= 0) {
    throw badReq("Jenis Reject tidak valid.");
  }

  const berat = parseFlexibleNumber(body.reject.berat);
  if (!Number.isFinite(berat) || berat <= 0) {
    throw badReq(
      "Berat harus berupa angka lebih besar dari 0. Gunakan koma atau titik untuk desimal.",
    );
  }

  const reject = {
    idReject,
    berat,
    noReject: String(body.reject.noReject || "").trim(),
  };

  return {
    supplier,
    salesPersonCode,
    tanggal:
      body.tanggal && String(body.tanggal).trim() !== ""
        ? String(body.tanggal).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    createBy: String(body.createBy || "").slice(0, 10),
    jenis,
    reject,
  };
}

function setSessionContext(tx, ctx) {
  return new sql.Request(tx)
    .input("actorId", sql.Int, ctx.actorId)
    .input("rid", sql.NVarChar(64), ctx.requestId)
    .query(`
      EXEC sys.sp_set_session_context @key=N'actor_id', @value=@actorId;
      EXEC sys.sp_set_session_context @key=N'request_id', @value=@rid;
    `);
}

async function insertRejectV2(tx, { noReject, idReject, tanggal, berat, createBy }) {
  await new sql.Request(tx)
    .input("NoReject", sql.VarChar(13), noReject)
    .input("IdReject", sql.Int, Number(idReject))
    .input("DateCreate", sql.Date, tanggal)
    .input("Berat", sql.Float, Number(berat))
    .input("CreateBy", sql.VarChar(10), createBy)
    .input("DateTimeCreate", sql.DateTime, new Date())
    .query(`
      INSERT INTO dbo.RejectV2 (NoReject, IdReject, DateCreate, Berat, CreateBy, DateTimeCreate)
      VALUES (@NoReject, @IdReject, @DateCreate, @Berat, @CreateBy, @DateTimeCreate)`);
}

async function insertLink(tx, noPenerimaan, noReject) {
  await new sql.Request(tx)
    .input("NoPenerimaan", sql.VarChar(8), noPenerimaan)
    .input("NoReject", sql.VarChar(13), noReject)
    .query(`
      INSERT INTO dbo.PenerimaanTradeInOutputRejectV2 (NoPenerimaan, NoReject)
      VALUES (@NoPenerimaan, @NoReject)`);
}

// =========================
// SIMPAN BARU - SATU TRANSAKSI
// =========================
async function saveNew(body, ctx) {
  const v = validateBody(body);
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await setSessionContext(tx, ctx);

    // 1. Generate NoPenerimaan (di dalam transaksi)
    const noPenerimaan = await generateNextCode(tx, {
      tableName: "dbo.PenerimaanTradeIn_h",
      columnName: "NoPenerimaan",
      prefix: "AC.",
      width: 5,
    });

    // 2. Insert header
    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), noPenerimaan)
      .input("Tanggal", sql.Date, v.tanggal)
      .input("Supplier", sql.VarChar(50), v.supplier)
      .input("SalesPersonCode", sql.VarChar(10), v.salesPersonCode)
      .query(`
        INSERT INTO dbo.PenerimaanTradeIn_h (NoPenerimaan, Tanggal, Supplier, SalesPersonCode)
        VALUES (@NoPenerimaan, @Tanggal, @Supplier, @SalesPersonCode)`);

    // 3. Insert jenis
    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), noPenerimaan)
      .input("Jenis", sql.VarChar(50), v.jenis)
      .query(`
        INSERT INTO dbo.PenerimaanTradeInInput (NoPenerimaan, Jenis)
        VALUES (@NoPenerimaan, @Jenis)`);

    // 4. Insert label reject (NoReject di-generate saat simpan)
    if (v.reject) {
      const noReject = await generateNextCode(tx, {
        tableName: "dbo.RejectV2",
        columnName: "NoReject",
        prefix: "BF.",
        width: 10,
      });
      await insertRejectV2(tx, {
        noReject,
        idReject: v.reject.idReject,
        tanggal: v.tanggal,
        berat: v.reject.berat,
        createBy: v.createBy,
      });
      await insertLink(tx, noPenerimaan, noReject);
    }

    await tx.commit();
    return noPenerimaan;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// =========================
// UBAH - SATU TRANSAKSI
// =========================
async function saveUpdate(noPenerimaan, body, ctx) {
  const v = validateBody(body);
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await setSessionContext(tx, ctx);

    // 0. Cek header ada
    const cekResult = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`
        SELECT NoPenerimaan FROM dbo.PenerimaanTradeIn_h
         WHERE NoPenerimaan = @NoPenerimaan`);
    if (!cekResult.recordset.length) {
      throw notFound("Data tidak ditemukan.");
    }

    // 1. Update header
    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .input("Tanggal", sql.Date, v.tanggal)
      .input("Supplier", sql.VarChar(50), v.supplier)
      .input("SalesPersonCode", sql.VarChar(10), v.salesPersonCode)
      .query(`
        UPDATE dbo.PenerimaanTradeIn_h
           SET Tanggal = @Tanggal, Supplier = @Supplier, SalesPersonCode = @SalesPersonCode
         WHERE NoPenerimaan = @NoPenerimaan`);

    // 2. Ganti jenis (delete + re-insert)
    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanTradeInInput WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .input("Jenis", sql.VarChar(50), v.jenis)
      .query(`
        INSERT INTO dbo.PenerimaanTradeInInput (NoPenerimaan, Jenis)
        VALUES (@NoPenerimaan, @Jenis)`);

    // 3. Ganti label reject
    // 3a. Ambil NoReject lama
    const lamaResult = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`
        SELECT NoReject FROM dbo.PenerimaanTradeInOutputRejectV2
         WHERE NoPenerimaan = @NoPenerimaan`);
    const lamaNoReject = lamaResult.recordset.map((r) => r.NoReject);

    // 3b. Hapus semua link
    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanTradeInOutputRejectV2 WHERE NoPenerimaan = @NoPenerimaan`);

    // 3c. Insert ulang; NoReject kosong = label baru (generate)
    const noRejectBaru = [];
    if (v.reject) {
      let noReject = v.reject.noReject;
      if (noReject === "") {
        noReject = await generateNextCode(tx, {
          tableName: "dbo.RejectV2",
          columnName: "NoReject",
          prefix: "BF.",
          width: 10,
        });
        await insertRejectV2(tx, {
          noReject,
          idReject: v.reject.idReject,
          tanggal: v.tanggal,
          berat: v.reject.berat,
          createBy: v.createBy,
        });
      } else {
        // Label lama dipakai ulang -> update isi RejectV2
        await new sql.Request(tx)
          .input("NoReject", sql.VarChar(13), noReject)
          .input("IdReject", sql.Int, v.reject.idReject)
          .input("DateCreate", sql.Date, v.tanggal)
          .input("Berat", sql.Float, v.reject.berat)
          .input("CreateBy", sql.VarChar(10), v.createBy)
          .input("DateTimeCreate", sql.DateTime, new Date())
          .query(`
            UPDATE dbo.RejectV2
               SET IdReject = @IdReject, DateCreate = @DateCreate,
                   Berat = @Berat, CreateBy = @CreateBy, DateTimeCreate = @DateTimeCreate
             WHERE NoReject = @NoReject`);
      }

      await insertLink(tx, String(noPenerimaan), noReject);
      noRejectBaru.push(noReject);
    }

    // 3d. Bersihkan RejectV2 lama yang tidak dipakai lagi
    const noRejectTerpakai = new Set(noRejectBaru);
    for (const noReject of lamaNoReject) {
      if (!noRejectTerpakai.has(noReject)) {
        await new sql.Request(tx)
          .input("NoReject", sql.VarChar(13), noReject)
          .query(`DELETE FROM dbo.RejectV2 WHERE NoReject = @NoReject`);
      }
    }

    await tx.commit();
    return String(noPenerimaan);
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// =========================
// HAPUS (cascade)
// =========================
async function remove(noPenerimaan, ctx) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await setSessionContext(tx, ctx);

    // Ambil NoReject terkait
    const rejectResult = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`
        SELECT NoReject FROM dbo.PenerimaanTradeInOutputRejectV2
         WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanTradeInOutputRejectV2 WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanTradeInInput WHERE NoPenerimaan = @NoPenerimaan`);

    for (const row of rejectResult.recordset) {
      await new sql.Request(tx)
        .input("NoReject", sql.VarChar(13), row.NoReject)
        .query(`DELETE FROM dbo.RejectV2 WHERE NoReject = @NoReject`);
    }

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(8), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanTradeIn_h WHERE NoPenerimaan = @NoPenerimaan`);

    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

module.exports = {
  getList,
  getNextNo,
  getSalesPersons,
  getJenisReject,
  getDetail,
  saveNew,
  saveUpdate,
  remove,
};
