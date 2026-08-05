import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { MessageTipo } from './entities/message.entity';

const EXTENSAO_POR_MIMETYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const MIMETYPES_POR_TIPO: Record<string, string[]> = {
  [MessageTipo.IMAGEM]: ['image/jpeg', 'image/png', 'image/webp'],
  [MessageTipo.AUDIO]: [
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/mpeg',
    'audio/mp4',
  ],
  [MessageTipo.DOCUMENTO]: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15MB decodificado

const DIRETORIO_MIDIA = join(process.cwd(), 'uploads', 'mensagens');

// Isola leitura/escrita do arquivo de mídia num único lugar — hoje é disco
// local, mas se um dia precisar migrar pra um storage externo (S3 etc.),
// só essa classe muda. Mesmo espírito do adapter da Evolution API
// (ver integrations/evolution/evolution.service.ts).
@Injectable()
export class MediaStorageService {
  async salvar(
    id: string,
    tipo: MessageTipo,
    base64: string,
    mimetype: string,
  ): Promise<{ path: string }> {
    const permitidos = MIMETYPES_POR_TIPO[tipo] ?? [];
    if (!permitidos.includes(mimetype)) {
      throw new BadRequestException(
        `Tipo de mídia "${mimetype}" não suportado para mensagens do tipo "${tipo}".`,
      );
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
      throw new BadRequestException(
        'Arquivo maior que o limite permitido (15MB).',
      );
    }

    const extensao = EXTENSAO_POR_MIMETYPE[mimetype] ?? 'bin';
    // Nome de arquivo em disco é sempre derivado do id da mensagem (uuid
    // gerado por nós) + extensão fixa por mimetype — nunca o nome de
    // arquivo enviado pelo cliente, pra não abrir brecha de path traversal.
    const nomeArquivo = `${id}.${extensao}`;

    await fs.mkdir(DIRETORIO_MIDIA, { recursive: true });
    await fs.writeFile(join(DIRETORIO_MIDIA, nomeArquivo), buffer);

    return { path: nomeArquivo };
  }

  async ler(path: string): Promise<Buffer> {
    return fs.readFile(join(DIRETORIO_MIDIA, path));
  }
}
