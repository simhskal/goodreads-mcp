import { describe, expect, it, vi } from "vitest";
import {
  createLibrary,
  fetchGoodreadsRss,
  fetchOpenLibraryBook,
  getCurrentlyReading,
  getReadingList,
  parseGoodreadsCsv,
  parseGoodreadsRss,
  readingStats,
  searchLibrary,
} from "../src/index.js";

const rss = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[A &amp; B]]></title><author_name>Jane Doe</author_name>
  <book_id>42</book_id><isbn>123456789X</isbn><isbn13>9781234567890</isbn13>
  <user_rating>4</user_rating><average_rating>4.25</average_rating>
  <user_read_at>Mon, 03 Feb 2025 12:00:00 -0800</user_read_at>
  <book_num_pages>320</book_num_pages><link>https://goodreads.com/book/show/42</link>
</item></channel></rss>`;

const csv = `Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Read Count,Owned Copies
42,"A, B",Jane Doe,,123456789X,9781234567890,5,4.25,Press,Paperback,320,2024,2024,2025/02/03,2025/01/01,"favorites, sci-fi",read,"Loved it, truly",1,0
43,Current Book,Other Author,,,,0,4.0,,,200,2025,2025,,2025/02/04,,currently-reading,,0,0`;

describe("Goodreads inputs", () => {
  it("parses RSS books and XML entities", () => {
    const [book] = parseGoodreadsRss(rss, "read");
    expect(book).toMatchObject({
      id: "goodreads:42",
      title: "A & B",
      author: "Jane Doe",
      rating: 4,
      pages: 320,
      shelf: "read",
      source: "rss",
    });
    expect(book?.dateRead).toBe("2025-02-03T20:00:00.000Z");
  });

  it("fetches RSS through an injectable fetch implementation", async () => {
    const fetcher = vi.fn(async () => new Response(rss));
    const books = await fetchGoodreadsRss({
      userId: "123",
      key: "secret",
      shelf: "read",
      fetch: fetcher,
    });
    expect(books).toHaveLength(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/123?key=secret&shelf=read",
    );
  });

  it("parses Goodreads CSV including quoted commas", () => {
    const books = parseGoodreadsCsv(csv);
    expect(books[0]).toMatchObject({
      title: "A, B",
      review: "Loved it, truly",
      exclusiveShelf: "read",
      pages: 320,
    });
    expect(books[1]?.shelf).toBe("currently-reading");
  });
});

describe("library services", () => {
  const books = parseGoodreadsCsv(csv);
  const library = createLibrary(books);

  it("queries shelves and text", () => {
    expect(getReadingList(library, "read")).toHaveLength(1);
    expect(getReadingList(library, "favorites")).toHaveLength(1);
    expect(getCurrentlyReading(library)).toHaveLength(1);
    expect(searchLibrary(library, "jane a")).toHaveLength(1);
  });

  it("calculates yearly stats", () => {
    expect(readingStats(library, 2025)).toMatchObject({
      booksRead: 1,
      pagesRead: 320,
      ratedBooks: 1,
      averageRating: 5,
      authors: 1,
    });
    expect(readingStats(library, 2025).booksPerMonth[1]).toBe(1);
  });
});

describe("Open Library", () => {
  it("maps API metadata", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            "ISBN:9781234567890": {
              title: "Metadata Title",
              authors: [{ name: "Author" }],
              cover: { large: "https://covers.example/book.jpg" },
              number_of_pages: 321,
              url: "/books/OL1M/Metadata_Title",
            },
          }),
        ),
    );
    await expect(
      fetchOpenLibraryBook("978-1-234-56789-0", { fetch: fetcher }),
    ).resolves.toMatchObject({
      title: "Metadata Title",
      pages: 321,
      authors: ["Author"],
    });
  });
});
