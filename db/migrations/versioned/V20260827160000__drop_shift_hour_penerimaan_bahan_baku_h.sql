-- ================================================================
-- Migration: Drop Shift/HourStart/HourEnd dari PenerimaanBahanBaku_h
-- ================================================================
-- Menyederhanakan header supaya formatnya sama seperti
-- PenerimaanBahanPendukung_h / PenerimaanBarangDagang_h (NoPenerimaan,
-- TglPenerimaan, IdTim, CreateBy, IsComplete, TglComplete saja). Operator
-- TETAP ada (via PenerimaanBahanBakuOperator_d, tabel terpisah) — hanya
-- Shift/Jam yang dihapus dari header.
-- ================================================================
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'Shift')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanBaku_h] DROP COLUMN [Shift];
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'HourStart')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanBaku_h] DROP COLUMN [HourStart];
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'HourEnd')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanBaku_h] DROP COLUMN [HourEnd];
END
GO
