-- Retur v3: header tidak lagi mengurus konsep warehouse — dihapus dari
-- BJReturV3_h. Generate-label (BarangJadi/FurnitureWIP/RejectV2) sekarang
-- mengirim IdWarehouse=NULL (bukan lagi diambil dari header).

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('[dbo].[BJReturV3_h]') AND name = 'IdWarehouse'
)
BEGIN
    ALTER TABLE [dbo].[BJReturV3_h] DROP COLUMN [IdWarehouse];
END
GO
