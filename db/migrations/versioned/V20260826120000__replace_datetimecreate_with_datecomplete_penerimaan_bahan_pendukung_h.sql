-- PenerimaanBahanPendukung_h: header sudah punya TglPenerimaan (tanggal
-- penerimaan). Tambahkan TglComplete untuk mencatat KAPAN ditandai selesai
-- (mengikuti pola StockOpname_h.DateComplete), dan hapus DateTimeCreate —
-- tidak dipakai di UI/aplikasi.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'TglComplete')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] ADD [TglComplete] DATETIME NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_PenerimaanBahanPendukung_h_DateTimeCreate')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] DROP CONSTRAINT [DF_PenerimaanBahanPendukung_h_DateTimeCreate];
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'DateTimeCreate')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] DROP COLUMN [DateTimeCreate];
END
GO
