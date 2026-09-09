import { io as ioClient, Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@fun-chess/shared";

export type TypedSocketClient = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

export async function createConnectedSocketClient(
  url: string,
): Promise<TypedSocketClient> {
  const socket: TypedSocketClient = ioClient(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connection timed out to ${url}`));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return socket;
}

interface GenericSocketClient {
  on(event: string, listener: (data: unknown) => void): void;
  off(event: string, listener: (data: unknown) => void): void;
  emit(event: string, payload: unknown, callback?: (res: unknown) => void): void;
}

export function waitForEvent<T = unknown>(
  socket: TypedSocketClient,
  event: keyof ServerToClientEvents | string,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const rawSocket = socket as unknown as GenericSocketClient;
    const eventName = String(event);

    const listener = (data: unknown) => {
      clearTimeout(timer);
      rawSocket.off(eventName, listener);
      resolve(data as T);
    };

    const timer = setTimeout(() => {
      rawSocket.off(eventName, listener);
      reject(
        new Error(
          `Timed out waiting for event '${eventName}' after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    rawSocket.on(eventName, listener);
  });
}

export function expectNoEvent(
  socket: TypedSocketClient,
  event: keyof ServerToClientEvents | string,
  durationMs = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const rawSocket = socket as unknown as GenericSocketClient;
    const eventName = String(event);

    const listener = (data: unknown) => {
      rawSocket.off(eventName, listener);
      clearTimeout(timer);
      reject(
        new Error(
          `Unexpected event '${eventName}' received: ${JSON.stringify(data)}`,
        ),
      );
    };

    const timer = setTimeout(() => {
      rawSocket.off(eventName, listener);
      resolve();
    }, durationMs);

    rawSocket.on(eventName, listener);
  });
}

export function emitAck<TReq, TRes>(
  socket: TypedSocketClient,
  event: keyof ClientToServerEvents,
  payload: TReq,
  timeoutMs = 4000,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const rawSocket = socket as unknown as GenericSocketClient;
    const eventName = String(event);

    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for ack on '${eventName}' after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    rawSocket.emit(eventName, payload, (res: unknown) => {
      clearTimeout(timer);
      resolve(res as TRes);
    });
  });
}

export function disconnectSockets(
  ...sockets: (TypedSocketClient | null | undefined)[]
): void {
  for (const s of sockets) {
    if (s && s.connected) {
      s.disconnect();
    }
  }
}
