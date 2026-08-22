-- ================================================================
-- Migration: Kembalikan IdTim ke PenerimaanBahanBaku_h, drop dari
-- BahanBaku_h.
--
-- Alasan: alur create sekarang 2 fase, meniru washing production —
--   1) Dialog header (Tanggal/Shift/Jam) langsung hit endpoint create
--      header (POST /api/penerimaan-bahan-baku) begitu tombol SIMPAN
--      ditekan → membuat baris PenerimaanBahanBaku_h.
--   2) Baru di screen input, user menambah pallet per section (Pakai/
--      Proses) via endpoint terpisah (POST
--      /api/penerimaan-bahan-baku/:noPenerimaan/pallets) yang membuat
--      BahanBaku_h + pallet + sak untuk NoPenerimaan yang SUDAH ADA.
--
-- Konsekuensi: IdTim WAJIB diketahui saat fase 1 (sebelum kategori/
-- pallet apapun dipilih), jadi ia atribut dokumen (siapa yang
-- menerima) — persis seperti IdMesin/IdOperator yang tetap di
-- WashingProduksi_h, bukan di Washing_h. Supplier/NoPlat tetap di
-- BahanBaku_h karena baru diketahui di fase 2 dan bisa berbeda per
-- section (Pakai vs Proses bisa dari supplier/truk berbeda).
-- ================================================================

-- 1) Tambah IdTim di PenerimaanBahanBaku_h (nullable dulu untuk backfill)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IdTim'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h ADD IdTim int NULL;
GO

-- 2) Backfill dari BahanBaku_h (via link PenerimaanBahanBakuOutput)
UPDATE h
    SET h.IdTim = bb.IdTim
FROM dbo.PenerimaanBahanBaku_h h
CROSS APPLY (
    SELECT TOP 1 x.IdTim
    FROM dbo.PenerimaanBahanBakuOutput o
    INNER JOIN dbo.BahanBaku_h x ON x.NoBahanBaku = o.NoBahanBaku
    WHERE o.NoPenerimaan = h.NoPenerimaan AND x.IdTim IS NOT NULL
) bb
WHERE h.IdTim IS NULL;
GO

-- 3) FK + NOT NULL (dokumen baru WAJIB ada IdTim; dokumen lama yang
--    entah kenapa tidak ke-backfill dibiarkan NULL agar migration tidak
--    gagal — cek manual bila ada).
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h
        ADD CONSTRAINT FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB
        FOREIGN KEY (IdTim) REFERENCES dbo.MstTimPenerimaanBB (IdTim);
GO

-- 4) Drop FK & kolom IdTim dari BahanBaku_h (redundan sekarang)
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BahanBaku_h_MstTimPenerimaanBB'
)
    ALTER TABLE dbo.BahanBaku_h DROP CONSTRAINT FK_BahanBaku_h_MstTimPenerimaanBB;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.BahanBaku_h') AND name = 'IdTim'
)
    ALTER TABLE dbo.BahanBaku_h DROP COLUMN IdTim;
GO
