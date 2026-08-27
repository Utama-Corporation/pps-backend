-- ================================================================
-- Migration: Tambah IsComplete + TglComplete ke PenerimaanBahanBaku_h
-- ================================================================
-- Mirror pola PenerimaanBahanPendukung_h / PenerimaanBarangDagang_h —
-- supaya status tim (aktif/pending/tidak aktif) bisa dihitung dari
-- "masih ada dokumen yang belum diselesaikan" (IsComplete = 0), bukan
-- cuma "ada dokumen hari ini" seperti sebelumnya. Sebelum ini,
-- PenerimaanBahanBaku_h tidak punya kolom penanda selesai sama sekali.
-- ================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IsComplete')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanBaku_h]
    ADD [IsComplete] BIT NOT NULL CONSTRAINT [DF_PenerimaanBahanBaku_h_IsComplete] DEFAULT (0);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'TglComplete')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanBaku_h] ADD [TglComplete] DATETIME NULL;
END
GO
