-- ================================================================
-- Migration: Add HasBeenPrinted ke FurnitureWIPPartial & BarangJadiPartial
-- ================================================================
-- Kedua tabel partial ini sebelumnya cuma punya (kode, parent, Pcs) tanpa
-- kolom pelacak cetak sama sekali. Dibutuhkan supaya label partial (BC./
-- BL.) bisa dicetak dengan mekanisme yang sama persis dengan label induk
-- (FurnitureWIP/BarangJadi) — watermark "COPY n" & badge jumlah cetak.

ALTER TABLE dbo.FurnitureWIPPartial
    ADD HasBeenPrinted INT NOT NULL CONSTRAINT DF_FurnitureWIPPartial_HasBeenPrinted DEFAULT (0);
GO

ALTER TABLE dbo.BarangJadiPartial
    ADD HasBeenPrinted INT NOT NULL CONSTRAINT DF_BarangJadiPartial_HasBeenPrinted DEFAULT (0);
GO
