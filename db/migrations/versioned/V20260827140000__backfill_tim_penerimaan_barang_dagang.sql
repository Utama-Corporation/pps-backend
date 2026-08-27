-- ================================================================
-- Migration: Backfill tim penerimaan barang dagang (dummy testing)
-- ================================================================
-- Mengikuti pola tim penerimaan bahan pendukung/bahan baku yang sudah ada
-- (NamaTim "Tim Penerimaan A", Keterangan "Data dummy untuk testing").
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).
-- ================================================================
INSERT INTO dbo.MstTimPenerimaan (NamaTim, Keterangan, Aktif, TipeModul)
SELECT 'Tim Penerimaan A', 'Data dummy untuk testing', 1, 'BARANG_DAGANG'
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstTimPenerimaan
    WHERE NamaTim = 'Tim Penerimaan A' AND TipeModul = 'BARANG_DAGANG'
);
GO
