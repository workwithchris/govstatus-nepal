/**
 * workerd/nodejs_compat polyfill.
 *
 * Next.js's compiled `@edge-runtime/primitives` (which embeds undici's webidl
 * layer) reads `MessagePort`/`MessageChannel` off `node:worker_threads`
 * during module init — before workerd wires the Web IDL messaging globals.
 * On Worker runtimes that don't expose them yet, module init throws
 * `ReferenceError: MessagePort is not defined` and every request 500s.
 *
 * This module must be imported *before* the OpenNext worker so the globals
 * exist before Next's server chunks load. Natives are kept when present.
 */
const root = globalThis as typeof globalThis & {
  MessagePort?: unknown;
  MessageChannel?: unknown;
};

class MessagePortPolyfill {
  postMessage(): void {}
  close(): void {}
  start(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
  onmessage: unknown = null;
  onmessageerror: unknown = null;
  onclose: unknown = null;
}

if (root.MessagePort === undefined) {
  root.MessagePort = MessagePortPolyfill as unknown as typeof MessagePort;
}
if (root.MessageChannel === undefined) {
  root.MessageChannel = class MessageChannelPolyfill {
    port1 = new MessagePortPolyfill();
    port2 = new MessagePortPolyfill();
  } as unknown as typeof MessageChannel;
}

export {};