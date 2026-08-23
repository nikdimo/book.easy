import { describe, expect, it } from "vitest";
import { HOST_MESSAGES_PATH, hostMessagesHref } from "./messages-href";

describe("hostMessagesHref", () => {
  it("opens the Host V2 inbox, never the classic one", () => {
    expect(HOST_MESSAGES_PATH).toBe("/host/messages");
    expect(hostMessagesHref()).toBe("/host/messages");
    expect(hostMessagesHref("conv-1")).toBe("/host/messages/conv-1");
    expect(hostMessagesHref("conv-1")).not.toContain("/host/inbox");
  });

  it("falls back to the inbox when there is no thread to open", () => {
    expect(hostMessagesHref(null)).toBe(HOST_MESSAGES_PATH);
    expect(hostMessagesHref(undefined)).toBe(HOST_MESSAGES_PATH);
    expect(hostMessagesHref("   ")).toBe(HOST_MESSAGES_PATH);
  });

  it("drops anything that could not be a conversation id", () => {
    // A value of the wrong shape would only ever produce a 404 route; the inbox is a
    // better answer, and no crafted segment reaches the router either way.
    expect(hostMessagesHref("../../admin")).toBe(HOST_MESSAGES_PATH);
    expect(hostMessagesHref("conv 1/../x")).toBe(HOST_MESSAGES_PATH);
    expect(hostMessagesHref("<script>")).toBe(HOST_MESSAGES_PATH);
    expect(hostMessagesHref("x".repeat(65))).toBe(HOST_MESSAGES_PATH);
  });

  it("passes a well-formed id belonging to someone else straight through", () => {
    // Shape is all this checks. The thread route re-reads the conversation scoped to
    // `listing.hostId` and to participant membership, so a foreign id is a 404 there,
    // not a leak here.
    expect(hostMessagesHref("someoneElsesConversation")).toBe(
      "/host/messages/someoneElsesConversation"
    );
  });
});
