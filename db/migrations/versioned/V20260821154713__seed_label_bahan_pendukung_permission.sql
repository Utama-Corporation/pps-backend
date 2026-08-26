-- ================================================================
-- Migration: Seed permission "label_bahanpendukung:*" untuk modul
-- Label Bahan Pendukung
-- ================================================================
-- Modul baru, mengikuti pola label_furniturewip:* — cukup daftarkan
-- kode ke master list. Assignment ke user group lewat UI admin
-- permission yang sudah ada.
--
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).
-- ================================================================
INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('label_bahanpendukung:read', 'Lihat Label Bahan Pendukung'),
    ('label_bahanpendukung:create', 'Buat Label Bahan Pendukung'),
    ('label_bahanpendukung:update', 'Update Label Bahan Pendukung (edit, print)'),
    ('label_bahanpendukung:delete', 'Hapus Label Bahan Pendukung')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO
