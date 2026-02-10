import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PriceData, BinanceKlinePayload } from '../binance/binance.types';

@WebSocketGateway({
  namespace: '/prices',
  cors: {
    origin: '*',
    credentials: false,
  },
})
export class PriceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PriceGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbol: string } | string,
  ) {
    try {
      if (!this.server) {
        this.logger.error('❌ Server not initialized');
        return {
          status: 'error',
          message: 'Server not initialized',
        };
      }

      // Handle both object and string payload formats
      let symbol: string;
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          symbol = parsed.symbol;
        } catch {
          symbol = payload;
        }
      } else if (payload && typeof payload === 'object') {
        symbol = payload.symbol;
      } else {
        this.logger.warn(
          `⚠️  Client ${client.id} attempted subscribe with invalid payload:`,
          payload,
        );
        return {
          status: 'error',
          message: 'Invalid payload format. Expected { symbol: string }',
        };
      }

      if (!symbol || typeof symbol !== 'string') {
        this.logger.warn(
          `⚠️  Client ${client.id} attempted subscribe without symbol`,
        );
        return {
          status: 'error',
          message: 'Symbol is required',
        };
      }

      const room = symbol.toUpperCase();
      client.join(room);

      let clientCount = 0;
      try {
        const adapter = this.server.adapter as any;
        const roomSet = adapter?.rooms?.get(room);
        clientCount = roomSet ? roomSet.size : 0;
      } catch (error) {
        this.logger.warn(`Could not get client count for room ${room}`, error);
      }

      this.logger.log(
        `✅ Client ${client.id} subscribed to ${room} (${clientCount} total clients in room)`,
      );

      return {
        status: 'success',
        message: `Subscribed to ${room}`,
        symbol: room,
      };
    } catch (error) {
      this.logger.error(
        `❌ Error in handleSubscribe for client ${client.id}`,
        error,
      );
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbol: string } | string,
  ) {
    try {
      if (!this.server) {
        this.logger.error('❌ Server not initialized');
        return {
          status: 'error',
          message: 'Server not initialized',
        };
      }

      // Handle both object and string payload formats
      let symbol: string;
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          symbol = parsed.symbol;
        } catch {
          symbol = payload;
        }
      } else if (payload && typeof payload === 'object') {
        symbol = payload.symbol;
      } else {
        return {
          status: 'error',
          message: 'Invalid payload format. Expected { symbol: string }',
        };
      }

      if (!symbol || typeof symbol !== 'string') {
        return {
          status: 'error',
          message: 'Symbol is required',
        };
      }

      const room = symbol.toUpperCase();
      client.leave(room);
      this.logger.log(`Client ${client.id} unsubscribed from ${room}`);

      return {
        status: 'success',
        message: `Unsubscribed from ${room}`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Error in handleUnsubscribe for client ${client.id}`,
        error,
      );
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Internal server error',
      };
    }
  }

  broadcastPrice(symbol: string, data: PriceData) {
    if (!this.server) return;

    // Use volatile emit: if client can't receive, skip (no buffering)
    // This prevents backpressure buildup for real-time price data
    this.server.to(symbol.toUpperCase()).volatile.emit('priceUpdate', {
      s: data.symbol,
      p: data.price,
      t: data.ts,
    });
  }

  /**
   * Broadcast full kline (candlestick) data to clients
   * Used when clients need full OHLCV data for charting
   */
  broadcastKline(symbol: string, klineData: BinanceKlinePayload) {
    if (!this.server) return;

    // Use volatile emit for real-time data (drop if client can't keep up)
    this.server
      .to(symbol.toUpperCase())
      .volatile.emit('klineUpdate', klineData);
  }
}
