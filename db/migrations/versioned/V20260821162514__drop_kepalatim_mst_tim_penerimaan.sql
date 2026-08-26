-- ================================================================
-- Migration: Drop KepalaTim dari MstTimPenerimaan
-- ================================================================
-- Tidak ada konsep "operator" di modul-modul penerimaan yang memakai
-- MstTimPenerimaan (Bahan Pendukung, Bahan Baku, Barang Dagang nanti) —
-- KepalaTim (FK ke MstOperator) dihapus total dari tabel tim gabungan
-- ini beserta seluruh kode yang membaca/menulisnya.
-- ================================================================
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MstTimPenerimaan_MstOperator'
)
    ALTER TABLE dbo.MstTimPenerimaan DROP CONSTRAINT FK_MstTimPenerimaan_MstOperator;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.MstTimPenerimaan') AND name = 'KepalaTim'
)
    ALTER TABLE dbo.MstTimPenerimaan DROP COLUMN KepalaTim;
GO
