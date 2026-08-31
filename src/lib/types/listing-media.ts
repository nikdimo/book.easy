export type ListingMediaTypeValue = "IMAGE" | "VIDEO";

export interface ListingMediaItem {
  id?: string;
  url: string;
  mediaType: ListingMediaTypeValue;
  isPanorama?: boolean;
  alt?: string | null;
}
