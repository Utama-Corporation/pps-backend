-- ================================================================
-- Migration: tambah nilai 'SHIPPED' ke enum Status GoodsTransfer_h
-- ================================================================
-- Lifecycle Goods Transfer model Ascend:
--   IN_TRANSIT  -> header dibuat Ascend; PPS mengisi label (scan) untuk
--                  memenuhi baris permintaan _d.
--   SHIPPED     -> operator PPS menekan tombol "Kirim" setelah SEMUA baris
--                  permintaan terpenuhi. Scan/undo dikunci setelah ini.
--   RECEIVED    -> semua label diterima di warehouse tujuan (fitur In Transit).
--   REJECTED / CANCELLED -> tidak berubah.
--
-- CATATAN: kolom Status pada GoodsTransfer_h aslinya milik Ascend. Dengan
-- perubahan ini PPS ikut menulis Status (SHIPPED saat kirim, RECEIVED saat
-- terima). Tim Ascend harus memastikan sinkronisasi ulang tidak menimpa
-- Status transfer yang sudah SHIPPED/RECEIVED oleh PPS.
-- ================================================================

DECLARE @cn sysname;
SELECT @cn = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('dbo.GoodsTransfer_h')
  AND cc.definition LIKE '%[[]Status]%';

IF @cn IS NOT NULL
    EXEC('ALTER TABLE dbo.GoodsTransfer_h DROP CONSTRAINT ' + @cn);
GO

ALTER TABLE dbo.GoodsTransfer_h WITH CHECK
    ADD CONSTRAINT CK_GoodsTransfer_h_Status
    CHECK (Status IN ('IN_TRANSIT', 'SHIPPED', 'RECEIVED', 'REJECTED', 'CANCELLED'));
GO
