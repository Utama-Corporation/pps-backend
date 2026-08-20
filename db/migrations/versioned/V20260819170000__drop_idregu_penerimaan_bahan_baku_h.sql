-- ================================================================
-- Migration: Hapus IdRegu dari PenerimaanBahanBaku_h.
-- IdTim sudah mewakili siapa yang mengerjakan, jadi IdRegu jadi
-- redundan (operator individual tetap ada di
-- PenerimaanBahanBakuOperator_d). Header sekarang: Tim + Operator,
-- bukan lagi Regu + Operator.
-- ================================================================
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstRegu'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP CONSTRAINT FK_PenerimaanBahanBaku_h_MstRegu;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IdRegu'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP COLUMN IdRegu;
GO
