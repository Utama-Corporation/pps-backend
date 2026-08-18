// src/modules/retur-v3/retur-v3-service.js
const { sql, poolPromise } = require("../../core/config/db");
const {
  resolveEffectiveDateForCreate,
  assertNotLocked,
  loadDocDateOnlyFromConfig,
  formatYMD,
} = require("../../core/shared/tutup-transaksi-guard");
const { badReq, conflict, notFound } = require("../../core/utils/http-error");
const { applyAuditContext } = require("../../core/utils/db-audit-context");

const {
  generateBarangJadiLabel,
} = require("./handlers/generate-barang-jadi.handler");
const {
  generateFurnitureWipLabel,
} = require("./handlers/generate-furniture-wip.handler");
const {
  generateRejectLabel,
} = require("./handlers/generate-reject.handler");

const ALLOWED_KODE_KATEGORI = ["barangjadi", "furniturewip"];
const ALLOWED_KATEGORI_INPUT = ["BAGUS", "REJECT"];

function assertKodeKategori(value, field = "kodeKategori") {
  if (!ALLOWED_KODE_KATEGORI.includes(value)) {
    throw badReq(`${field} wajib salah satu dari: ${ALLOWED_KODE_KATEGORI.join(", ")}`);
  }
}

function assertKategoriInput(value, field = "kategoriInput") {
  if (!ALLOWED_KATEGORI_INPUT.includes(value)) {
    throw badReq(`${field} wajib salah satu dari: ${ALLOWED_KATEGORI_INPUT.join(", ")}`);
  }
}

async function jenisExists(tx, kodeKategori, idJenis) {
  const rq = new sql.Request(tx).input("Id", sql.Int, idJenis);
  if (kodeKategori === "barangjadi") {
    const r = await rq.query(`SELECT 1 FROM dbo.MstBarangJadi WHERE IdBJ=@Id`);
    return r.recordset.length > 0;
  }
  const r = await rq.query(`SELECT 1 FROM dbo.MstCabinetWIP WHERE IdCabinetWIP=@Id`);
  return r.recordset.length > 0;
}

// ---------------------------------------------------------------------------
// LIST / DETAIL
// ---------------------------------------------------------------------------

exports.getAllRetur = async ({
  page = 1,
  pageSize = 20,
  search = "",
  status = "",
  dateFrom = null,
  dateTo = null,
} = {}) => {
  const pool = await poolPromise;
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (p - 1) * ps;
  const searchTerm = String(search || "").trim();
  const statusTerm = String(status || "").trim();
  const df = typeof dateFrom === "string" && dateFrom.trim() ? dateFrom.trim() : null;
  const dt = typeof dateTo === "string" && dateTo.trim() ? dateTo.trim() : null;

  const whereClause = `
    WHERE 1=1
      AND (@search = '' OR h.NoRetur LIKE '%' + @search + '%' OR ISNULL(p.NamaPembeli, '') LIKE '%' + @search + '%')
      AND (@status = '' OR h.StatusRetur = @status)
      AND (@dateFrom IS NULL OR CONVERT(date, h.Tanggal) >= @dateFrom)
      AND (@dateTo   IS NULL OR CONVERT(date, h.Tanggal) <= @dateTo)
  `;

  const countReq = pool.request();
  countReq.input("search", sql.VarChar(100), searchTerm);
  countReq.input("status", sql.VarChar(20), statusTerm);
  countReq.input("dateFrom", sql.Date, df);
  countReq.input("dateTo", sql.Date, dt);
  const countRes = await countReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.BJReturV3_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstPembeli p WITH (NOLOCK) ON p.IdPembeli = h.IdPembeli
    ${whereClause};
  `);
  const total = countRes.recordset?.[0]?.total || 0;
  if (total === 0) return { data: [], total: 0 };

  const dataReq = pool.request();
  dataReq.input("search", sql.VarChar(100), searchTerm);
  dataReq.input("status", sql.VarChar(20), statusTerm);
  dataReq.input("dateFrom", sql.Date, df);
  dataReq.input("dateTo", sql.Date, dt);
  dataReq.input("offset", sql.Int, offset);
  dataReq.input("pageSize", sql.Int, ps);
  const dataRes = await dataReq.query(`
    ;WITH LastClosed AS (
      SELECT TOP 1 CONVERT(date, PeriodHarian) AS LastClosedDate
      FROM dbo.MstTutupTransaksiHarian WITH (NOLOCK)
      WHERE [Lock] = 1
      ORDER BY CONVERT(date, PeriodHarian) DESC, Id DESC
    )
    SELECT
      h.NoRetur,
      h.Tanggal,
      h.IdPembeli,
      p.NamaPembeli,
      h.Keterangan,
      h.StatusRetur,
      h.FlagKirim,
      (SELECT COUNT(1) FROM dbo.BJReturV3Item_d it WHERE it.NoRetur = h.NoRetur) AS ItemCount,
      (SELECT ISNULL(SUM(it.Pcs), 0) FROM dbo.BJReturV3Item_d it WHERE it.NoRetur = h.NoRetur) AS TurnoverTargetPcs,
      (SELECT ISNULL(SUM(tv.Pcs), 0) FROM dbo.BJReturV3Turnover_d tv WHERE tv.NoRetur = h.NoRetur) AS TurnoverScannedPcs,
      CASE
        WHEN lc.LastClosedDate IS NOT NULL AND CONVERT(date, h.Tanggal) <= lc.LastClosedDate
        THEN CAST(1 AS bit) ELSE CAST(0 AS bit)
      END AS IsLocked
    FROM dbo.BJReturV3_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstPembeli p WITH (NOLOCK) ON p.IdPembeli = h.IdPembeli
    OUTER APPLY (SELECT TOP 1 LastClosedDate FROM LastClosed) lc
    ${whereClause}
    ORDER BY h.NoRetur DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return {
    data: (dataRes.recordset || []).map((r) => ({
      ...r,
      Tanggal: formatYMD(r.Tanggal),
    })),
    total,
  };
};

