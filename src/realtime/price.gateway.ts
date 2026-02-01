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
import { PriceData } from '../binance/binance.types';

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
    @MessageBody() payload: { symbol: string },
  ) {
    const { symbol } = payload;
    if (!symbol) {
      return { error: 'Symbol is required' };
    }

    const room = symbol.toUpperCase();
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);

    return { success: true, message: `Subscribed to ${room}` };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbol: string },
  ) {
    const { symbol } = payload;
    if (!symbol) {
      return { error: 'Symbol is required' };
    }

    const room = symbol.toUpperCase();
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);

    return { success: true, message: `Unsubscribed from ${room}` };
  }

  broadcastPrice(symbol: string, data: PriceData) {
    const room = symbol.toUpperCase();
    this.server.to(room).emit('priceUpdate', {
      symbol: data.symbol,
      price: data.price,
      ts: data.ts,
    });
    this.logger.debug(`Broadcast price update to ${room}: ${data.price}`);
  }
}
