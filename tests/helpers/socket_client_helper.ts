import { io as ioClient, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@fun-chess/shared';

export type TypedSocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function createConnectedSocketClient(url: string): Promise<TypedSocketClient> {
  const socket: TypedSocketClient = ioClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connection timed out to ${url}`));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return socket;
}

export function waitForEvent<T = any>(
  socket: TypedSocketClient,
  event: keyof ServerToClientEvents | string,
  timeoutMs = 4000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event as any, listener);
      reject(new Error(`Timed out waiting for event '${String(event)}' after ${timeoutMs}ms`));
    }, timeoutMs);

    const listener = (data: any) => {
      clearTimeout(timer);
      socket.off(event as any, listener);
      resolve(data);
    };

    socket.on(event as any, listener);
  });
}

export function expectNoEvent(
  socket: TypedSocketClient,
  event: keyof ServerToClientEvents | string,
  durationMs = 300
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = (data: any) => {
      socket.off(event as any, listener);
      clearTimeout(timer);
      reject(new Error(`Unexpected event '${String(event)}' received: ${JSON.stringify(data)}`));
    };

    const timer = setTimeout(() => {
      socket.off(event as any, listener);
      resolve();
    }, durationMs);

    socket.on(event as any, listener);
  });
}

export function emitAck<TReq, TRes>(
  socket: TypedSocketClient,
  event: keyof ClientToServerEvents,
  payload: TReq,
  timeoutMs = 4000
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack on '${String(event)}' after ${timeoutMs}ms`));
    }, timeoutMs);

    (socket.emit as any)(event, payload, (res: TRes) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function disconnectSockets(...sockets: (TypedSocketClient | null | undefined)[]): void {
  for (const s of sockets) {
    if (s && s.connected) {
      s.disconnect();
    }
  }
}