exports.getDetail = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  const headerRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT h.*, p.NamaPembeli
      FROM dbo.BJReturV3_h h
      LEFT JOIN dbo.MstPembeli p ON p.IdPembeli = h.IdPembeli
      WHERE h.NoRetur = @No
    `);
  const header = headerRes.recordset?.[0];
  if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);

  const itemsRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
        it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis,
        mr.NamaReject
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
      WHERE it.NoRetur = @No
      ORDER BY it.IdItem ASC
    `);
  const items = itemsRes.recordset || [];

  let itemsWithExtra = items;

  if (header.StatusRetur === "DIGANTI" && items.length > 0) {
    const turnoverRes = await pool
      .request()
      .input("No", sql.VarChar(50), no).query(`
        SELECT IdItem, SUM(Pcs) AS ScannedPcs
        FROM dbo.BJReturV3Turnover_d
        WHERE NoRetur = @No
        GROUP BY IdItem
      `);
    const scannedMap = new Map(
      (turnoverRes.recordset || []).map((r) => [r.IdItem, Number(r.ScannedPcs || 0)]),
    );
    itemsWithExtra = items.map((it) => ({
      ...it,
      TurnoverScannedPcs: scannedMap.get(it.IdItem) || 0,
      TurnoverRemainingPcs: Math.max(
        0,
        Number(it.Pcs) - (scannedMap.get(it.IdItem) || 0),
      ),
      TurnoverFulfilled: (scannedMap.get(it.IdItem) || 0) === Number(it.Pcs),
    }));
  }

  return {
    ...header,
    Tanggal: formatYMD(header.Tanggal),
    items: itemsWithExtra,
  };
};

// ---------------------------------------------------------------------------
// HEADER CRUD
// ---------------------------------------------------------------------------

