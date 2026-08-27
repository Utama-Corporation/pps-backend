-- ================================================================
-- Migration: Create PenerimaanBarangDagang_d
-- Pengikat tipis (bukan tabel detail) — PK di NoBarangDagang sendiri
-- karena sudah unik 1:1, mirror struktur FINAL PenerimaanBahanPendukung_d
-- (bukan versi awalnya yang masih punya breakdown kolom).
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBarangDagang_d] (
    [NoBarangDagang]  VARCHAR(50)   NOT NULL,
    [NoPenerimaan]    VARCHAR(20)   NOT NULL,
    [CreateBy]        VARCHAR(100)  NULL,

    CONSTRAINT [PK_PenerimaanBarangDagang_d] PRIMARY KEY CLUSTERED ([NoBarangDagang] ASC),
    CONSTRAINT [FK_PenerimaanBarangDagang_d_BarangDagang]
        FOREIGN KEY ([NoBarangDagang]) REFERENCES [dbo].[BarangDagang] ([NoBarangDagang]),
    CONSTRAINT [FK_PenerimaanBarangDagang_d_PenerimaanBarangDagang_h]
        FOREIGN KEY ([NoPenerimaan]) REFERENCES [dbo].[PenerimaanBarangDagang_h] ([NoPenerimaan])
);
GO
