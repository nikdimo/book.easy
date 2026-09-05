import { describe, expect, it } from "vitest";
import {
  channelCapabilities,
  channelPostText,
  cityHashtag,
  messagingShareUrl,
  type ChannelPostLines,
} from "@/lib/promotion/channels";

const lines: ChannelPostLines = {
  customMessage: "Last-minute opening after a cancellation!",
  title: "Bright apartment with sea view",
  description: "Wake up to the sound of the sea.\n\nQuiet complex of eight homes.",
  guestsLine: "👥 Sleeps up to 4 guests",
  priceLine: "💶 From €110 per night",
  availabilityLine: "📅 Available: 21–28 September",
  freshnessLine: "Availability checked 30 August — dates can be taken at any time.",
  callToAction: "Check availability and send an inquiry:",
  linkInBioLine: "🔗 Link in bio",
  propertyUrl: "https://lingerhomes.com/properties/sea-view?checkIn=2026-09-21",
  city: "Nova Mudanja",
};

describe("channel post text", () => {
  it("gives Facebook the call to action and the link", () => {
    const post = channelPostText("FACEBOOK", lines);

    expect(post).toContain("Check availability and send an inquiry:");
    expect(post).toContain(lines.propertyUrl);
    expect(post).not.toContain("Link in bio");
    expect(post).not.toContain("#");
  });

  it("takes the dead link out of an Instagram caption and points at the bio", () => {
    const caption = channelPostText("INSTAGRAM", lines);

    // The whole reason this channel needs its own rendering: a caption cannot linkify,
    // so a URL there is characters nobody can follow.
    expect(caption).not.toContain(lines.propertyUrl);
    expect(caption).not.toContain("Check availability and send an inquiry:");
    expect(caption).toContain("🔗 Link in bio");
    // Everything that still works is untouched.
    expect(caption).toContain("Bright apartment with sea view");
    expect(caption).toContain("👥 Sleeps up to 4 guests");
    expect(caption).toContain("📅 Available: 21–28 September");
  });

  it("ends an Instagram caption with the city as its one hashtag", () => {
    expect(channelPostText("INSTAGRAM", lines).trimEnd()).toMatch(
      /#NovaMudanja$/,
    );
  });

  it("reduces the link channel to the link", () => {
    expect(channelPostText("LINK", lines)).toBe(lines.propertyUrl);
  });

  it("gives the messengers the same post Facebook gets", () => {
    expect(channelPostText("MESSAGING", lines)).toBe(
      channelPostText("FACEBOOK", lines),
    );
  });
});

describe("city hashtag", () => {
  it("closes up spaces and keeps the host's own script", () => {
    expect(cityHashtag("Nova Mudanja")).toBe("#NovaMudanja");
    expect(cityHashtag("Нова Мудања")).toBe("#НоваМудања");
  });

  it("declines rather than emitting a tag that ends at its punctuation", () => {
    // "#Sveti" is not the place the host named, and a truncated tag reads as a typo.
    expect(cityHashtag("Sveti Nikole, Ohrid")).toBeNull();
    expect(cityHashtag("")).toBeNull();
    expect(cityHashtag(null)).toBeNull();
  });
});

describe("messaging share links", () => {
  const text = "Come and stay\n\nhttps://lingerhomes.com/properties/sea-view";
  const url = "https://lingerhomes.com/properties/sea-view";

  it("carries the whole post in the WhatsApp link, so nothing is copied", () => {
    const share = messagingShareUrl("WHATSAPP", text, url);
    expect(share.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(share.split("text=")[1])).toBe(text);
  });

  it("uses Viber's scheme, which is all Viber offers", () => {
    expect(messagingShareUrl("VIBER", text, url)).toContain("viber://forward?text=");
  });

  it("does not let Telegram print the property link twice", () => {
    // Telegram renders `text` above its own preview of `url`. Leaving the URL at the
    // end of the body puts the same address in the message twice.
    const share = new URL(messagingShareUrl("TELEGRAM", text, url));
    expect(share.searchParams.get("url")).toBe(url);
    expect(share.searchParams.get("text")).toBe("Come and stay");
  });
});

describe("capabilities", () => {
  it("names Instagram as the only channel needing a file in hand", () => {
    expect(channelCapabilities("INSTAGRAM").needsMediaFile).toBe(true);
    for (const channel of ["FACEBOOK", "MESSAGING", "LINK"] as const) {
      expect(channelCapabilities(channel).needsMediaFile, channel).toBe(false);
    }
  });

  it("names the messengers as the only channel that needs no clipboard", () => {
    expect(channelCapabilities("MESSAGING").prefillsText).toBe(true);
    expect(channelCapabilities("FACEBOOK").prefillsText).toBe(false);
  });

  it("keeps destinations to the one channel that has any", () => {
    expect(channelCapabilities("FACEBOOK").hasDestinations).toBe(true);
    expect(channelCapabilities("INSTAGRAM").hasDestinations).toBe(false);
  });
});