exports.createHeader = async (payload, ctx) => {
  const { tanggal, idPembeli, keterangan } = payload || {};
  const must = [];
  if (!tanggal) must.push("tanggal");
  if (idPembeli == null || idPembeli === "") must.push("idPembeli");
  if (must.length) throw badReq(`Field wajib: ${must.join(", ")}`);

  const idPembeliNum = Number(idPembeli);
  if (!Number.isFinite(idPembeliNum) || idPembeliNum <= 0) {
    throw badReq("idPembeli tidak valid");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const effectiveDate = resolveEffectiveDateForCreate(tanggal);
    await assertNotLocked({
      date: effectiveDate,
      runner: tx,
      action: "create Retur V3",
      useLock: true,
    });

    // NoRetur v3 melanjutkan sequence 'L.' yang SAMA dengan retur v1
    // (dbo.BJRetur_h) — bukan sequence terpisah — supaya tidak ada NoRetur
    // yang sama persis muncul di kedua tabel. generateNextCode() bawaan
    // cuma bisa cek satu tabel, jadi next-number dihitung manual dari MAX
    // gabungan kedua tabel di sini.
    const gen = async () => {
      const rq = new sql.Request(tx).input("prefix", sql.VarChar(50), "L.");
      const r = await rq.query(`
        SELECT TOP 1 Code FROM (
          SELECT NoRetur AS Code FROM dbo.BJRetur_h WITH (UPDLOCK, HOLDLOCK)
          WHERE NoRetur LIKE @prefix + '%'
          UNION ALL
          SELECT NoRetur AS Code FROM dbo.BJReturV3_h WITH (UPDLOCK, HOLDLOCK)
          WHERE NoRetur LIKE @prefix + '%'
        ) x
        ORDER BY TRY_CONVERT(BIGINT, SUBSTRING(Code, 3, 50)) DESC, Code DESC;
      `);
      const last = r.recordset?.[0]?.Code ? String(r.recordset[0].Code) : "";
      const lastNum = parseInt(last.substring(2), 10) || 0;
      return "L." + String(lastNum + 1).padStart(10, "0");
    };

    let noRetur = await gen();
    let exist = await new sql.Request(tx)
      .input("No", sql.VarChar(50), noRetur)
      .query(`
        SELECT 1 FROM dbo.BJRetur_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
        UNION ALL
        SELECT 1 FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
      `);
    if (exist.recordset.length > 0) {
      noRetur = await gen();
      exist = await new sql.Request(tx)
        .input("No", sql.VarChar(50), noRetur)
        .query(`
          SELECT 1 FROM dbo.BJRetur_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
          UNION ALL
          SELECT 1 FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
        `);
      if (exist.recordset.length > 0) throw conflict("Gagal generate NoRetur unik, coba lagi");
    }

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), noRetur)
      .input("Tanggal", sql.Date, effectiveDate)
      .input("IdPembeli", sql.Int, idPembeliNum)
      .input("Keterangan", sql.NVarChar(500), keterangan ?? null)
      .input("CreateBy", sql.VarChar(50), actorUsername).query(`
        INSERT INTO dbo.BJReturV3_h (
          NoRetur, Tanggal, IdPembeli, Keterangan, StatusRetur, CreateBy
        ) VALUES (
          @NoRetur, @Tanggal, @IdPembeli, @Keterangan, 'PENDING', @CreateBy
        )
      `);

    await tx.commit();

    return {
      noRetur,
      tanggal: formatYMD(effectiveDate),
      idPembeli: idPembeliNum,
      keterangan: keterangan ?? null,
      statusRetur: "PENDING",
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.updateHeader = async (noRetur, payload, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const { docDateOnly: oldDocDateOnly, row: headerRow } = await loadDocDateOnlyFromConfig({
      entityKey: "returnV3",
      codeValue: no,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });
    if (!headerRow) throw notFound(`NoRetur ${no} tidak ditemukan`);

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa diupdate");
    }

    await assertNotLocked({
      date: oldDocDateOnly,
      runner: tx,
      action: "update Retur V3 (current date)",
      useLock: true,
    });

    const sets = [];
    const rq = new sql.Request(tx);

    if (payload?.tanggal !== undefined) {
      if (!payload.tanggal) throw badReq("tanggal tidak boleh kosong");
      const effectiveDate = resolveEffectiveDateForCreate(payload.tanggal);
      await assertNotLocked({
        date: effectiveDate,
        runner: tx,
        action: "update Retur V3 (new date)",
        useLock: true,
      });
      sets.push("Tanggal=@Tanggal");
      rq.input("Tanggal", sql.Date, effectiveDate);
    }

    if (payload?.idPembeli !== undefined) {
      if (payload.idPembeli == null || payload.idPembeli === "") {
        throw badReq("idPembeli tidak boleh kosong");
      }
      const idPembeliNum = Number(payload.idPembeli);
      if (!Number.isFinite(idPembeliNum) || idPembeliNum <= 0) {
        throw badReq("idPembeli tidak valid");
      }
      sets.push("IdPembeli=@IdPembeli");
      rq.input("IdPembeli", sql.Int, idPembeliNum);
    }

    if (payload?.keterangan !== undefined) {
      sets.push("Keterangan=@Keterangan");
      rq.input("Keterangan", sql.NVarChar(500), payload.keterangan ?? null);
    }

    if (sets.length === 0) throw badReq("Tidak ada field yang diupdate");

    rq.input("No", sql.VarChar(50), no);
    await rq.query(`UPDATE dbo.BJReturV3_h SET ${sets.join(", ")} WHERE NoRetur=@No`);

    await tx.commit();
    return { noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.deleteHeader = async (noRetur, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const { docDateOnly, row: headerRow } = await loadDocDateOnlyFromConfig({
      entityKey: "returnV3",
      codeValue: no,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });
    if (!headerRow) throw notFound(`NoRetur ${no} tidak ditemukan`);

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa dihapus");
    }

    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "delete Retur V3",
      useLock: true,
    });

    const itemsRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT IdItem, GeneratedLabelCode FROM dbo.BJReturV3Item_d WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const items = itemsRes.recordset || [];

    if (items.some((it) => it.GeneratedLabelCode)) {
      throw conflict("Tidak bisa hapus: ada item yang sudah generate label");
    }

    if (items.length > 0) {
      const turnoverRes = await new sql.Request(tx)
        .input("No", sql.VarChar(50), no)
        .query(`SELECT TOP 1 1 AS x FROM dbo.BJReturV3Turnover_d WHERE NoRetur=@No`);
      if (turnoverRes.recordset.length > 0) {
        throw conflict("Tidak bisa hapus: ada turnover scan pada item");
      }

      await new sql.Request(tx)
        .input("No", sql.VarChar(50), no)
        .query(`DELETE FROM dbo.BJReturV3Item_d WHERE NoRetur=@No`);
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(`DELETE FROM dbo.BJReturV3_h WHERE NoRetur=@No`);

    await tx.commit();
    return { noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// ITEM CRUD
// ---------------------------------------------------------------------------

exports.addItems = async (noRetur, items, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Array.isArray(items) || items.length === 0) {
    throw badReq("items wajib berisi minimal 1 item");
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    assertKodeKategori(it.kodeKategori, `items[${i}].kodeKategori`);
    assertKategoriInput(it.kategoriInput, `items[${i}].kategoriInput`);
    const pcsNum = Number(it.pcs);
    if (!Number.isFinite(pcsNum) || pcsNum <= 0 || !Number.isInteger(pcsNum)) {
      throw badReq(`items[${i}].pcs wajib bilangan bulat positif`);
    }
    const idJenisNum = Number(it.idJenis);
    if (!Number.isFinite(idJenisNum) || idJenisNum <= 0) {
      throw badReq(`items[${i}].idJenis wajib diisi`);
    }
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa menambah item");
    }

    const createdIds = [];
    for (const it of items) {
      const ok = await jenisExists(tx, it.kodeKategori, Number(it.idJenis));
      if (!ok) {
        throw badReq(
          `idJenis ${it.idJenis} tidak ditemukan untuk kategori ${it.kodeKategori}`,
        );
      }

      const ins = await new sql.Request(tx)
        .input("NoRetur", sql.VarChar(50), no)
        .input("KodeKategori", sql.VarChar(20), it.kodeKategori)
        .input("IdJenis", sql.Int, Number(it.idJenis))
        .input("Pcs", sql.Int, Math.trunc(Number(it.pcs)))
        .input("KategoriInput", sql.VarChar(10), it.kategoriInput)
        .input("CreateBy", sql.VarChar(50), actorUsername).query(`
          INSERT INTO dbo.BJReturV3Item_d (NoRetur, KodeKategori, IdJenis, Pcs, KategoriInput, CreateBy)
          OUTPUT INSERTED.IdItem
          VALUES (@NoRetur, @KodeKategori, @IdJenis, @Pcs, @KategoriInput, @CreateBy)
        `);
      createdIds.push(ins.recordset[0].IdItem);
    }

    // Ambil ulang dengan JOIN ke master (NamaJenis) supaya response langsung
    // membawa nama, bukan cuma IdJenis mentah — konsisten dengan getDetail().
    const idsJson = JSON.stringify(createdIds.map((id) => ({ id })));
    const createdRes = await new sql.Request(tx).input(
      "IdsJson",
      sql.NVarChar(sql.MAX),
      idsJson,
    ).query(`
      SELECT
        it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
        it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis,
        mr.NamaReject
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
      WHERE it.IdItem IN (
        SELECT j.id FROM OPENJSON(@IdsJson) WITH (id int '$.id') AS j
      )
      ORDER BY it.IdItem ASC
    `);

    await tx.commit();
    return {
      noRetur: no,
      items: createdRes.recordset || [],
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.updateItem = async (noRetur, idItem, payload, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa mengubah item");
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT * FROM dbo.BJReturV3Item_d WITH (UPDLOCK,HOLDLOCK) WHERE IdItem=@Id AND NoRetur=@No`,
      );
    const item = itemRes.recordset[0];
    if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

    const kodeKategori = payload?.kodeKategori !== undefined ? payload.kodeKategori : item.KodeKategori;
    const idJenis = payload?.idJenis !== undefined ? Number(payload.idJenis) : item.IdJenis;
    const pcs = payload?.pcs !== undefined ? Number(payload.pcs) : item.Pcs;
    const kategoriInput = payload?.kategoriInput !== undefined ? payload.kategoriInput : item.KategoriInput;

    assertKodeKategori(kodeKategori);
    assertKategoriInput(kategoriInput);
    if (!Number.isFinite(pcs) || pcs <= 0 || !Number.isInteger(pcs)) {
      throw badReq("pcs wajib bilangan bulat positif");
    }
    if (!Number.isFinite(idJenis) || idJenis <= 0) {
      throw badReq("idJenis wajib diisi");
    }

    const ok = await jenisExists(tx, kodeKategori, idJenis);
    if (!ok) throw badReq(`idJenis ${idJenis} tidak ditemukan untuk kategori ${kodeKategori}`);

    await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("KodeKategori", sql.VarChar(20), kodeKategori)
      .input("IdJenis", sql.Int, idJenis)
      .input("Pcs", sql.Int, Math.trunc(pcs))
      .input("KategoriInput", sql.VarChar(10), kategoriInput).query(`
        UPDATE dbo.BJReturV3Item_d
        SET KodeKategori=@KodeKategori, IdJenis=@IdJenis, Pcs=@Pcs, KategoriInput=@KategoriInput
        WHERE IdItem=@Id
      `);

    // Ambil ulang dengan JOIN ke master (NamaJenis) supaya response langsung
    // membawa nama, bukan cuma id — konsisten dengan getDetail()/addItems().
    const updatedRes = await new sql.Request(tx).input("Id", sql.Int, idItemNum)
      .query(`
        SELECT
          it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
          it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
          CASE
            WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
            WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
          END AS NamaJenis,
          mr.NamaReject
        FROM dbo.BJReturV3Item_d it
        LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
        LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
        LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
        WHERE it.IdItem = @Id
      `);

    await tx.commit();
    return updatedRes.recordset[0];
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.deleteItem = async (noRetur, idItem, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa menghapus item");
    }

    const del = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(`DELETE FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
    if (!del.rowsAffected?.[0]) {
      throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);
    }

    await tx.commit();
    return { idItem: idItemNum, noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// DECISION
// ---------------------------------------------------------------------------

exports.decide = async (noRetur, decision, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!["DIGANTI", "TIDAK_DIGANTI"].includes(decision)) {
    throw badReq("decision wajib DIGANTI atau TIDAK_DIGANTI");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan sebelumnya");
    }

    const itemCountRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(`SELECT COUNT(1) AS cnt FROM dbo.BJReturV3Item_d WHERE NoRetur=@No`);
    if (!(Number(itemCountRes.recordset[0].cnt) > 0)) {
      throw badReq("Header belum memiliki item, tidak bisa diputuskan");
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("Status", sql.VarChar(20), decision)
      .input("DecisionBy", sql.Int, actorId)
      .input("DecisionByUsername", sql.VarChar(100), actorUsername).query(`
        UPDATE dbo.BJReturV3_h
        SET StatusRetur=@Status, DecisionBy=@DecisionBy, DecisionByUsername=@DecisionByUsername, DecisionAt=SYSUTCDATETIME()
        WHERE NoRetur=@No
      `);

    await tx.commit();
    return { noRetur: no, statusRetur: decision, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// GENERATE LABEL (TIDAK_DIGANTI path)
// ---------------------------------------------------------------------------

exports.generateLabel = async (noRetur, idItem, body, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const itemRes = await pool
    .request()
    .input("Id", sql.Int, idItemNum)
    .input("No", sql.VarChar(50), no)
    .query(`SELECT * FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
  const item = itemRes.recordset[0];
  if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

  if (item.KategoriInput === "REJECT") {
    return generateRejectLabel(no, idItemNum, body, ctx);
  }
  if (item.KodeKategori === "barangjadi") {
    return generateBarangJadiLabel(no, idItemNum, ctx);
  }
  if (item.KodeKategori === "furniturewip") {
    return generateFurnitureWipLabel(no, idItemNum, ctx);
  }
  throw badReq(`KodeKategori ${item.KodeKategori} tidak didukung`);
};

// ---------------------------------------------------------------------------
// OUTPUTS
// ---------------------------------------------------------------------------

exports.getOutputs = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  const bjRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        bj.NoBJ AS LabelCode,
        bj.DateCreate,
        mbj.NamaBJ AS NamaJenis,
        N'barangjadi' AS KodeKategori,
        N'Barang Jadi' AS Kategori,
        N'pcs' AS Uom,
        bj.Blok,
        bj.IdLokasi,
        ISNULL(bj.Pcs, 0) AS Qty,
        ISNULL(CAST(bj.HasBeenPrinted AS int), 0) AS HasBeenPrinted
      FROM dbo.BJReturV3OutputLabelBarangJadi map
      INNER JOIN dbo.BarangJadi bj ON bj.NoBJ = map.NoBJ
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = bj.IdBJ
      WHERE map.NoRetur = @No
      ORDER BY bj.NoBJ ASC
    `);

  const fwRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        fw.NoFurnitureWIP AS LabelCode,
        fw.DateCreate,
        mcw.Nama AS NamaJenis,
        N'furniturewip' AS KodeKategori,
        N'Furniture WIP' AS Kategori,
        N'pcs' AS Uom,
        fw.Blok,
        fw.IdLokasi,
        ISNULL(fw.Pcs, 0) AS Qty,
        ISNULL(CAST(fw.HasBeenPrinted AS int), 0) AS HasBeenPrinted
      FROM dbo.BJReturV3OutputLabelFurnitureWIP map
      INNER JOIN dbo.FurnitureWIP fw ON fw.NoFurnitureWIP = map.NoFurnitureWIP
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = fw.IDFurnitureWIP
      WHERE map.NoRetur = @No
      ORDER BY fw.NoFurnitureWIP ASC
    `);

  const rejectRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        r.NoReject AS LabelCode,
        r.DateCreate,
        mr.NamaReject AS NamaJenis,
        N'reject' AS KodeKategori,
        N'Reject' AS Kategori,
        N'kg' AS Uom,
        r.Blok,
        r.IdLokasi,
        ISNULL(r.Berat, 0) AS Qty,
        ISNULL(CAST(r.HasBeenPrinted AS int), 0) AS HasBeenPrinted
      FROM dbo.BJReturV3OutputLabelReject map
      INNER JOIN dbo.RejectV2 r ON r.NoReject = map.NoReject
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = r.IdReject
      WHERE map.NoRetur = @No
      ORDER BY r.NoReject ASC
    `);

  return [
    ...(bjRes.recordset || []),
    ...(fwRes.recordset || []),
    ...(rejectRes.recordset || []),
  ];
};

// ---------------------------------------------------------------------------
// TURNOVER (DIGANTI path)
// ---------------------------------------------------------------------------

exports.scanTurnover = async (noRetur, idItem, labelCode, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  const code = String(labelCode || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");
  if (!code) throw badReq("labelCode wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Scan turnover hanya bisa dilakukan saat StatusRetur=DIGANTI");
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT * FROM dbo.BJReturV3Item_d WITH (UPDLOCK,HOLDLOCK) WHERE IdItem=@Id AND NoRetur=@No`,
      );
    const item = itemRes.recordset[0];
    if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

    const table = item.KodeKategori === "barangjadi" ? "dbo.BarangJadi" : "dbo.FurnitureWIP";
    const codeCol = item.KodeKategori === "barangjadi" ? "NoBJ" : "NoFurnitureWIP";
    const jenisCol = item.KodeKategori === "barangjadi" ? "IdBJ" : "IDFurnitureWIP";

    const labelRes = await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code).query(`
        SELECT ${codeCol} AS Code, ${jenisCol} AS IdJenis, ISNULL(Pcs, 0) AS Pcs, DateUsage
        FROM ${table} WITH (UPDLOCK, HOLDLOCK)
        WHERE ${codeCol} = @Code
      `);
    const label = labelRes.recordset[0];
    if (!label) throw badReq(`Label ${code} tidak ditemukan pada kategori ${item.KodeKategori}`);
    if (label.DateUsage != null) throw badReq(`Label ${code} sudah terpakai`);
    if (Number(label.IdJenis) !== Number(item.IdJenis)) {
      throw badReq(
        `Label ${code} tidak cocok jenisnya dengan item retur (kodeKategori+idJenis harus sama persis)`,
      );
    }

    const scannedRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .query(
        `SELECT ISNULL(SUM(Pcs), 0) AS ScannedPcs FROM dbo.BJReturV3Turnover_d WHERE IdItem=@Id`,
      );
    const scannedPcs = Number(scannedRes.recordset[0].ScannedPcs || 0);
    const remaining = Number(item.Pcs) - scannedPcs;
    const labelPcs = Number(label.Pcs || 0);

    if (labelPcs > remaining) {
      throw badReq(
        `Pcs label (${labelPcs}) melebihi sisa target item (${remaining}). Scan ditolak seluruhnya (tidak ada partial consumption).`,
      );
    }

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), no)
      .input("IdItem", sql.Int, idItemNum)
      .input("LabelCode", sql.VarChar(50), code)
      .input("Pcs", sql.Int, labelPcs)
      .input("ScanBy", sql.VarChar(50), actorUsername).query(`
        INSERT INTO dbo.BJReturV3Turnover_d (NoRetur, IdItem, LabelCode, Pcs, ScanBy)
        OUTPUT INSERTED.IdTurnover
        VALUES (@NoRetur, @IdItem, @LabelCode, @Pcs, @ScanBy)
      `);

    await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code)
      .query(`UPDATE ${table} SET DateUsage = SYSUTCDATETIME() WHERE ${codeCol} = @Code`);

    await tx.commit();
    return {
      noRetur: no,
      idItem: idItemNum,
      labelCode: code,
      pcs: labelPcs,
      scannedPcs: scannedPcs + labelPcs,
      targetPcs: Number(item.Pcs),
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// Scan tanpa perlu pilih item dulu: deteksi kategori+jenis label yang
// discan (cek BarangJadi lalu FurnitureWIP), lalu cari item retur yang
// KodeKategori+IdJenis-nya cocok dan masih punya sisa target (Pcs -
// ScannedPcs > 0). Kalau ada beberapa item yang cocok (jarang, tapi bisa
// terjadi jika user menambahkan 2 item dengan jenis yang sama), pilih yang
// IdItem paling kecil (ditambahkan paling awal) supaya deterministik.
exports.scanTurnoverAuto = async (noRetur, labelCode, ctx) => {
  const no = String(noRetur || "").trim();
  const code = String(labelCode || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!code) throw badReq("labelCode wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Scan turnover hanya bisa dilakukan saat StatusRetur=DIGANTI");
    }

    const bjRes = await new sql.Request(tx).input("Code", sql.VarChar(50), code)
      .query(`
        SELECT NoBJ AS Code, IdBJ AS IdJenis, ISNULL(Pcs, 0) AS Pcs, DateUsage
        FROM dbo.BarangJadi WITH (UPDLOCK, HOLDLOCK)
        WHERE NoBJ = @Code
      `);

    let kodeKategori = null;
    let table = null;
    let codeCol = null;
    let label = null;

    if (bjRes.recordset.length > 0) {
      kodeKategori = "barangjadi";
      table = "dbo.BarangJadi";
      codeCol = "NoBJ";
      label = bjRes.recordset[0];
    } else {
      const fwRes = await new sql.Request(tx).input("Code", sql.VarChar(50), code)
        .query(`
          SELECT NoFurnitureWIP AS Code, IDFurnitureWIP AS IdJenis, ISNULL(Pcs, 0) AS Pcs, DateUsage
          FROM dbo.FurnitureWIP WITH (UPDLOCK, HOLDLOCK)
          WHERE NoFurnitureWIP = @Code
        `);
      if (fwRes.recordset.length > 0) {
        kodeKategori = "furniturewip";
        table = "dbo.FurnitureWIP";
        codeCol = "NoFurnitureWIP";
        label = fwRes.recordset[0];
      }
    }

    if (!label) throw badReq(`Label ${code} tidak ditemukan`);
    if (label.DateUsage != null) throw badReq(`Label ${code} sudah terpakai`);

    const candidatesRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("KodeKategori", sql.VarChar(20), kodeKategori)
      .input("IdJenis", sql.Int, Number(label.IdJenis)).query(`
        SELECT it.IdItem, it.Pcs,
          ISNULL((SELECT SUM(tv.Pcs) FROM dbo.BJReturV3Turnover_d tv WHERE tv.IdItem = it.IdItem), 0) AS ScannedPcs
        FROM dbo.BJReturV3Item_d it WITH (UPDLOCK, HOLDLOCK)
        WHERE it.NoRetur = @No AND it.KodeKategori = @KodeKategori AND it.IdJenis = @IdJenis
        ORDER BY it.IdItem ASC
      `);

    const candidate = (candidatesRes.recordset || []).find(
      (r) => Number(r.Pcs) - Number(r.ScannedPcs || 0) > 0,
    );

    if (!candidate) {
      throw badReq(
        `Tidak ada item retur ini yang cocok dengan label ${code} (jenis tidak ditemukan di retur ini, atau target sudah terpenuhi semua)`,
      );
    }

    const remaining = Number(candidate.Pcs) - Number(candidate.ScannedPcs || 0);
    const labelPcs = Number(label.Pcs || 0);

    if (labelPcs > remaining) {
      throw badReq(
        `Pcs label (${labelPcs}) melebihi sisa target item (${remaining}). Scan ditolak seluruhnya (tidak ada partial consumption).`,
      );
    }

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), no)
      .input("IdItem", sql.Int, candidate.IdItem)
      .input("LabelCode", sql.VarChar(50), code)
      .input("Pcs", sql.Int, labelPcs)
      .input("ScanBy", sql.VarChar(50), actorUsername).query(`
        INSERT INTO dbo.BJReturV3Turnover_d (NoRetur, IdItem, LabelCode, Pcs, ScanBy)
        OUTPUT INSERTED.IdTurnover
        VALUES (@NoRetur, @IdItem, @LabelCode, @Pcs, @ScanBy)
      `);

    await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code)
      .query(`UPDATE ${table} SET DateUsage = SYSUTCDATETIME() WHERE ${codeCol} = @Code`);

    await tx.commit();
    return {
      noRetur: no,
      idItem: candidate.IdItem,
      kodeKategori,
      idJenis: Number(label.IdJenis),
      labelCode: code,
      pcs: labelPcs,
      scannedPcs: Number(candidate.ScannedPcs || 0) + labelPcs,
      targetPcs: Number(candidate.Pcs),
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.undoScan = async (noRetur, idItem, idTurnover, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  const idTurnoverNum = Number(idTurnover);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");
  if (!Number.isFinite(idTurnoverNum)) throw badReq("idTurnover tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur, FlagKirim FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.FlagKirim) {
      throw conflict("Header sudah di-flag kirim, tidak bisa membatalkan scan");
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(`SELECT * FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
    const item = itemRes.recordset[0];
    if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

    const turnoverRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTurnoverNum)
      .input("ItemId", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT * FROM dbo.BJReturV3Turnover_d WITH (UPDLOCK,HOLDLOCK) WHERE IdTurnover=@Id AND IdItem=@ItemId AND NoRetur=@No`,
      );
    const turnover = turnoverRes.recordset[0];
    if (!turnover) throw notFound(`Turnover ${idTurnoverNum} tidak ditemukan`);

    const table = item.KodeKategori === "barangjadi" ? "dbo.BarangJadi" : "dbo.FurnitureWIP";
    const codeCol = item.KodeKategori === "barangjadi" ? "NoBJ" : "NoFurnitureWIP";

    await new sql.Request(tx)
      .input("Code", sql.VarChar(50), turnover.LabelCode)
      .query(`UPDATE ${table} SET DateUsage = NULL WHERE ${codeCol} = @Code`);

    await new sql.Request(tx)
      .input("Id", sql.Int, idTurnoverNum)
      .query(`DELETE FROM dbo.BJReturV3Turnover_d WHERE IdTurnover=@Id`);

    await tx.commit();
    return { noRetur: no, idItem: idItemNum, idTurnover: idTurnoverNum, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.getTurnover = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  const itemsRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        it.IdItem, it.Pcs, it.KodeKategori, it.IdJenis,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      WHERE it.NoRetur=@No
      ORDER BY it.IdItem ASC
    `);
  const items = itemsRes.recordset || [];
  if (items.length === 0) return [];

  const scansRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT IdTurnover, IdItem, LabelCode, Pcs, DateTimeScan
      FROM dbo.BJReturV3Turnover_d
      WHERE NoRetur=@No
      ORDER BY IdItem ASC, IdTurnover ASC
    `);
  const scans = scansRes.recordset || [];

  return items.map((it) => {
    const itemScans = scans.filter((s) => s.IdItem === it.IdItem);
    const scannedPcs = itemScans.reduce((sum, s) => sum + Number(s.Pcs || 0), 0);
    return {
      idItem: it.IdItem,
      kodeKategori: it.KodeKategori,
      idJenis: it.IdJenis,
      namaJenis: it.NamaJenis,
      targetPcs: Number(it.Pcs),
      scannedPcs,
      scans: itemScans.map((s) => ({
        idTurnover: s.IdTurnover,
        labelCode: s.LabelCode,
        pcs: Number(s.Pcs),
        dateTimeScan: s.DateTimeScan,
      })),
    };
  });
};

// ---------------------------------------------------------------------------
// FLAG KIRIM
// ---------------------------------------------------------------------------

exports.flagKirim = async (noRetur, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur, FlagKirim FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Flag kirim hanya bisa dilakukan saat StatusRetur=DIGANTI");
    }
    if (header.FlagKirim) {
      throw conflict("Header sudah di-flag kirim sebelumnya");
    }

    const unfulfilledRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no).query(`
        SELECT it.IdItem, it.Pcs, ISNULL(t.ScannedPcs, 0) AS ScannedPcs
        FROM dbo.BJReturV3Item_d it
        LEFT JOIN (
          SELECT IdItem, SUM(Pcs) AS ScannedPcs
          FROM dbo.BJReturV3Turnover_d
          WHERE NoRetur = @No
          GROUP BY IdItem
        ) t ON t.IdItem = it.IdItem
        WHERE it.NoRetur = @No
          AND ISNULL(t.ScannedPcs, 0) <> it.Pcs
      `);
    if (unfulfilledRes.recordset.length > 0) {
      throw conflict(
        `Tidak bisa flag kirim: masih ada item yang belum fully scanned (${unfulfilledRes.recordset.length} item)`,
      );
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("FlagKirimBy", sql.Int, actorId)
      .input("FlagKirimByUsername", sql.VarChar(100), actorUsername).query(`
        UPDATE dbo.BJReturV3_h
        SET FlagKirim=1, FlagKirimBy=@FlagKirimBy, FlagKirimByUsername=@FlagKirimByUsername, FlagKirimAt=SYSUTCDATETIME()
        WHERE NoRetur=@No
      `);

    await tx.commit();
    return { noRetur: no, flagKirim: true, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};
