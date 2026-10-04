import { createServer, request } from 'node:http';
import { Duplex } from 'node:stream';
import type { Express } from 'express';

class MemoryConnection extends Duplex {
  public peer?: MemoryConnection;
  public readonly remoteAddress = '127.0.0.1';
  public readonly remotePort = 0;

  public override _read(): void {}

  public override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.peer || this.peer.destroyed) {
      callback(new Error('The in-memory HTTP connection is closed'));
      return;
    }
    this.peer.push(chunk);
    callback();
  }

  public override _final(callback: (error?: Error | null) => void): void {
    if (!this.peer?.destroyed) this.peer?.push(null);
    callback();
  }

  public setTimeout(): this { return this; }
  public setNoDelay(): this { return this; }
  public setKeepAlive(): this { return this; }
}

/** Runs real Node HTTP parsing and Express middleware over memory streams, without listening on a port. */
export function createTestFetch(app: Express): typeof globalThis.fetch {
  return async (input, init) => {
    const fetchRequest = new Request(input, init);
    fetchRequest.signal.throwIfAborted();
    const url = new URL(fetchRequest.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Test requests require an HTTP URL');
    const body = Buffer.from(await fetchRequest.arrayBuffer());
    fetchRequest.signal.throwIfAborted();
    const headers = Object.fromEntries(fetchRequest.headers);
    if (body.length > 0 && !('content-length' in headers) && !('transfer-encoding' in headers)) {
      headers['content-length'] = String(body.length);
    }
    headers.connection = 'close';

    return new Promise<Response>((resolve, reject) => {
      const clientStream = new MemoryConnection();
      const serverStream = new MemoryConnection();
      clientStream.peer = serverStream;
      serverStream.peer = clientStream;
      const server = createServer(app);
      let settled = false;

      const cleanup = (): void => {
        fetchRequest.signal.removeEventListener('abort', abort);
        clientStream.destroy();
        serverStream.destroy();
        server.close(() => {});
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abort = (): void => fail(fetchRequest.signal.reason);
      fetchRequest.signal.addEventListener('abort', abort, { once: true });
      clientStream.on('error', fail);
      serverStream.on('error', fail);
      server.on('clientError', fail);

      // ClientRequest's documented createConnection hook avoids net.connect and DNS.
      // The server's normal connection handler constructs IncomingMessage and ServerResponse.
      server.emit('connection', serverStream);
      const outgoing = request({
        protocol: 'http:',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: fetchRequest.method,
        headers,
        createConnection: () => clientStream,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', fail);
        response.on('aborted', () => fail(new Error('The in-memory HTTP response was aborted')));
        response.on('end', () => {
          if (settled) return;
          try {
            const responseHeaders = new Headers();
            for (let index = 0; index < response.rawHeaders.length; index += 2) {
              responseHeaders.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
            }
            const status = response.statusCode ?? 500;
            const noBody = fetchRequest.method === 'HEAD' || [204, 205, 304].includes(status);
            const result = new Response(noBody ? null : new Uint8Array(Buffer.concat(chunks)), {
              status,
              statusText: response.statusMessage,
              headers: responseHeaders,
            });
            settled = true;
            cleanup();
            resolve(result);
          } catch (error) {
            fail(error);
          }
        });
      });
      outgoing.on('error', fail);
      outgoing.end(body);
    });
  };
}
