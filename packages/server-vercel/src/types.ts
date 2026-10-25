export interface StoredBook {
  goodreadsId?: string;
  title: string;
  author: string;
  isbn?: string;
  isbn13?: string;
  shelf: string;
  rating?: number;
  averageRating?: number;
  dateRead?: string;
  dateAdded?: string;
  review?: string;
  source: "csv" | "rss";
}

export interface GoodreadsProfile {
  authUserId: string;
  goodreadsUserId: string;
  profileUrl: string;
  encryptedRssKey: string | null;
}
