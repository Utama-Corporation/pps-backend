-- ================================================================
-- Migration: Konsolidasi MstTimPenerimaan + flag TipeModul
-- ================================================================
-- MstTimPenerimaan awalnya dimaksudkan GLOBAL tapi belum punya kolom
-- pembeda modul, dan kenyataannya hanya dipakai satu modul (Bahan
-- Pendukung). Sementara itu modul Bahan Baku punya tabel tim sendiri
-- (MstTimPenerimaanBB) — duplikasi yang seharusnya tidak perlu terjadi
-- lagi tiap kali ada modul penerimaan baru (mis. Barang Dagang).
--
-- Migration ini:
--   1) Menambah kolom TipeModul di MstTimPenerimaan (default
--      'BAHAN_PENDUKUNG' untuk baris lama — satu-satunya konsumen saat
--      ini), lalu drop default-nya supaya insert baru wajib eksplisit.
--   2) Menyalin semua tim dari MstTimPenerimaanBB ke MstTimPenerimaan
--      dengan TipeModul='BAHAN_BAKU'.
--   3) Backfill referensi PenerimaanBahanBaku_h.IdTim (yang tadinya
--      menunjuk ke MstTimPenerimaanBB) supaya menunjuk ke baris yang
--      baru disalin di MstTimPenerimaan (dicocokkan lewat NamaTim,
--      sama seperti pola V20260819160000).
--   4) Mengganti FK PenerimaanBahanBaku_h dari MstTimPenerimaanBB ke
--      MstTimPenerimaan.
--
-- MstTimPenerimaanBB SENGAJA TIDAK di-drop — dibiarkan sebagai tabel
-- deprecated untuk mitigasi risiko bila ada join/report lama yang
-- belum ketahuan. Bisa dibersihkan di migration terpisah nanti setelah
-- dipastikan aman di production.
--
-- Idempotent: semua langkah pakai guard (IF NOT EXISTS / NOT EXISTS).
-- ================================================================

-- 1) Tambah kolom TipeModul (nullable dulu, backfill, baru NOT NULL)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.MstTimPenerimaan') AND name = 'TipeModul'
)
    ALTER TABLE dbo.MstTimPenerimaan ADD TipeModul VARCHAR(30) NULL;
GO

UPDATE dbo.MstTimPenerimaan SET TipeModul = 'BAHAN_PENDUKUNG' WHERE TipeModul IS NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.MstTimPenerimaan') AND name = 'TipeModul' AND is_nullable = 0
)
    ALTER TABLE dbo.MstTimPenerimaan ALTER COLUMN TipeModul VARCHAR(30) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MstTimPenerimaan_TipeModul'
)
    ALTER TABLE dbo.MstTimPenerimaan
        ADD CONSTRAINT CK_MstTimPenerimaan_TipeModul
        CHECK (TipeModul IN ('BAHAN_PENDUKUNG', 'BAHAN_BAKU', 'BARANG_DAGANG'));
GO

-- 2) Salin tim dari MstTimPenerimaanBB (idempotent lewat NamaTim+TipeModul)
INSERT INTO dbo.MstTimPenerimaan (NamaTim, KepalaTim, Keterangan, Aktif, TipeModul)
SELECT
    bb.NamaTim,
    bb.KepalaTim,
    bb.Keterangan,
    bb.Aktif,
    'BAHAN_BAKU'
FROM dbo.MstTimPenerimaanBB bb
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstTimPenerimaan mtp
    WHERE mtp.NamaTim = bb.NamaTim AND mtp.TipeModul = 'BAHAN_BAKU'
);
GO

-- 3) Backfill referensi PenerimaanBahanBaku_h.IdTim ke ruang ID baru
UPDATE h
    SET h.IdTim = t.IdTim
FROM dbo.PenerimaanBahanBaku_h h
INNER JOIN dbo.MstTimPenerimaanBB old ON old.IdTim = h.IdTim
INNER JOIN dbo.MstTimPenerimaan t
    ON t.NamaTim = old.NamaTim AND t.TipeModul = 'BAHAN_BAKU'
-- Guard supaya idempotent: hanya update baris yang IdTim-nya masih
-- menunjuk ke ruang ID lama (MstTimPenerimaanBB), bukan yang sudah
-- dimigrasikan sebelumnya.
WHERE EXISTS (
    SELECT 1 FROM dbo.MstTimPenerimaanBB x WHERE x.IdTim = h.IdTim
);
GO

-- 4) Ganti FK PenerimaanBahanBaku_h: MstTimPenerimaanBB -> MstTimPenerimaan
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP CONSTRAINT FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstTimPenerimaan'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h
        ADD CONSTRAINT FK_PenerimaanBahanBaku_h_MstTimPenerimaan
        FOREIGN KEY (IdTim) REFERENCES dbo.MstTimPenerimaan (IdTim);
GO
