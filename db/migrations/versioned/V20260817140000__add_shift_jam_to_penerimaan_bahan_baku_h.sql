-- ================================================================
-- Migration: Add Shift/HourStart/HourEnd to PenerimaanBahanBaku_h
-- Menyamakan format transaksi penerimaan bahan baku dengan format
-- produksi (mis. WashingProduksi_h): setiap NoPenerimaan sekarang
-- membawa info shift + jam mulai/selesai, dipakai endpoint status
-- tim (analog GET /api/mst-mesin/washing) untuk menandai tim yang
-- sudah punya transaksi aktif hari ini.
-- ================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'Shift'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h ADD Shift int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'HourStart'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h ADD HourStart time(7) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'HourEnd'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h ADD HourEnd time(7) NULL;
GO
