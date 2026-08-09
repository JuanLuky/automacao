import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Adapter: o domínio chama enviarMensagem() sem saber os detalhes do payload
// da Evolution API. Se um dia trocar de provedor (Z-API, Twilio etc.),
// só essa classe muda — nada no ConversationsService/MessagesService.
@Injectable()
export class EvolutionService {
  constructor(private readonly configService: ConfigService) {}

  async enviarMensagem(
    instance: string,
    telefone: string,
    texto: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(
      `${baseUrl}/message/sendText/${instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey ?? '',
        },
        body: JSON.stringify({ number: telefone, text: texto }),
      },
    );

    if (!response.ok) {
      const corpo = await response.text();
      throw new Error(
        `Falha ao enviar mensagem via Evolution API (${response.status}): ${corpo}`,
      );
    }
  }

  async enviarMidia(
    instance: string,
    telefone: string,
    opcoes: {
      mediatype: 'image' | 'document' | 'video';
      mimetype: string;
      caption?: string;
      fileName?: string;
      mediaBase64: string;
    },
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey ?? '',
      },
      body: JSON.stringify({
        number: telefone,
        mediatype: opcoes.mediatype,
        mimetype: opcoes.mimetype,
        caption: opcoes.caption,
        fileName: opcoes.fileName,
        media: opcoes.mediaBase64,
      }),
    });

    if (!response.ok) {
      const corpo = await response.text();
      throw new Error(
        `Falha ao enviar mídia via Evolution API (${response.status}): ${corpo}`,
      );
    }
  }

  async getConnectionState(instance: string): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(
      `${baseUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: apiKey ?? '' } },
    );

    if (!response.ok) {
      const corpo = await response.text();
      throw new Error(
        `Falha ao consultar estado da instância na Evolution API (${response.status}): ${corpo}`,
      );
    }

    return response.json();
  }

  async getQrCode(instance: string): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(`${baseUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey ?? '' },
    });

    if (!response.ok) {
      const corpo = await response.text();
      throw new Error(
        `Falha ao gerar QR Code na Evolution API (${response.status}): ${corpo}`,
      );
    }

    return response.json();
  }
}
