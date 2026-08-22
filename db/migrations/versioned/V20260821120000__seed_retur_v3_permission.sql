-- ================================================================
-- Migration: Seed permission "retur:*" untuk modul Retur V3
-- ================================================================
-- Modul baru (belum ada kode legacy untuk di-copy seperti good_transfer),
-- jadi cukup daftarkan kode ke master list. Assignment ke user group
-- dilakukan lewat UI admin permission yang sudah ada.
--
-- retur:create/update/delete — Admin (buat data retur, edit header, scan
-- turnover, tandai selesai, generate label).
-- retur:decide — Sales (keputusan DIGANTI/TIDAK_DIGANTI, dan menambah
-- target barang pengganti yang jadi bagian dari keputusan itu).
--
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('retur:create', 'Buat Retur'),
    ('retur:update', 'Update Retur (edit, scan turnover, tandai selesai, generate label)'),
    ('retur:delete', 'Hapus Retur'),
    ('retur:decide', 'Putuskan Retur (diganti / tidak diganti, tambah target)')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO
