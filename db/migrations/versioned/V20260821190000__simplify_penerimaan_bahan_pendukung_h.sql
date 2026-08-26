-- ================================================================
-- Migration: Simplify PenerimaanBahanPendukung_h — remove Shift/Time, add IsComplete
-- ================================================================
-- Shift dan jam tidak lagi menjadi bagian dari header penerimaan.
-- Sebagai gantinya, tambah kolom IsComplete sebagai flag selesai.
-- Tim dianggap "aktif" jika BELUM ada penerimaan hari ini dengan
-- IsComplete = 1. Jika ada penerimaan dengan IsComplete = 1, tim
-- dianggap "selesai" (tidak aktif).
-- ================================================================

-- 1. Drop Shift
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'Shift')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] DROP COLUMN [Shift];
END
GO

-- 2. Drop HourStart
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'HourStart')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] DROP COLUMN [HourStart];
END
GO

-- 3. Drop HourEnd
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'HourEnd')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h] DROP COLUMN [HourEnd];
END
GO

-- 4. Add IsComplete
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'IsComplete')
BEGIN
  ALTER TABLE [dbo].[PenerimaanBahanPendukung_h]
    ADD [IsComplete] BIT NOT NULL CONSTRAINT [DF_PenerimaanBahanPendukung_h_IsComplete] DEFAULT (0);
END
GO
