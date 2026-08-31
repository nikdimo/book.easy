import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The steps reach the server actions only through handlers a static render never fires,
// but the import graph pulls next-auth in through a module vitest's node environment
// cannot resolve. Stubbed the way the sibling promotion tests stub it.
vi.mock("@/lib/actions/facebook-promotion.actions", () => ({
  getPromotionWorkspaceAction: vi.fn(),
  listFacebookDestinationsAction: vi.fn(),
  checkPromotionRangeAction: vi.fn(),
  createFacebookDestinationAction: vi.fn(),
  updateFacebookDestinationAction: vi.fn(),
  deleteFacebookDestinationAction: vi.fn(),
  markFacebookDestinationUsedAction: vi.fn(),
}));

import { PromotionStepWhere } from "@/components/host/promotion/promotion-step-where";
import { PromotionStepPost } from "@/components/host/promotion/promotion-step-post";
import type { HostFacebookDestinationView } from "@/lib/services/facebook-destination.service";

const group: HostFacebookDestinationView = {
  id: "d1",
  name: "Halkidiki Rentals",
  url: "https://www.facebook.com/groups/123456",
  favorite: false,
  lastUsedAt: null,
};

function whereStep(channels: Parameters<typeof PromotionStepWhere>[0]["channels"]) {
  return renderToStaticMarkup(
    <PromotionStepWhere
      channels={channels}
      onChannelsChange={() => {}}
      destinations={[group]}
      onDestinationsChange={() => {}}
      profileSelected
      onProfileSelectedChange={() => {}}
      selectedDestinationIds={["d1"]}
      onSelectedDestinationIdsChange={() => {}}
    />,
  );
}

describe("promotion step one — where", () => {
  it("offers every channel at once, because a host promotes to more than one", () => {
    const html = whereStep(["FACEBOOK"]);

    expect(html).toContain("Facebook");
    expect(html).toContain("Instagram");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Copy link");
  });

  it("opens the group list only for the channel that has groups", () => {
    // Facebook is the only one of the four with named places inside it; the others are
    // simply themselves, and a destination list under them would be an empty question.
    expect(whereStep(["FACEBOOK"])).toContain("Halkidiki Rentals");
    expect(whereStep(["INSTAGRAM", "MESSAGING"])).not.toContain(
      "Halkidiki Rentals",
    );
  });

  it("keeps the explanation behind the question mark rather than on the screen", () => {
    const html = whereStep(["FACEBOOK"]);

    // The label survives as the control's accessible name — hidden from the layout,
    // not from a screen reader.
    expect(html).toContain('aria-label="How promoting works"');
    // The body of it belongs to the sheet, which is closed.
    expect(html).not.toContain("You paste it and post it yourself");
  });
});

function postStep(
  overrides: Partial<Parameters<typeof PromotionStepPost>[0]> = {},
) {
  return renderToStaticMarkup(
    <PromotionStepPost
      channels={["FACEBOOK"]}
      facebookTargets={[
        {
          kind: "facebook-group",
          id: "d1",
          name: "Halkidiki Rentals",
          url: group.url,
        },
      ]}
      facebookText="Come and stay"
      instagramCaption="Come and stay · link in bio"
      messagingText="Come and stay https://example.test/x"
      propertyUrl="https://example.test/x"
      savedMediaCount={0}
      needsMedia={false}
      done={[]}
      onDone={() => {}}
      onGroupOpened={() => {}}
      {...overrides}
    />,
  );
}

describe("promotion step three — post", () => {
  it("sends each group to its own saved address", () => {
    expect(postStep()).toContain(`href="${group.url}"`);
  });

  it("says outright that the messengers need no clipboard", () => {
    // The one channel where the text rides in the URL. Telling a host to copy first
    // would be an instruction for a step that does not exist here.
    const html = postStep({ channels: ["FACEBOOK", "MESSAGING"] });

    expect(html).toContain("nothing to copy");
    expect(html).toContain("wa.me");
  });

  it("stops a host reaching Instagram without the file it cannot post without", () => {
    const html = postStep({
      channels: ["INSTAGRAM"],
      facebookTargets: [],
      needsMedia: true,
    });

    expect(html).toContain("Instagram needs a photo from your device");
  });

  it("confirms the files are on the device once they have been saved", () => {
    const html = postStep({
      channels: ["INSTAGRAM"],
      facebookTargets: [],
      needsMedia: false,
      savedMediaCount: 3,
    });

    expect(html).toContain("3 saved to your device");
    expect(html).not.toContain("Instagram needs a photo from your device");
  });

  it("renders nothing for a channel the host did not choose", () => {
    const html = postStep();

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("instagram.com");
  });
});
