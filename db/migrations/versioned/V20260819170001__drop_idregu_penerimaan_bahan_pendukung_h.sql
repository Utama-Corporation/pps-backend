-- ================================================================
-- Migration: Hapus IdRegu dari PenerimaanBahanPendukung_h.
-- Sama seperti PenerimaanBahanBaku_h: IdTim sudah mewakili siapa
-- yang mengerjakan, jadi IdRegu redundan. Header sekarang:
-- Tim + Operator, bukan lagi Regu + Operator.
-- ================================================================
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanPendukung_h_MstRegu'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_h DROP CONSTRAINT FK_PenerimaanBahanPendukung_h_MstRegu;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_h') AND name = 'IdRegu'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_h DROP COLUMN IdRegu;
GO
