-- ================================================================
-- Migration: repoint FK InjectProduksi_h.IdMesin -> MstMesinInject
-- ================================================================
-- Sebelumnya InjectProduksi_h.IdMesin punya FK ke MstMesin
-- (FK_InjectProduksi_h__PK_MstMesin). Karena mesin inject kini
-- didaftarkan di MstMesinInject (bukan lagi MstMesin), INSERT
-- produksi untuk mesin baru gagal dengan error 547.
--
-- FK lama di-drop, diganti FK baru ke MstMesinInject(IdMesin).
-- Dipakai WITH NOCHECK: baris historis TIDAK divalidasi (bisa ada
-- IdMesin lama yang belum termigrasi ke MstMesinInject); hanya
-- INSERT/UPDATE baru yang dicek.
--
-- Idempotent: aman dijalankan ulang.
-- ================================================================

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_InjectProduksi_h__PK_MstMesin'
      AND parent_object_id = OBJECT_ID('dbo.InjectProduksi_h')
)
    ALTER TABLE dbo.InjectProduksi_h
        DROP CONSTRAINT FK_InjectProduksi_h__PK_MstMesin;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_InjectProduksi_h_MstMesinInject'
      AND parent_object_id = OBJECT_ID('dbo.InjectProduksi_h')
)
    ALTER TABLE dbo.InjectProduksi_h WITH NOCHECK
        ADD CONSTRAINT FK_InjectProduksi_h_MstMesinInject
        FOREIGN KEY (IdMesin) REFERENCES dbo.MstMesinInject (IdMesin);
GO
