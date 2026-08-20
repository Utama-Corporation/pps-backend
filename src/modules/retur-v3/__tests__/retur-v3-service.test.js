const mockQuery = jest.fn();
const mockInput = jest.fn(function input() {
  return this;
});
const mockRequestInstance = { input: mockInput, query: mockQuery };
const mockRequest = jest.fn(() => mockRequestInstance);

jest.mock("../../../core/config/db", () => {
  const sql = {
    VarChar: jest.fn((n) => `VarChar(${n})`),
    NVarChar: Object.assign(jest.fn((n) => `NVarChar(${n})`), { MAX: "NVarChar(MAX)" }),
    Int: "Int",
    Date: "Date",
    DateTime: "DateTime",
    Decimal: jest.fn((p, s) => `Decimal(${p},${s})`),
    Bit: "Bit",
    Transaction: jest.fn().mockImplementation(() => ({
      begin: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
    })),
    Request: jest.fn().mockImplementation(() => mockRequestInstance),
    ISOLATION_LEVEL: { SERIALIZABLE: "SERIALIZABLE" },
  };
  return {
    sql,
    poolPromise: Promise.resolve({ request: mockRequest }),
  };
});

const { sql } = require("../../../core/config/db");
const service = require("../retur-v3-service");

const ctx = { actorId: 1, actorUsername: "tester", requestId: "rid-1" };

beforeEach(() => {
  mockQuery.mockReset();
  mockInput.mockClear();
  mockRequest.mockClear();
  sql.Request.mockClear();
});

describe("createHeader validation", () => {
  it("throws badReq when idPembeli is missing", async () => {
    await expect(
      service.createHeader({ tanggal: "2026-08-13" }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws badReq when tanggal is missing", async () => {
    await expect(
      service.createHeader({ idPembeli: 1 }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("addItems blocked once header is not PENDING", () => {
  it("throws conflict if header StatusRetur != PENDING", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // applyAuditContext session context exec
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }); // header select

    await expect(
      service.addItems(
        "RV.0000000001",
        [{ kodeKategori: "barangjadi", idJenis: 1, pcs: 5, kategoriInput: "BAGUS" }],
        ctx,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("decide transition guard", () => {
  it("rejects double-decide (header already decided)", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }); // header select

    await expect(
      service.decide("RV.0000000001", "TIDAK_DIGANTI", ctx),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects invalid decision value", async () => {
    await expect(
      service.decide("RV.0000000001", "MAYBE", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects deciding a header with no items", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "PENDING" }] }) // header select
      .mockResolvedValueOnce({ recordset: [{ cnt: 0 }] }); // item count

    await expect(
      service.decide("RV.0000000001", "DIGANTI", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("generate-reject requires berat + idReject", () => {
  it("throws badReq when berat is missing", async () => {
    const { generateRejectLabel } = require("../handlers/generate-reject.handler");
    await expect(
      generateRejectLabel("RV.0000000001", 1, { idReject: 2 }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws badReq when idReject is missing", async () => {
    const { generateRejectLabel } = require("../handlers/generate-reject.handler");
    await expect(
      generateRejectLabel("RV.0000000001", 1, { berat: 3 }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("generateLabel idempotency", () => {
  it("throws conflict when item already has GeneratedLabelCode", async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          IdItem: 1,
          NoRetur: "RV.0000000001",
          KodeKategori: "barangjadi",
          KategoriInput: "BAGUS",
          IdJenis: 10,
          Pcs: 5,
          GeneratedLabelCode: "BA.0000000099",
        },
      ],
    }); // exports.generateLabel's initial item lookup (pool.request(), not tx)

    mockQuery.mockResolvedValueOnce({ recordset: [] }); // audit context inside handler
    mockQuery.mockResolvedValueOnce({
      recordset: [{ StatusRetur: "TIDAK_DIGANTI", IdWarehouse: 1 }],
    }); // header select inside handler
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          IdItem: 1,
          NoRetur: "RV.0000000001",
          KodeKategori: "barangjadi",
          KategoriInput: "BAGUS",
          IdJenis: 10,
          Pcs: 5,
          GeneratedLabelCode: "BA.0000000099",
        },
      ],
    }); // item re-select (UPDLOCK) inside handler

    await expect(
      service.generateLabel("RV.0000000001", 1, {}, ctx),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("turnover scan enforcement", () => {
  it("rejects scan when label jenis doesn't match item exactly", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }) // header select
      .mockResolvedValueOnce({
        recordset: [
          {
            IdItem: 1,
            NoRetur: "RV.0000000001",
            KodeKategori: "barangjadi",
            IdJenis: 10,
            Pcs: 5,
          },
        ],
      }) // item select
      .mockResolvedValueOnce({
        recordset: [
          { Code: "BA.0000000123", IdJenis: 999, Pcs: 3, DateUsage: null },
        ],
      }); // label select (mismatched IdJenis)

    await expect(
      service.scanTurnover("RV.0000000001", 1, "BA.0000000123", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects scan when label pcs overshoots remaining target (no partial consumption)", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }) // header select
      .mockResolvedValueOnce({
        recordset: [
          {
            IdItem: 1,
            NoRetur: "RV.0000000001",
            KodeKategori: "barangjadi",
            IdJenis: 10,
            Pcs: 5,
          },
        ],
      }) // item select
      .mockResolvedValueOnce({
        recordset: [
          { Code: "BA.0000000123", IdJenis: 10, Pcs: 8, DateUsage: null },
        ],
      }) // label select (matches jenis, pcs=8 > target 5)
      .mockResolvedValueOnce({ recordset: [{ ScannedPcs: 0 }] }); // prior scanned sum

    await expect(
      service.scanTurnover("RV.0000000001", 1, "BA.0000000123", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("turnover scan auto-detect (single-button scan)", () => {
  it("rejects when no item in this retur matches the scanned label's kategori+jenis", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }) // header select
      .mockResolvedValueOnce({
        recordset: [
          { Code: "BA.0000000123", IdJenis: 10, Pcs: 3, DateUsage: null },
        ],
      }) // BarangJadi label lookup (found)
      .mockResolvedValueOnce({ recordset: [] }); // no matching/available candidate items

    await expect(
      service.scanTurnoverAuto("RV.0000000001", "BA.0000000123", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when the matched item's remaining pcs is less than the label's pcs", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({ recordset: [{ StatusRetur: "DIGANTI" }] }) // header select
      .mockResolvedValueOnce({
        recordset: [
          { Code: "BA.0000000123", IdJenis: 10, Pcs: 8, DateUsage: null },
        ],
      }) // BarangJadi label lookup (found, pcs=8)
      .mockResolvedValueOnce({
        recordset: [{ IdItem: 1, Pcs: 5, ScannedPcs: 0 }],
      }); // candidate item, remaining=5 < labelPcs=8

    await expect(
      service.scanTurnoverAuto("RV.0000000001", "BA.0000000123", ctx),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("flagKirim", () => {
  it("blocks flag-kirim until all items are fulfilled", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({
        recordset: [{ StatusRetur: "DIGANTI", FlagKirim: false }],
      }) // header select
      .mockResolvedValueOnce({
        recordset: [{ IdItem: 1, Pcs: 5, ScannedPcs: 3 }],
      }); // unfulfilled items query

    await expect(
      service.flagKirim("RV.0000000001", ctx),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("is idempotent: rejects when already flagged", async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // audit context
      .mockResolvedValueOnce({
        recordset: [{ StatusRetur: "DIGANTI", FlagKirim: true }],
      }); // header select

    await expect(
      service.flagKirim("RV.0000000001", ctx),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
