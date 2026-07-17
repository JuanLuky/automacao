import { Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// Observer: os services de domínio chamam esses métodos sem saber quem
// está ouvindo (painel web hoje, app mobile ou outro consumidor amanhã).
@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Cliente conectado ao socket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado do socket: ${client.id}`);
  }

  emitNovaConversa(conversa: unknown) {
    this.server.emit('nova_conversa', conversa);
  }

  emitConversaAtualizada(conversa: unknown) {
    this.server.emit('conversa_atualizada', conversa);
  }

  emitNovaMensagem(mensagem: unknown) {
    this.server.emit('nova_mensagem', mensagem);
  }

  emitConversaFinalizada(conversa: unknown) {
    this.server.emit('conversa_finalizada', conversa);
  }
}
