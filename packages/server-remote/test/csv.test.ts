import { describe, expect, it } from "vitest";
import { parseGoodreadsCsv } from "../src/csv.js";

describe("CSV import", () => {
  it("handles quoted commas, reviews and Goodreads ISBN cells", () => {
    const csv = [
      "Book Id,Title,Author,ISBN,Exclusive Shelf,My Rating,My Review",
      '7,"A Book, Revised","Doe, Jane",1234567890,read,4,"Loved it, truly"',
    ].join("\n");
    expect(parseGoodreadsCsv(csv)).toEqual([
      expect.objectContaining({
        goodreadsId: "7",
        title: "A Book, Revised",
        author: "Doe, Jane",
        isbn: "1234567890",
        shelf: "read",
        rating: 4,
        review: "Loved it, truly",
      }),
    ]);
  });

  it("rejects non-Goodreads CSV", () => {
    expect(() => parseGoodreadsCsv("Name,Value\nx,y")).toThrow("Goodreads");
  });
});
