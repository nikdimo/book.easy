-- CreateEnum
CREATE TYPE "ListingMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "ListingImage" ADD COLUMN     "mediaType" "ListingMediaType" NOT NULL DEFAULT 'IMAGE';
