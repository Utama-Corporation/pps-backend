// penerimaan-bahan-baku-service.js
const { sql, poolPromise } = require("../../../core/config/db");
const { generateNextCode } = require("../../../core/utils/sequence-code-helper");
const { badReq, notFound, conflict } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");
const {
  assertNotLocked,
  loadDocDateOnlyFromConfig,
  toDateOnly,
} = require("../../../core/shared/tutup-transaksi-guard");

// Kode kategori bahan baku yang didukung modul Penerimaan Bahan Baku,
// dan prefix label-nya di-resolve dinamis dari dbo.MstKategori (bukan
// di-hardcode) — lihat resolveKategoriPrefix(). Berdasarkan data MstKategori
// aktual: KodeKategori "bahanbaku" (NamaKategori "Bahan Baku", generik —
// dipakai sebagai alur "Proses") punya PrefixLabel "A.", sedangkan
// "bahanbakupakai" ("Bahan Baku Pakai") punya PrefixLabel "AB.".
const SUPPORTED_KODE_KATEGORI = new Set(["bahanbaku", "bahanbakupakai"]);

/// Ambil PrefixLabel dari dbo.MstKategori untuk sebuah KodeKategori.
/// [runner] boleh berupa pool (read-only, mis. saat list) atau transaksi
/// (mis. saat create, supaya ikut serialisasi transaksi yang sama).
async function resolveKategoriPrefix(runner, kodeKategori) {
  const result = await new sql.Request(runner)
    .input("KodeKategori", sql.VarChar(50), kodeKategori)
    .query(`
      SELECT PrefixLabel
      FROM dbo.MstKategori
      WHERE KodeKategori = @KodeKategori AND ISNULL(Enable, 1) = 1
    `);

  const prefix = result.recordset[0]?.PrefixLabel;
  if (!prefix) {
    throw badReq(`Kategori "${kodeKategori}" tidak ditemukan atau tidak aktif di MstKategori`);
  }
  return prefix;
}

function normalizeSaks(saks, palletIndex) {
  if (!Array.isArray(saks) || saks.length === 0) {
    throw badReq(`pallets[${palletIndex}].saks wajib berisi minimal 1 sak`);
  }

  const seen = new Set();
  return saks.map((sak, sakIndex) => {
    const noSak = Number.parseInt(sak?.noSak, 10);
    const berat = Number(sak?.berat);

    if (!Number.isFinite(noSak) || noSak <= 0) {
      throw badReq(`pallets[${palletIndex}].saks[${sakIndex}].noSak wajib valid`);
    }
    if (!Number.isFinite(berat) || berat <= 0) {
      throw badReq(`pallets[${palletIndex}].saks[${sakIndex}].berat wajib valid`);
    }

    const key = String(noSak);
    if (seen.has(key)) {
      throw badReq(`noSak duplikat di pallets[${palletIndex}]: ${sak.noSak}`);
    }
    seen.add(key);

    return { NoSak: Math.trunc(noSak), Berat: berat };
  });
}

function normalizePallets(pallets) {
  if (!Array.isArray(pallets) || pallets.length === 0) {
    throw badReq("pallets wajib berisi minimal 1 pallet");
  }

  return pallets.map((p, i) => {
    const idJenisPlastik = Number(p?.idJenisPlastik);
    if (!Number.isInteger(idJenisPlastik) || idJenisPlastik <= 0) {
      throw badReq(`pallets[${i}].idJenisPlastik wajib diisi`);
    }

    return {
      idJenisPlastik,
      idWarehouse: p.idWarehouse != null ? Number(p.idWarehouse) : null,
      keterangan: p.keterangan != null ? String(p.keterangan).trim() || null : null,
      idStatus: p.idStatus != null ? Number(p.idStatus) : 1,
      moisture: p.moisture != null ? Number(p.moisture) : null,
      meltingIndex: p.meltingIndex != null ? Number(p.meltingIndex) : null,
      elasticity: p.elasticity != null ? Number(p.elasticity) : null,
      tenggelam: p.tenggelam != null ? Number(p.tenggelam) : null,
      density: p.density != null ? Number(p.density) : null,
      density2: p.density2 != null ? Number(p.density2) : null,
      density3: p.density3 != null ? Number(p.density3) : null,
      blok: p.blok ? String(p.blok).trim() : "BSS",
      idLokasi: p.idLokasi != null ? Number(p.idLokasi) : 1,
      saks: normalizeSaks(p.saks, i),
    };
  });
}

