const mockQuery = jest.fn();
const mockInput = jest.fn();
const mockRequest = jest.fn(() => ({
  input: mockInput,
  query: mockQuery,
}));

jest.mock("../../../../core/config/db", () => ({
  sql: { Date: "Date", Int: "Int" },
  poolPromise: Promise.resolve({ request: mockRequest }),
}));

const returnService = require("../return-production-service");

describe("fetchImportAsGsuAfterDate", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInput.mockReset();
    mockRequest.mockClear();
  });

  it("fetches only invoices strictly after the fixed cutoff date", async () => {
    const rows = [
      {
        InvoiceNumber: "INV-001",
        InvoiceType: "SR",
        ItemName: "ITEM A",
      },
      {
        InvoiceNumber: "INV-001",
        InvoiceType: "SR",
        ItemName: "ITEM B",
      },
    ];
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ total: 25 }] })
      .mockResolvedValueOnce({ recordset: rows });

    const result = await returnService.fetchImportAsGsuAfterDate(2, 10);

    expect(mockInput).toHaveBeenCalledWith("date", "Date", "2026-07-01");
    expect(mockInput).toHaveBeenCalledWith("offset", "Int", 10);
    expect(mockInput).toHaveBeenCalledWith("pageSize", "Int", 10);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT COUNT(1) AS total"),
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        "GROUP BY\n        ImportItems.InvoiceNumber,\n        ImportItems.InvoiceType",
      ),
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "CONVERT(date, B.InvoiceDate) > @date",
      ),
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("NOT EXISTS"),
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("R.Invoice = B.InvoiceNumber"),
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("OFFSET @offset ROWS"),
    );
    expect(result).toEqual({
      data: [
        {
          InvoiceNumber: "INV-001",
          InvoiceType: "SR",
          items: rows,
        },
      ],
      total: 25,
    });
  });

  it("keeps the existing exact-date filter unchanged", async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });

    await returnService.fetchImportAsGsuByDate("2026-07-28");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "CONVERT(date, B.InvoiceDate) = @date",
      ),
    );
    expect(mockQuery.mock.calls[0][0]).not.toContain("NOT EXISTS");
  });
});
