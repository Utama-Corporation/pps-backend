-- ================================================================
-- Migration: Seed permission "label_barangdagang:*" untuk modul
-- Label Barang Dagang
-- ================================================================
-- Modul baru, mengikuti pola label_bahanpendukung:* — cukup daftarkan
-- kode ke master list. Assignment ke user group lewat migration backfill
-- terpisah (lihat V20260827130400).
--
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).
-- ================================================================
INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('label_barangdagang:read', 'Lihat Label Barang Dagang'),
    ('label_barangdagang:create', 'Buat Label Barang Dagang'),
    ('label_barangdagang:update', 'Update Label Barang Dagang (edit, print)'),
    ('label_barangdagang:delete', 'Hapus Label Barang Dagang')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO
