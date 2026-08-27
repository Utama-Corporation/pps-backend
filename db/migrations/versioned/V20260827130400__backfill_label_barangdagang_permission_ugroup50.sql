-- ================================================================
-- Migration: Backfill permission "label_barangdagang:*" untuk IdUGroup 50
-- ================================================================
-- Grant ke group yang sama seperti label_bahanpendukung:* (lihat
-- V20260827120000__backfill_label_bahanpendukung_permission_ugroup50.sql).
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).
-- ================================================================
INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT 50, v.NoPermission, 1
FROM (VALUES
    ('label_barangdagang:read'),
    ('label_barangdagang:create'),
    ('label_barangdagang:update'),
    ('label_barangdagang:delete')
) AS v(NoPermission)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.MstUserGroupPermission existing
    WHERE existing.IdUGroup = 50
      AND existing.NoPermission = v.NoPermission
);
GO
