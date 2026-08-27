-- ================================================================
-- Migration: Backfill permission "label_bahanpendukung:*" untuk IdUGroup 50
-- ================================================================
-- Permission "label_bahanpendukung:read/create/update/delete" sudah
-- terdaftar di MstPermissionList (lihat
-- V20260821154713__seed_label_bahan_pendukung_permission.sql) tapi belum
-- pernah di-assign ke group manapun — modul penerimaan bahan pendukung
-- (dan modul label bahan pendukung itu sendiri) sekarang memakai permission
-- ini langsung. Grant ke IdUGroup 50 di sini.
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).
-- ================================================================
INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT 50, v.NoPermission, 1
FROM (VALUES
    ('label_bahanpendukung:read'),
    ('label_bahanpendukung:create'),
    ('label_bahanpendukung:update'),
    ('label_bahanpendukung:delete')
) AS v(NoPermission)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.MstUserGroupPermission existing
    WHERE existing.IdUGroup = 50
      AND existing.NoPermission = v.NoPermission
);
GO
