import { describe, expect, it } from "vitest";
import { parseRss } from "../src/rss.js";

it("parses Goodreads RSS item fields", () => {
  const xml = `<rss><channel><item>
    <book_id>12</book_id><title><![CDATA[A &amp; B]]></title>
    <author_name>Writer</author_name><isbn13>9781234567890</isbn13>
    <user_rating>5</user_rating><user_read_at>Mon, 01 Jun 2026 00:00:00 -0700</user_read_at>
  </item></channel></rss>`;
  expect(parseRss(xml, "read")).toEqual([
    expect.objectContaining({
      goodreadsId: "12",
      title: "A & B",
      author: "Writer",
      isbn13: "9781234567890",
      rating: 5,
      shelf: "read",
    }),
  ]);
});