function validateHeaderPayload(payload) {
  const tglPenerimaan = String(payload?.tglPenerimaan || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglPenerimaan)) {
    throw badReq("tglPenerimaan wajib diisi dengan format YYYY-MM-DD");
  }

  const idTim = Number(payload?.idTim);
  if (!Number.isInteger(idTim) || idTim <= 0) {
    throw badReq("idTim wajib diisi");
  }

  const shift = Number(payload?.shift);
  if (!Number.isInteger(shift) || shift <= 0) {
    throw badReq("shift wajib diisi");
  }

  const hourStart = String(payload?.hourStart || "").trim();
  if (!hourStart) {
    throw badReq("hourStart wajib diisi");
  }

  const hourEnd = String(payload?.hourEnd || "").trim();
  if (!hourEnd) {
    throw badReq("hourEnd wajib diisi");
  }

  const idOperators = [
    ...new Set(
      (Array.isArray(payload?.idOperators) ? payload.idOperators : [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  if (idOperators.length === 0) {
    throw badReq("idOperators wajib diisi minimal 1 operator");
  }

  return { tglPenerimaan, idTim, shift, hourStart, hourEnd, idOperators };
}

function validateAddPalletsPayload(payload) {
  const idSupplier = Number(payload?.idSupplier);
  if (!Number.isInteger(idSupplier) || idSupplier <= 0) {
    throw badReq("idSupplier wajib diisi");
  }

  const noPlat = payload?.noPlat ? String(payload.noPlat).trim() || null : null;

  const kodeKategori = String(payload?.kodeKategori || payload?.kategori || "")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_KODE_KATEGORI.has(kodeKategori)) {
    throw badReq(
      `kodeKategori tidak valid: ${payload?.kodeKategori}. Gunakan salah satu dari: ${[...SUPPORTED_KODE_KATEGORI].join(", ")}`,
    );
  }

  const pallets = normalizePallets(payload?.pallets);

  return { idSupplier, noPlat, kodeKategori, pallets };
}

async function generateUniqueCode(tx, opts) {
  let code = await generateNextCode(tx, opts);
  const existing = await new sql.Request(tx)
    .input("Code", sql.VarChar(50), code)
    .query(`SELECT 1 FROM ${opts.tableName} WITH (UPDLOCK, HOLDLOCK) WHERE ${opts.columnName} = @Code`);

  if (existing.recordset.length > 0) {
    code = await generateNextCode(tx, opts);
    const existing2 = await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code)
      .query(`SELECT 1 FROM ${opts.tableName} WITH (UPDLOCK, HOLDLOCK) WHERE ${opts.columnName} = @Code`);
    if (existing2.recordset.length > 0) {
      throw conflict(`Gagal generate ${opts.columnName} unik, coba lagi`);
    }
  }

  return code;
}

async function assertTimAktif(tx, idTim) {
  const result = await new sql.Request(tx)
    .input("IdTim", sql.Int, idTim)
    .query(`SELECT Aktif FROM dbo.MstTimPenerimaanBB WHERE IdTim = @IdTim`);

  const row = result.recordset[0];
  if (!row) {
    throw badReq(`IdTim ${idTim} tidak ditemukan`);
  }
  if (!row.Aktif) {
    throw badReq(`Tim penerimaan bahan baku dengan IdTim ${idTim} sedang tidak aktif`);
  }
}

// ==========================================
//  FASE 1: CREATE HEADER (analog WashingProduksi_h create)
//  POST /api/penerimaan-bahan-baku
//  Hanya membuat baris dokumen — belum ada pallet/isi sama sekali.
//  Kategori/Supplier/No Plat/pallet baru diisi di fase 2 (addPallets),
//  bisa dipanggil lebih dari sekali (satu kali per section Pakai/Proses)
//  untuk NoPenerimaan yang sama.
// ==========================================
async function createHeaderPenerimaanBahanBaku(payload, ctx) {
  const v = validateHeaderPayload(payload);
  const { actorId, actorUsername, requestId } = ctx || {};

  if (!actorId) {
    throw badReq("actorId kosong / tidak valid. Controller harus inject actorId dari token.");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const audit = await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const docDateOnly = toDateOnly(v.tglPenerimaan);
    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "create PenerimaanBahanBaku (header)",
      useLock: true,
    });

    await assertTimAktif(tx, v.idTim);

    const noPenerimaan = await generateUniqueCode(tx, {
      tableName: "dbo.PenerimaanBahanBaku_h",
      columnName: "NoPenerimaan",
      prefix: "R.",
      width: 10,
    });

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), noPenerimaan)
      .input("TglPenerimaan", sql.Date, v.tglPenerimaan)
      .input("IdTim", sql.Int, v.idTim)
      .input("Shift", sql.Int, v.shift)
      .input("HourStart", sql.VarChar(20), v.hourStart)
      .input("HourEnd", sql.VarChar(20), v.hourEnd)
      .input("CreateBy", sql.VarChar(100), actorUsername || null)
      .query(`
        INSERT INTO dbo.PenerimaanBahanBaku_h
          (NoPenerimaan, TglPenerimaan, IdTim, Shift, HourStart, HourEnd, CreateBy)
        VALUES
          (
            @NoPenerimaan, @TglPenerimaan, @IdTim,
            @Shift,
            CASE WHEN @HourStart IS NULL OR LTRIM(RTRIM(@HourStart)) = '' THEN NULL ELSE CAST(@HourStart AS time(7)) END,
            CASE WHEN @HourEnd IS NULL OR LTRIM(RTRIM(@HourEnd)) = '' THEN NULL ELSE CAST(@HourEnd AS time(7)) END,
            @CreateBy
          )
      `);

    const rqOp = new sql.Request(tx);
    rqOp.input("NoPenerimaan", sql.VarChar(20), noPenerimaan);
    const opValues = v.idOperators.map((opId, i) => {
      const p = `Op${i}`;
      rqOp.input(p, sql.Int, opId);
      return `(@NoPenerimaan, @${p})`;
    });
    await rqOp.query(`
      INSERT INTO dbo.PenerimaanBahanBakuOperator_d (NoPenerimaan, IdOperator)
      VALUES ${opValues.join(", ")};
    `);

    await tx.commit();

    return {
      noPenerimaan,
      tglPenerimaan: v.tglPenerimaan,
      idTim: v.idTim,
      idOperators: v.idOperators,
      shift: v.shift,
      hourStart: v.hourStart,
      hourEnd: v.hourEnd,
      audit: { actorId: audit.actorId, requestId: audit.requestId },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// ==========================================
//  FASE 2: ADD PALLETS ke NoPenerimaan yang SUDAH ADA (analog menambah
//  label/output ke WashingProduksi_h yang sudah dibuat).
//  POST /api/penerimaan-bahan-baku/:noPenerimaan/pallets
//  Membuat SATU NoBahanBaku baru (1 kategori/supplier/no plat) + semua
//  pallet/sak-nya, di-link ke NoPenerimaan tsb lewat
//  PenerimaanBahanBakuOutput. Boleh dipanggil >1x untuk NoPenerimaan yang
//  sama (mis. sekali untuk section Pakai, sekali untuk section Proses).
// ==========================================
async function addPalletsPenerimaanBahanBaku(noPenerimaan, payload, ctx) {
  const v = validateAddPalletsPayload(payload);
  const { actorId, actorUsername, requestId } = ctx || {};

  if (!actorId) {
    throw badReq("actorId kosong / tidak valid. Controller harus inject actorId dari token.");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const audit = await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const headerRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT NoPenerimaan, TglPenerimaan
        FROM dbo.PenerimaanBahanBaku_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoPenerimaan = @NoPenerimaan
      `);
    const header = headerRows.recordset[0];
    if (!header) {
      throw notFound(`PenerimaanBahanBaku dengan NoPenerimaan ${noPenerimaan} tidak ditemukan`);
    }

    const docDateOnly = toDateOnly(header.TglPenerimaan);
    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "add pallets PenerimaanBahanBaku",
      useLock: true,
    });

    const prefix = await resolveKategoriPrefix(tx, v.kodeKategori);

    const noBahanBaku = await generateUniqueCode(tx, {
      tableName: "dbo.BahanBaku_h",
      columnName: "NoBahanBaku",
      prefix,
      width: 10,
    });

    const nowDate = new Date();

    await new sql.Request(tx)
      .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
      .input("IdSupplier", sql.Int, v.idSupplier)
      .input("NoPlat", sql.VarChar(20), v.noPlat)
      .input("DateCreate", sql.Date, header.TglPenerimaan)
      .input("CreateBy", sql.VarChar(100), actorUsername || null)
      .input("DateTimeCreate", sql.DateTime, nowDate)
      .query(`
        INSERT INTO dbo.BahanBaku_h
          (NoBahanBaku, IdSupplier, NoPlat, DateCreate, CreateBy, DateTimeCreate)
        VALUES
          (@NoBahanBaku, @IdSupplier, @NoPlat, @DateCreate, @CreateBy, @DateTimeCreate)
      `);

    const createdOutputs = [];
    let noPallet = 1;

    for (const pallet of v.pallets) {
      const saksJson = JSON.stringify(pallet.saks);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("IdJenisPlastik", sql.Int, pallet.idJenisPlastik)
        .input("IdWarehouse", sql.Int, pallet.idWarehouse)
        .input("Keterangan", sql.NVarChar(200), pallet.keterangan)
        .input("IdStatus", sql.Int, pallet.idStatus)
        .input("Moisture", sql.Decimal(10, 3), pallet.moisture)
        .input("MeltingIndex", sql.Decimal(10, 3), pallet.meltingIndex)
        .input("Elasticity", sql.Decimal(10, 3), pallet.elasticity)
        .input("Tenggelam", sql.Decimal(10, 3), pallet.tenggelam)
        .input("Density", sql.Decimal(10, 3), pallet.density)
        .input("Density2", sql.Decimal(10, 3), pallet.density2)
        .input("Density3", sql.Decimal(10, 3), pallet.density3)
        .input("HasBeenPrinted", sql.Int, 0)
        .input("Blok", sql.VarChar(50), pallet.blok)
        .input("IdLokasi", sql.Int, pallet.idLokasi)
        .query(`
          INSERT INTO dbo.BahanBakuPallet_h (
            NoBahanBaku, NoPallet, IdJenisPlastik, IdWarehouse, Keterangan,
            IdStatus, Moisture, MeltingIndex, Elasticity, Tenggelam,
            Density, Density2, Density3, HasBeenPrinted, Blok, IdLokasi
          )
          VALUES (
            @NoBahanBaku, @NoPallet, @IdJenisPlastik, @IdWarehouse, @Keterangan,
            @IdStatus, @Moisture, @MeltingIndex, @Elasticity, @Tenggelam,
            @Density, @Density2, @Density3, @HasBeenPrinted, @Blok, @IdLokasi
          )
        `);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("TimeCreate", sql.DateTime, nowDate)
        .input("IdLokasi", sql.Int, pallet.idLokasi)
        .input("SaksJson", sql.NVarChar(sql.MAX), saksJson)
        .query(`
          INSERT INTO dbo.BahanBaku_d (
            NoBahanBaku, NoPallet, NoSak, Berat, DateUsage,
            IsPartial, BeratAct, TimeCreate, IdLokasi, IsLembab
          )
          SELECT
            @NoBahanBaku, @NoPallet, j.NoSak, j.Berat, NULL,
            0, NULL, @TimeCreate, @IdLokasi, 0
          FROM OPENJSON(@SaksJson)
          WITH (
            NoSak int '$.NoSak',
            Berat decimal(18,3) '$.Berat'
          ) AS j
        `);

      await new sql.Request(tx)
        .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("SaksJson", sql.NVarChar(sql.MAX), saksJson)
        .query(`
          INSERT INTO dbo.PenerimaanBahanBakuOutput (NoPenerimaan, NoBahanBaku, NoPallet, NoSak)
          SELECT @NoPenerimaan, @NoBahanBaku, @NoPallet, j.NoSak
          FROM OPENJSON(@SaksJson)
          WITH (NoSak int '$.NoSak') AS j
        `);

      createdOutputs.push({
        noBahanBaku,
        noPallet,
        idJenisPlastik: pallet.idJenisPlastik,
        jumlahSak: pallet.saks.length,
        totalBerat: pallet.saks.reduce((sum, sak) => sum + sak.Berat, 0),
      });

      noPallet += 1;
    }

    await tx.commit();

    return {
      noPenerimaan: String(noPenerimaan),
      noBahanBaku,
      idSupplier: v.idSupplier,
      noPlat: v.noPlat,
      kodeKategori: v.kodeKategori,
      prefix,
      outputs: createdOutputs,
      audit: { actorId: audit.actorId, requestId: audit.requestId },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

async function listPenerimaanBahanBaku({ page = 1, pageSize = 20, filter = "", kodeKategori = "" } = {}) {
  const pool = await poolPromise;

  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (p - 1) * ps;
  const filterTerm = String(filter || "").trim();
  const kodeKategoriTerm = String(kodeKategori || "").trim().toLowerCase();

  let prefixTerm = "";
  if (kodeKategoriTerm) {
    if (!SUPPORTED_KODE_KATEGORI.has(kodeKategoriTerm)) {
      throw badReq(`kodeKategori tidak valid: ${kodeKategori}`);
    }
    prefixTerm = await resolveKategoriPrefix(pool, kodeKategoriTerm);
  }

  // Satu NoPenerimaan sekarang bisa punya LEBIH dari satu NoBahanBaku (satu
  // per section Pakai/Proses yang ditambah lewat addPallets). BB memilih
  // SATU NoBahanBaku "utama" per NoPenerimaan untuk ditampilkan di baris
  // riwayat ini: yang cocok dengan @PrefixTerm (filter kategori aktif) bila
  // ada, kalau tidak ada filter, yang pertama (NoBahanBaku terkecil).
  const bbCte = `
    WITH BBAll AS (
      SELECT DISTINCT o.NoPenerimaan, bb.NoBahanBaku, bb.IdSupplier, bb.NoPlat
      FROM dbo.PenerimaanBahanBakuOutput o WITH (NOLOCK)
      INNER JOIN dbo.BahanBaku_h bb WITH (NOLOCK) ON bb.NoBahanBaku = o.NoBahanBaku
    ),
    BB AS (
      SELECT NoPenerimaan, NoBahanBaku, IdSupplier, NoPlat,
        ROW_NUMBER() OVER (
          PARTITION BY NoPenerimaan
          ORDER BY
            CASE WHEN @PrefixTerm <> '' AND NoBahanBaku LIKE @PrefixTerm + '%' THEN 0 ELSE 1 END,
            NoBahanBaku
        ) AS rn
      FROM BBAll
    )
  `;

  const whereClause = `
    WHERE 1 = 1
      AND (
        @Filter = ''
        OR h.NoPenerimaan LIKE '%' + @Filter + '%'
        OR ISNULL(sup.NmSupplier, '') LIKE '%' + @Filter + '%'
        OR ISNULL(t.NamaTim, '') LIKE '%' + @Filter + '%'
      )
      AND (
        @PrefixTerm = ''
        OR EXISTS (
          SELECT 1 FROM BBAll x
          WHERE x.NoPenerimaan = h.NoPenerimaan AND x.NoBahanBaku LIKE @PrefixTerm + '%'
        )
      )
  `;

  const countReq = pool.request();
  countReq.input("Filter", sql.VarChar(100), filterTerm);
  countReq.input("PrefixTerm", sql.VarChar(20), prefixTerm);
  const countRes = await countReq.query(`
    ${bbCte}
    SELECT COUNT(1) AS total
    FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
    LEFT JOIN BB bb ON bb.NoPenerimaan = h.NoPenerimaan AND bb.rn = 1
    LEFT JOIN dbo.MstSupplier sup WITH (NOLOCK) ON sup.IdSupplier = bb.IdSupplier
    LEFT JOIN dbo.MstTimPenerimaanBB t WITH (NOLOCK) ON t.IdTim = h.IdTim
    ${whereClause};
  `);
  const total = countRes.recordset?.[0]?.total || 0;
  if (total === 0) return { data: [], total: 0 };

  const dataReq = pool.request();
  dataReq.input("Filter", sql.VarChar(100), filterTerm);
  dataReq.input("PrefixTerm", sql.VarChar(20), prefixTerm);
  dataReq.input("offset", sql.Int, offset);
  dataReq.input("limit", sql.Int, ps);
  const dataRes = await dataReq.query(`
    ${bbCte}
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      opAgg.IdOperators,
      opAgg.NamaOperators,
      bb.IdSupplier,
      sup.NmSupplier AS NamaSupplier,
      bb.NoPlat,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate,
      bb.NoBahanBaku,
      agg.JumlahPallet,
      agg.TotalBerat
    FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
    LEFT JOIN BB bb ON bb.NoPenerimaan = h.NoPenerimaan AND bb.rn = 1
    LEFT JOIN dbo.MstSupplier sup WITH (NOLOCK) ON sup.IdSupplier = bb.IdSupplier
    LEFT JOIN dbo.MstTimPenerimaanBB t WITH (NOLOCK) ON t.IdTim = h.IdTim
    OUTER APPLY (
      SELECT
        JSON_QUERY(COALESCE(
          (SELECT od.IdOperator AS [value]
           FROM dbo.PenerimaanBahanBakuOperator_d od WITH (NOLOCK)
           WHERE od.NoPenerimaan = h.NoPenerimaan
           FOR JSON PATH), '[]'
        )) AS IdOperators,
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanBakuOperator_d od WITH (NOLOCK)
          INNER JOIN dbo.MstOperator mo WITH (NOLOCK) ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
    ) opAgg
    OUTER APPLY (
      SELECT
        COUNT(DISTINCT o.NoPallet) AS JumlahPallet,
        SUM(ISNULL(d.Berat, 0)) AS TotalBerat
      FROM dbo.PenerimaanBahanBakuOutput o
      LEFT JOIN dbo.BahanBaku_d d
        ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
      WHERE o.NoPenerimaan = h.NoPenerimaan AND o.NoBahanBaku = bb.NoBahanBaku
    ) agg
    ${whereClause}
    ORDER BY h.NoPenerimaan DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  return { data: dataRes.recordset || [], total };
}

async function getDetailPenerimaanBahanBaku(noPenerimaan) {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan));

  const headerResult = await request.query(`
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      opAgg.IdOperators,
      opAgg.NamaOperators,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate
    FROM dbo.PenerimaanBahanBaku_h h
    LEFT JOIN dbo.MstTimPenerimaanBB t ON t.IdTim = h.IdTim
    OUTER APPLY (
      SELECT
        JSON_QUERY(COALESCE(
          (SELECT od.IdOperator AS [value]
           FROM dbo.PenerimaanBahanBakuOperator_d od
           WHERE od.NoPenerimaan = h.NoPenerimaan
           FOR JSON PATH), '[]'
        )) AS IdOperators,
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanBakuOperator_d od
          INNER JOIN dbo.MstOperator mo ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
    ) opAgg
    WHERE h.NoPenerimaan = @NoPenerimaan
  `);

  const header = headerResult.recordset[0];
  if (!header) return null;

  // Satu NoPenerimaan bisa membawa >1 NoBahanBaku (1 per section Pakai/
  // Proses) — masing-masing punya Supplier/No Plat sendiri, jadi
  // dikembalikan per-batch di sini, BUKAN sebagai field tunggal di header.
  const batchesResult = await request.query(`
    SELECT DISTINCT
      o.NoBahanBaku,
      bb.IdSupplier,
      sup.NmSupplier AS NamaSupplier,
      bb.NoPlat
    FROM dbo.PenerimaanBahanBakuOutput o
    INNER JOIN dbo.BahanBaku_h bb ON bb.NoBahanBaku = o.NoBahanBaku
    LEFT JOIN dbo.MstSupplier sup ON sup.IdSupplier = bb.IdSupplier
    WHERE o.NoPenerimaan = @NoPenerimaan
    ORDER BY o.NoBahanBaku
  `);

  const outputResult = await request.query(`
    SELECT
      o.NoBahanBaku,
      o.NoPallet,
      o.NoSak,
      p.IdJenisPlastik,
      jp.Jenis AS NamaJenisPlastik,
      d.Berat
    FROM dbo.PenerimaanBahanBakuOutput o
    LEFT JOIN dbo.BahanBakuPallet_h p
      ON p.NoBahanBaku = o.NoBahanBaku AND p.NoPallet = o.NoPallet
    LEFT JOIN dbo.MstJenisPlastik jp ON jp.IdJenisPlastik = p.IdJenisPlastik
    LEFT JOIN dbo.BahanBaku_d d
      ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
    WHERE o.NoPenerimaan = @NoPenerimaan
    ORDER BY o.NoBahanBaku, o.NoPallet, o.NoSak
  `);

  return {
    ...header,
    batches: batchesResult.recordset || [],
    outputs: outputResult.recordset || [],
  };
}

