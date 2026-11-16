import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '@getit/shared';
import { createApp } from '../src/app';
import { createSocketServer, type IoServer } from '../src/realtime/socket';

let http: Server;
let io: IoServer;
let url: string;

beforeAll(async () => {
  http = createServer(createApp());
  io = createSocketServer(http);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await io.close();
});

describe('socket.io', () => {
  it('answers system:ping with an ack', async () => {
    const client: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
      transports: ['websocket'],
    });
    const res = await client.timeout(3000).emitWithAck('system:ping');
    client.close();
    expect(res.ok).toBe(true);
    if (res.ok) expect(Date.parse(res.data.serverTime)).not.toBeNaN();
  });
});
