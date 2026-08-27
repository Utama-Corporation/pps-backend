-- ================================================================
-- Migration: Drop skema legacy Barang Dagang (belum pernah dipakai serius —
-- cuma berisi 2-4 baris data test "tes"/"2"/"fr") supaya bisa diganti total
-- dengan skema baru yang mengikuti pola Penerimaan Bahan Pendukung
-- (grid-tim via dbo.MstTimPenerimaan, bukan header berbasis
-- NoPurchaseInvoice + grouping per-box).
--
-- Legacy: BarangDagang_h (NoBD prefix "BM.", IdSupplier di header),
-- BarangDagang_d (PK komposit NoBD+NoBox), BarangDagang (tabel label
-- terpisah, 0 baris, tanpa FK ke manapun). Tidak ada kode backend lain
-- (di luar modul yang baru dibuat untuk fitur ini) yang mereferensikan
-- tabel-tabel ini — sudah dicek via grep menyeluruh di src/.
--
-- Urutan drop: child dulu (FK), baru parent.
-- ================================================================
IF OBJECT_ID('dbo.BarangDagang_d', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BarangDagang_d];
END
GO

IF OBJECT_ID('dbo.BarangDagang_h', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BarangDagang_h];
END
GO

IF OBJECT_ID('dbo.BarangDagang', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BarangDagang];
END
GO
