import "server-only";

import { EventEmitter } from "node:events";

const globalRealtime = globalThis as typeof globalThis & {
  communicationRealtime?: EventEmitter;
};

const emitter =
  globalRealtime.communicationRealtime ??
  new EventEmitter({ captureRejections: true });
emitter.setMaxListeners(1000);
globalRealtime.communicationRealtime = emitter;

export function publishConversationChanged(conversationId: string) {
  emitter.emit(`conversation:${conversationId}`);
}

export function subscribeConversationChanged(
  conversationId: string,
  listener: () => void
) {
  const event = `conversation:${conversationId}`;
  emitter.on(event, listener);
  return () => emitter.off(event, listener);
}