async function deletePenerimaanBahanBaku(noPenerimaan, ctx) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), ctx || {});

    const { docDateOnly } = await loadDocDateOnlyFromConfig({
      entityKey: "penerimaanBahanBaku",
      codeValue: noPenerimaan,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });

    if (!docDateOnly) {
      throw notFound("Data PenerimaanBahanBaku tidak ditemukan");
    }

    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "delete PenerimaanBahanBaku",
      useLock: true,
    });

    const outputRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT DISTINCT NoBahanBaku
        FROM dbo.PenerimaanBahanBakuOutput WITH (UPDLOCK, HOLDLOCK)
        WHERE NoPenerimaan = @NoPenerimaan
      `);

    const usedRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT 1
        FROM dbo.PenerimaanBahanBakuOutput o
        INNER JOIN dbo.BahanBaku_d d
          ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
        WHERE o.NoPenerimaan = @NoPenerimaan AND d.DateUsage IS NOT NULL
      `);

    if (usedRows.recordset.length > 0) {
      throw conflict(
        "Tidak bisa menghapus PenerimaanBahanBaku: sebagian label bahan baku sudah terpakai di proses lain",
      );
    }

    // Bisa >1 NoBahanBaku (Pakai & Proses) di bawah satu NoPenerimaan.
    const noBahanBakuList = outputRows.recordset.map((r) => r.NoBahanBaku);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanBakuOutput WHERE NoPenerimaan = @NoPenerimaan`);

    for (const noBahanBaku of noBahanBakuList) {
      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBaku_d WHERE NoBahanBaku = @NoBahanBaku`);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBakuPallet_h WHERE NoBahanBaku = @NoBahanBaku`);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBaku_h WHERE NoBahanBaku = @NoBahanBaku`);
    }

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanBakuOperator_d WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanBaku_h WHERE NoPenerimaan = @NoPenerimaan`);

    await tx.commit();
    return true;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// ==========================================
//  STATUS TIM (untuk grid ala mesin washing)
//  Analog GET /api/mst-mesin/washing: satu baris = satu tim, dengan info
//  NoPenerimaan yang dibuat HARI INI (jika ada, berdasarkan tanggal & jam
//  di header — persis pola WashingProduksi_h). Tim tanpa NoPenerimaan hari
//  ini dianggap "belum aktif" di layar tablet.
// ==========================================
async function getTimStatus() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      t.IdTim,
      t.NamaTim,
      t.Aktif,
      today.NoPenerimaan,
      CONVERT(varchar(10), today.TglPenerimaan, 23) AS TglPenerimaan,
      today.Shift,
      CONVERT(VARCHAR(8), today.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), today.HourEnd, 108) AS HourEnd,
      today.NamaOperators
    FROM dbo.MstTimPenerimaanBB t WITH (NOLOCK)
    OUTER APPLY (
      SELECT TOP 1
        h.NoPenerimaan, h.TglPenerimaan, h.Shift, h.HourStart, h.HourEnd,
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanBakuOperator_d od WITH (NOLOCK)
          INNER JOIN dbo.MstOperator mo WITH (NOLOCK) ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
      FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
      WHERE h.IdTim = t.IdTim
        AND CONVERT(date, h.TglPenerimaan) = CONVERT(date, GETDATE())
      ORDER BY h.DateTimeCreate DESC
    ) today
    ORDER BY t.NamaTim ASC;
  `);

  return result.recordset || [];
}

module.exports = {
  createHeaderPenerimaanBahanBaku,
  addPalletsPenerimaanBahanBaku,
  listPenerimaanBahanBaku,
  getDetailPenerimaanBahanBaku,
  deletePenerimaanBahanBaku,
  getTimStatus,
};
