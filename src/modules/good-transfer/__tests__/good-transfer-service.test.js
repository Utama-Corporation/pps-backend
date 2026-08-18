// src/modules/good-transfer/__tests__/good-transfer-service.test.js

jest.mock("../../../core/config/db", () => {
  const mQuery = jest.fn();
  const MockRequest = jest.fn().mockImplementation(() => {
    const req = {
      input: () => req,
      query: mQuery,
    };
    return req;
  });

  const mBegin = jest.fn();
  const mCommit = jest.fn();
  const mRollback = jest.fn();

  const MockTransaction = jest.fn().mockImplementation(() => ({
    begin: mBegin,
    commit: mCommit,
    rollback: mRollback,
  }));

  const makeType = (name) => jest.fn(() => name);

  const mPool = { request: () => new MockRequest() };

  return {
    sql: {
      VarChar: makeType("VarChar"),
      Int: makeType("Int"),
      Date: makeType("Date"),
      NVarChar: makeType("NVarChar"),
      ISOLATION_LEVEL: { SERIALIZABLE: "SERIALIZABLE" },
      Request: MockRequest,
      Transaction: MockTransaction,
    },
    poolPromise: Promise.resolve(mPool),
    __mocks: { mQuery, MockRequest, MockTransaction, mBegin, mCommit, mRollback, mPool },
  };
});

const service = require("../good-transfer-service");

describe("good-transfer-service validation guards", () => {
  test("createGoodTransfer menolak jika idWarehouseAsal/Tujuan kosong", async () => {
    const result = await service.createGoodTransfer({
      idWarehouseAsal: null,
      idWarehouseTujuan: 2,
      labelCodes: ["A.0000000001-1"],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("createGoodTransfer menolak jika warehouse asal = tujuan", async () => {
    const result = await service.createGoodTransfer({
      idWarehouseAsal: 1,
      idWarehouseTujuan: 1,
      labelCodes: ["A.0000000001-1"],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("SAME_WAREHOUSE");
  });

  test("createGoodTransfer menolak jika labelCodes kosong", async () => {
    const result = await service.createGoodTransfer({
      idWarehouseAsal: 1,
      idWarehouseTujuan: 2,
      labelCodes: [],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("rejectGoodTransfer menolak jika alasanTolak kosong", async () => {
    const result = await service.rejectGoodTransfer({
      noTransfer: "GT.0000000001",
      alasanTolak: "",
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("acceptGoodTransfer menolak jika items kosong", async () => {
    const result = await service.acceptGoodTransfer({
      noTransfer: "GT.0000000001",
      items: [],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("acceptGoodTransfer menolak jika item tidak lengkap (kurang idLokasiTujuan)", async () => {
    const result = await service.acceptGoodTransfer({
      noTransfer: "GT.0000000001",
      items: [{ labelCode: "A.0000000001-1", blokTujuan: "A1" }],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });
});
