-- Party composition on a booking.
--
-- The picker has always collected adults, children, infants and pets, carried them on
-- the URL and printed them back to the guest — and then dropped everything but the sum
-- of adults + children at submit. A host reading "3 guests" had no way to learn that a
-- cot and a dog were coming, which is precisely the part of a party they need to plan
-- for.
--
-- Strictly additive:
--   * `guestCount` is untouched and keeps its meaning — adults + children, the number
--     every pricing, capacity and search rule already compares against `maxGuests`.
--   * The four new columns are nullable and there is NO backfill. A booking taken
--     before this migration has no record of the party, and NULL is how that is said.
--     Writing 0 into `infants`/`pets` for those rows would assert that the guest
--     brought neither, which nobody ever asked them; readers show such a booking as
--     the plain guest count it has always been.
--   * `adults` is the discriminator readers use: every booking written from now on
--     carries at least one adult, so a NULL `adults` means "party not recorded".

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "children" INTEGER,
ADD COLUMN     "infants" INTEGER,
ADD COLUMN     "pets" INTEGER;
