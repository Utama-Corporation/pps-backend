/* ===== [dbo].[tr_Audit_GoodsTransferItemScan_d] ON [dbo].[GoodsTransferItemScan_d] ===== */
-- =============================================
-- TRIGGER: tr_Audit_GoodsTransferItemScan_d
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_GoodsTransferItemScan_d]
ON [dbo].[GoodsTransferItemScan_d]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @actor nvarchar(128) =
    COALESCE(
      CONVERT(nvarchar(128), TRY_CONVERT(int, SESSION_CONTEXT(N'actor_id'))),
      CAST(SESSION_CONTEXT(N'actor') AS nvarchar(128)),
      SUSER_SNAME()
    );

  DECLARE @rid nvarchar(64) =
    CAST(SESSION_CONTEXT(N'request_id') AS nvarchar(64));

  /* =====================
     INSERT
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'INSERT',
    'GoodsTransferItemScan_d',
    @actor,
    @rid,
    CONCAT('{"IdScan":"', i.IdScan, '"}'),
    NULL,
    (
      SELECT
        i.IdScan, i.NoTransfer, i.KodeKategori, i.IdJenis,
        i.LabelCode, i.Pcs, i.IsReceived, i.BlokTujuan, i.IdLokasiTujuan,
        i.IdUsernameScan, i.DateTimeScan, i.IdUsernameTerima, i.DateTimeTerima
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  LEFT JOIN deleted d ON d.IdScan = i.IdScan
  WHERE d.IdScan IS NULL;

  /* =====================
     UPDATE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'UPDATE',
    'GoodsTransferItemScan_d',
    @actor,
    @rid,
    CONCAT('{"IdScan":"', i.IdScan, '"}'),
    (
      SELECT
        d.IdScan, d.NoTransfer, d.KodeKategori, d.IdJenis,
        d.LabelCode, d.Pcs, d.IsReceived, d.BlokTujuan, d.IdLokasiTujuan,
        d.IdUsernameScan, d.DateTimeScan, d.IdUsernameTerima, d.DateTimeTerima
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    (
      SELECT
        i.IdScan, i.NoTransfer, i.KodeKategori, i.IdJenis,
        i.LabelCode, i.Pcs, i.IsReceived, i.BlokTujuan, i.IdLokasiTujuan,
        i.IdUsernameScan, i.DateTimeScan, i.IdUsernameTerima, i.DateTimeTerima
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  JOIN deleted d ON d.IdScan = i.IdScan;

  /* =====================
     DELETE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'DELETE',
    'GoodsTransferItemScan_d',
    @actor,
    @rid,
    CONCAT('{"IdScan":"', d.IdScan, '"}'),
    (
      SELECT
        d.IdScan, d.NoTransfer, d.KodeKategori, d.IdJenis,
        d.LabelCode, d.Pcs, d.IsReceived, d.BlokTujuan, d.IdLokasiTujuan,
        d.IdUsernameScan, d.DateTimeScan, d.IdUsernameTerima, d.DateTimeTerima
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    NULL
  FROM deleted d
  LEFT JOIN inserted i ON i.IdScan = d.IdScan
  WHERE i.IdScan IS NULL;
END;
