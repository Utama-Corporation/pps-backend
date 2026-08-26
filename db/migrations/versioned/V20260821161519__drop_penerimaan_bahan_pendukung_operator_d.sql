-- ================================================================
-- Migration: Drop PenerimaanBahanPendukungOperator_d
-- ================================================================
-- Modul Penerimaan Bahan Pendukung tidak butuh pencatatan operator
-- individual — cukup Tim (IdTim) di header. Tabel ini beserta seluruh
-- kode yang mengisi/membaca operator untuk modul ini dihapus.
-- ================================================================
IF OBJECT_ID('dbo.PenerimaanBahanPendukungOperator_d', 'U') IS NOT NULL
    DROP TABLE dbo.PenerimaanBahanPendukungOperator_d;
GO
