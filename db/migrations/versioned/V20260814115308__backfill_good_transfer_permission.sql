-- ================================================================
-- Migration: Backfill permission "good_transfer:*" (format resource:action)
-- ================================================================
-- Endpoint /api/good-transfer/* memakai kode "good_transfer:read/create/update"
-- (bukan kode legacy GT-01..GT-04 yang sudah ada di MstPermissionList untuk
-- fitur ini). Migration ini:
--   1) Mendaftarkan kode baru ke MstPermissionList (master daftar permission).
--   2) Meng-assign kode baru ke MstUserGroupPermission, dengan meng-copy
--      IdUGroup + Allow dari assignment GT-01..GT-04 yang sudah ada, supaya
--      group yang sebelumnya diberi akses Goods Transfer (Admin, Power User,
--      Goods Transfer Controller, Cabinet Material Full, Barang Jadi Retur
--      Full/Std, Viewer, dst) tetap punya akses yang setara di bawah nama
--      permission yang baru.
-- Idempotent: aman dijalankan ulang (NOT EXISTS guard).

-- 1) Daftarkan ke master permission list
INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('good_transfer:read',   'Read Good Transfer'),
    ('good_transfer:create', 'Create Good Transfer'),
    ('good_transfer:update', 'Update Good Transfer'),
    ('good_transfer:delete', 'Delete Good Transfer')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO

-- 2) Copy assignment dari kode legacy GT-01..GT-04 ke kode baru, per group
INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT gp.IdUGroup, mapping.NewPermission, gp.Allow
FROM dbo.MstUserGroupPermission gp
INNER JOIN (VALUES
    ('GT-01', 'good_transfer:read'),
    ('GT-02', 'good_transfer:create'),
    ('GT-03', 'good_transfer:update'),
    ('GT-04', 'good_transfer:delete')
) AS mapping(OldPermission, NewPermission)
    ON mapping.OldPermission = gp.NoPermission
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.MstUserGroupPermission existing
    WHERE existing.IdUGroup = gp.IdUGroup
      AND existing.NoPermission = mapping.NewPermission
);
GO
