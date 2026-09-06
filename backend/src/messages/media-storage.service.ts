import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MessageTipo } from './entities/message.entity';

const EXTENSAO_POR_MIMETYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  // MediaRecorder do navegador (gravação por microfone) não produz ogg no
  // Chrome/Edge — só webm. Ver conversas/[id]/page.tsx, pickMimeType().
  'audio/webm': 'webm',
  'audio/webm; codecs=opus': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
};

const MIMETYPES_POR_TIPO: Record<string, string[]> = {
  [MessageTipo.IMAGEM]: ['image/jpeg', 'image/png', 'image/webp'],
  [MessageTipo.AUDIO]: [
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'audio/webm; codecs=opus',
    'audio/webm;codecs=opus',
  ],
  [MessageTipo.DOCUMENTO]: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  // Mesmos dois formatos que a Evolution API/WhatsApp usam na prática —
  // mp4 é o que o app do WhatsApp grava, 3gpp aparece em vídeos vindos de
  // aparelhos mais antigos/Android.
  [MessageTipo.VIDEO]: ['video/mp4', 'video/3gpp'],
};

const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15MB decodificado

const DIRETORIO_MIDIA = join(process.cwd(), 'uploads', 'mensagens');

// Isola leitura/escrita do arquivo de mídia num único lugar — hoje é disco
// local, mas se um dia precisar migrar pra um storage externo (S3 etc.),
// só essa classe muda. Mesmo espírito do adapter da Evolution API
// (ver integrations/evolution/evolution.service.ts).
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

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

  // WhatsApp só reproduz nota de voz (PTT) gravada em OGG/Opus — o
  // MediaRecorder do navegador grava webm/opus no Chrome/Edge (só Firefox
  // grava ogg nativo, ver ConversaPanel.tsx), e a Evolution API não converte
  // isso sozinha: aceita o upload (responde 2xx) mesmo com o container
  // errado, mas o WhatsApp descarta a mensagem sem avisar — a mensagem some
  // sem erro nenhum aparecer no painel (bug real, ver PROGRESSO.md).
  // Sempre reencodifica (mesmo se já vier como audio/ogg) pra garantir mono/
  // 16kHz, em vez de confiar que o que o navegador/arquivo anexado produziu
  // já bate com o que o WhatsApp espera.
  async normalizarAudioParaWhatsapp(
    base64: string,
    mimetypeOriginal: string,
  ): Promise<{ base64: string; mimetype: string }> {
    const entrada = join(tmpdir(), `${randomUUID()}-entrada`);
    const saida = join(tmpdir(), `${randomUUID()}-saida.ogg`);

    await fs.writeFile(entrada, Buffer.from(base64, 'base64'));
    try {
      await this.executarFfmpeg(entrada, saida);
      const convertido = await fs.readFile(saida);
      return { base64: convertido.toString('base64'), mimetype: 'audio/ogg' };
    } catch (erro) {
      this.logger.error(
        `Falha ao converter áudio (origem: ${mimetypeOriginal}) para ogg/opus: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
      throw new BadRequestException(
        'Não foi possível converter o áudio para um formato aceito pelo WhatsApp.',
      );
    } finally {
      await fs.rm(entrada, { force: true });
      await fs.rm(saida, { force: true });
    }
  }

  private executarFfmpeg(entrada: string, saida: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const processo = spawn('ffmpeg', [
        '-y',
        '-i',
        entrada,
        '-c:a',
        'libopus',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-b:a',
        '32k',
        '-f',
        'ogg',
        saida,
      ]);

      let stderr = '';
      processo.stderr.on('data', (dado) => {
        stderr += dado.toString();
      });
      processo.on('error', reject);
      processo.on('close', (codigo) => {
        if (codigo === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg saiu com código ${codigo}: ${stderr.slice(-2000)}`));
        }
      });
    });
  }
}
