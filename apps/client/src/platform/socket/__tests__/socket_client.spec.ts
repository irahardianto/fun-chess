import { describe, it, expect, vi, beforeEach } from 'vitest';
import { io } from 'socket.io-client';
import { createSocketClient } from '../socket_client';

vi.mock('socket.io-client', () => ({
  io: vi.fn().mockReturnValue({
    connected: false,
    id: 'mock-socket-id',
    on: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

describe('socket_client factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates socket with specified custom URL and robust reconnection parameters', () => {
    const customUrl = 'http://192.168.1.100:3000';
    createSocketClient(customUrl);

    expect(io).toHaveBeenCalledWith(customUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  });

  it('defaults to window.location.origin when no URL is provided', () => {
    createSocketClient();

    expect(io).toHaveBeenCalledWith(window.location.origin, expect.objectContaining({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    }));
  });
});
