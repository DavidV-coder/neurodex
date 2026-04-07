/**
 * NeuroDEX Gateway — Standalone entrypoint
 * Запускается как дочерний процесс из Electron main.
 */

import { GatewayServer } from './server.js';
import { permissionManager } from '../security/permissions.js';

const port = parseInt(process.env.NEURODEX_GATEWAY_PORT ?? '18789');
const host = process.env.NEURODEX_GATEWAY_HOST ?? '127.0.0.1';
const token = process.env.NEURODEX_GATEWAY_TOKEN ?? undefined;

const gateway = new GatewayServer({ port, host, authToken: token });
gateway.setupPermissionBridge();

gateway.start()
  .then(() => {
    console.log(`[Gateway] NeuroDEX Gateway started on ${host}:${port}`);
    process.send?.('ready');
  })
  .catch((err: Error) => {
    console.error('[Gateway] Failed to start:', err.message);
    process.exit(1);
  });

process.on('SIGTERM', () => { gateway.stop(); process.exit(0); });
process.on('SIGINT', () => { gateway.stop(); process.exit(0); });
