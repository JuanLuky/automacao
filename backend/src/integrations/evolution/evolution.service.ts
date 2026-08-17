import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Adapter: o domínio chama enviarMensagem() sem saber os detalhes do payload
// da Evolution API. Se um dia trocar de provedor (Z-API, Twilio etc.),
// só essa classe muda — nada no ConversationsService/MessagesService.
@Injectable()
export class EvolutionService {
  constructor(private readonly configService: ConfigService) {}

  // Devolve o id da mensagem no WhatsApp (key.id da resposta da Evolution
  // API) — usado por MessagesService.create pra guardar em
  // Message.evolution_message_id e reconhecer o eco dessa mesma mensagem
  // quando ela voltar pelo webhook do n8n como "fromMe" (dedup, ver
  // "Grupos do WhatsApp"/mensagens externas no CLAUDE.md). null se a
  // resposta não vier no formato esperado — dedup só deixa de funcionar
  // pra essa mensagem específica, não é um erro fatal de envio.
  async enviarMensagem(
    instance: string,
    telefone: string,
    texto: string,
  ): Promise<{ id: string | null }> {
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

    const corpo = await response.json().catch(() => null);
    return { id: corpo?.key?.id ?? null };
  }

  async enviarMidia(
    instance: string,
    telefone: string,
    opcoes: {
      mediatype: 'image' | 'document' | 'video' | 'audio';
      mimetype: string;
      caption?: string;
      fileName?: string;
      mediaBase64: string;
    },
  ): Promise<{ id: string | null }> {
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

    const corpo = await response.json().catch(() => null);
    return { id: corpo?.key?.id ?? null };
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

  // Contatos salvos no WhatsApp conectado (sincronizados a partir do
  // celular pelo próprio WhatsApp) — devolve o JSON cru (mesmo padrão de
  // getConnectionState/getQrCode: formato varia entre versões da Evolution
  // API, quem normaliza é o frontend). Nunca persistido no nosso banco —
  // busca ao vivo a cada chamada (ver ContactsController, "Contatos" no
  // CLAUDE.md).
  async getContacts(instance: string): Promise<unknown[]> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(
      `${baseUrl}/chat/findContacts/${instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey ?? '',
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      const corpo = await response.text();
      throw new Error(
        `Falha ao buscar contatos na Evolution API (${response.status}): ${corpo}`,
      );
    }

    const corpo = await response.json().catch(() => []);
    return Array.isArray(corpo) ? corpo : [];
  }

  // Nome + foto de um grupo do WhatsApp — devolve o JSON cru (campos
  // conhecidos: subject, pictureUrl, participants...; mesmo padrão de
  // getConnectionState/getContacts, sem normalizar). Usado por
  // ConversationsService.buscarInfoWhatsapp pra conversa tipo grupo.
  async getGroupInfo(
    instance: string,
    groupJid: string,
  ): Promise<Record<string, unknown> | null> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(
      `${baseUrl}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(groupJid)}`,
      { headers: { apikey: apiKey ?? '' } },
    );

    if (!response.ok) {
      // Grupo pode ter sido removido/o número saiu dele — não é um erro
      // fatal pra quem só quer mostrar nome/foto, devolve vazio.
      return null;
    }

    return response.json().catch(() => null);
  }

  // Foto de perfil de um contato individual (não grupo) — devolve o JSON
  // cru da Evolution API ({ wuid, profilePictureUrl }), mesmo padrão de
  // getGroupInfo. null quando o contato não tem foto ou não foi
  // encontrado (não é um erro fatal).
  async getProfilePictureUrl(
    instance: string,
    numero: string,
  ): Promise<Record<string, unknown> | null> {
    const baseUrl = this.configService.get<string>('EVOLUTION_API_URL');
    const apiKey = this.configService.get<string>('EVOLUTION_API_KEY');

    const response = await fetch(
      `${baseUrl}/chat/fetchProfilePictureUrl/${instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey ?? '',
        },
        body: JSON.stringify({ number: numero }),
      },
    );

    if (!response.ok) {
      return null;
    }

    return response.json().catch(() => null);
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
