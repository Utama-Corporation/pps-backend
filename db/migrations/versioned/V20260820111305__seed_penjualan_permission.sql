-- ================================================================
-- Migration: Seed permission "penjualan:*" untuk modul Penjualan baru
-- ================================================================
-- Modul baru (belum ada kode legacy untuk di-copy seperti good_transfer),
-- jadi cukup daftarkan kode ke master list. Assignment ke user group
-- dilakukan lewat UI admin permission yang sudah ada.
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).

INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('penjualan:read',   'Read Penjualan'),
    ('penjualan:create', 'Scan Label Penjualan')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO
