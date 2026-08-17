"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BookUser,
  Download,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import {
  EVOLUTION_INSTANCE,
  createContact,
  deleteContact,
  getContacts,
  getWhatsappContacts,
  importContacts,
  normalizeError,
  updateContact,
} from "@/lib/api";
import type { Contact, CreateContactPayload, WhatsappContactRaw } from "@/types";

interface ContatoNormalizado {
  nome: string;
  telefone: string;
}

// Confirmado contra a instância real desta sessão (POST
// /chat/findContacts): o JID vem em "remoteJid" — "id" é a chave interna
// do registro no banco da Evolution API, não um JID (usá-lo produzia
// telefone com lixo). Foto vem em "profilePicUrl" (não
// "profilePictureUrl", nome diferente do usado em
// /chat/fetchProfilePictureUrl). Descarta grupos (@g.us) e contatos só
// com "lid" (identificador vinculado do WhatsApp sem número de telefone
// exposto — não dá pra iniciar conversa com isso).
function normalizarContatoWhatsapp(raw: WhatsappContactRaw): ContatoNormalizado | null {
  const jid = (raw.remoteJid as string) || "";
  if (!jid.endsWith("@s.whatsapp.net")) return null;

  const telefone = jid.split("@")[0];
  if (!telefone) return null;

  const nome = (raw.pushName as string) || telefone;

  return { nome, telefone };
}

// Sem suporte a valor com vírgula entre aspas (CSV "de verdade") — mantido
// simples de propósito, cobre o caso comum de exportar/reimportar pelo
// próprio Maré ou uma planilha de duas colunas.
function pareceTelefone(valor: string): boolean {
  return /\d{8,}/.test(valor.replace(/\D/g, ""));
}

function parseCsv(texto: string): CreateContactPayload[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const contatos: CreateContactPayload[] = [];
  linhas.forEach((linha, indice) => {
    const [nomeCru, telefoneCru] = linha.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!nomeCru || !telefoneCru) return;
    if (indice === 0 && !pareceTelefone(telefoneCru)) return; // provável cabeçalho
    contatos.push({ nome: nomeCru, telefone: telefoneCru });
  });
  return contatos;
}

function exportarCsv(whatsapp: ContatoNormalizado[], manuais: Contact[]) {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [
    "nome,telefone,origem",
    ...whatsapp.map((c) => `${escapar(c.nome)},${escapar(c.telefone)},whatsapp`),
    ...manuais.map((c) => `${escapar(c.nome)},${escapar(c.telefone)},mare`),
  ];
  const blob = new Blob([linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ContatosPage() {
  const [busca, setBusca] = useState("");

  const [contatosWhatsapp, setContatosWhatsapp] = useState<ContatoNormalizado[]>([]);
  const [carregandoWhatsapp, setCarregandoWhatsapp] = useState(true);
  const [erroWhatsapp, setErroWhatsapp] = useState<string | null>(null);

  const [contatosManuais, setContatosManuais] = useState<Contact[]>([]);
  const [carregandoManuais, setCarregandoManuais] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Contact | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [excluindoAlvo, setExcluindoAlvo] = useState<Contact | null>(null);
  const [executandoAcao, setExecutandoAcao] = useState(false);

  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregarWhatsapp = useCallback(async () => {
    if (!EVOLUTION_INSTANCE) {
      setErroWhatsapp("Instância do WhatsApp não configurada (NEXT_PUBLIC_EVOLUTION_INSTANCE).");
      setCarregandoWhatsapp(false);
      return;
    }
    setCarregandoWhatsapp(true);
    setErroWhatsapp(null);
    try {
      const bruto = await getWhatsappContacts(EVOLUTION_INSTANCE);
      const porTelefone = new Map<string, ContatoNormalizado>();
      for (const item of bruto) {
        const normalizado = normalizarContatoWhatsapp(item);
        if (normalizado) porTelefone.set(normalizado.telefone, normalizado);
      }
      setContatosWhatsapp(
        Array.from(porTelefone.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
      );
    } catch (error) {
      setErroWhatsapp(normalizeError(error).message);
    } finally {
      setCarregandoWhatsapp(false);
    }
  }, []);

  const carregarManuais = useCallback(async () => {
    setCarregandoManuais(true);
    setErro(null);
    try {
      const data = await getContacts();
      setContatosManuais(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setCarregandoManuais(false);
    }
  }, []);

  useEffect(() => {
    carregarWhatsapp();
    carregarManuais();
  }, [carregarWhatsapp, carregarManuais]);

  const termo = busca.trim().toLowerCase();
  const whatsappFiltrados = useMemo(
    () =>
      !termo
        ? contatosWhatsapp
        : contatosWhatsapp.filter(
            (c) => c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo),
          ),
    [contatosWhatsapp, termo],
  );
  const manuaisFiltrados = useMemo(
    () =>
      !termo
        ? contatosManuais
        : contatosManuais.filter(
            (c) => c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo),
          ),
    [contatosManuais, termo],
  );

  function limparFormulario() {
    setNome("");
    setTelefone("");
    setErroForm(null);
  }

  function abrirCriar() {
    setEditando(null);
    limparFormulario();
    setCriando((v) => !v);
  }

  function abrirEditar(c: Contact) {
    setCriando(false);
    setEditando(c);
    setNome(c.nome);
    setTelefone(c.telefone);
    setErroForm(null);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    limparFormulario();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErroForm(null);
    try {
      if (editando) {
        await updateContact(editando.id, { nome: nome.trim(), telefone: telefone.trim() });
      } else {
        await createContact({ nome: nome.trim(), telefone: telefone.trim() });
      }
      fecharFormulario();
      carregarManuais();
    } catch (error) {
      setErroForm(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleConfirmarExcluir() {
    if (!excluindoAlvo) return;
    setExecutandoAcao(true);
    try {
      await deleteContact(excluindoAlvo.id);
      setExcluindoAlvo(null);
      carregarManuais();
    } catch (error) {
      setErro(normalizeError(error).message);
      setExcluindoAlvo(null);
    } finally {
      setExecutandoAcao(false);
    }
  }

  async function handleImportar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setResultadoImportacao(null);
    setErro(null);
    const texto = await file.text();
    const contatos = parseCsv(texto);
    if (contatos.length === 0) {
      setErro("Nenhum contato válido encontrado no arquivo (esperado: nome,telefone por linha).");
      return;
    }

    setImportando(true);
    try {
      const resultado = await importContacts(contatos);
      setResultadoImportacao(
        `${resultado.criados} contato(s) importado(s), ${resultado.ignorados} ignorado(s) (duplicado ou inválido).`,
      );
      carregarManuais();
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setImportando(false);
    }
  }

  const formAberto = criando || editando !== null;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">WhatsApp</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">
            Contatos
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportar}
            className="hidden"
          />
          <Button
            variant="ghost"
            className="!px-3.5 !py-2 text-[0.8125rem]"
            loading={importando}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} />
            Importar
          </Button>
          <Button
            variant="ghost"
            className="!px-3.5 !py-2 text-[0.8125rem]"
            onClick={() => exportarCsv(contatosWhatsapp, contatosManuais)}
          >
            <Download size={15} />
            Exportar
          </Button>
          <Button
            variant={formAberto ? "ghost" : "primary"}
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={() => (formAberto ? fecharFormulario() : abrirCriar())}
          >
            <Plus size={15} />
            {formAberto ? "Cancelar" : "Adicionar"}
          </Button>
        </div>
      </header>

      {formAberto && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-app bg-raised p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              icon={<User size={16} />}
              required
            />
            <Field
              label="Telefone"
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              icon={<Phone size={16} />}
              placeholder="Ex: 5511999999999"
              required
            />
          </div>

          {erroForm && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">{erroForm}</p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={enviando} className="!px-5 !py-3">
              {editando ? "Salvar alterações" : "Adicionar contato"}
            </Button>
          </div>
        </form>
      )}

      {resultadoImportacao && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-tide-500/35 bg-tide-500/8 px-4 py-3">
          <AlertCircle size={17} className="mt-px shrink-0 text-tide-500" aria-hidden="true" />
          <p className="text-[0.875rem] leading-snug text-primary">{resultadoImportacao}</p>
        </div>
      )}

      {erro && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
          <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
          <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
        </div>
      )}

      <div className="relative mb-6 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full rounded-xl border border-app bg-sunken py-2.5 pl-10 pr-4 text-[0.875rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
        />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-primary">
            <MessageCircle size={16} className="text-tide-500" />
            Contatos do WhatsApp
          </h2>
          <button
            type="button"
            onClick={carregarWhatsapp}
            disabled={carregandoWhatsapp}
            aria-label="Atualizar lista"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-primary disabled:opacity-50"
          >
            <RefreshCw size={15} className={carregandoWhatsapp ? "animate-spin" : ""} />
          </button>
        </div>

        {carregandoWhatsapp ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-tide-500" />
          </div>
        ) : erroWhatsapp ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-waiting/35 bg-waiting/10 px-4 py-3">
            <AlertCircle size={17} className="mt-px shrink-0 text-waiting" aria-hidden="true" />
            <p className="text-[0.8125rem] leading-snug text-primary">{erroWhatsapp}</p>
          </div>
        ) : whatsappFiltrados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-app py-8 text-center text-[0.875rem] text-muted">
            Nenhum contato sincronizado do WhatsApp{termo ? " para essa busca" : ""}.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-app bg-raised">
            <ul className="divide-y divide-app">
              {whatsappFiltrados.map((c) => (
                <li
                  key={c.telefone}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[0.875rem] font-medium text-primary">{c.nome}</p>
                    <p className="flex items-center gap-1 text-[0.8125rem] text-secondary">
                      <Phone size={12} />
                      {c.telefone}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-primary">
          <BookUser size={16} className="text-tide-500" />
          Contatos adicionados no Maré
        </h2>

        {carregandoManuais ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-tide-500" />
          </div>
        ) : manuaisFiltrados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-app py-8 text-center text-[0.875rem] text-muted">
            Nenhum contato adicionado{termo ? " para essa busca" : " ainda"}.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-app bg-raised">
            <ul className="divide-y divide-app">
              {manuaisFiltrados.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-[0.875rem] font-medium text-primary">{c.nome}</p>
                    <p className="flex items-center gap-1 text-[0.8125rem] text-secondary">
                      <Phone size={12} />
                      {c.telefone}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(c)}
                      aria-label={`Editar ${c.nome}`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-primary"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindoAlvo(c)}
                      aria-label={`Excluir ${c.nome}`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-alert"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <ConfirmModal
        open={excluindoAlvo !== null}
        title={`Excluir ${excluindoAlvo?.nome}?`}
        description="O contato é removido definitivamente da lista do Maré. Não afeta o WhatsApp em si."
        confirmLabel="Excluir"
        variant="danger"
        loading={executandoAcao}
        onConfirm={handleConfirmarExcluir}
        onCancel={() => setExcluindoAlvo(null)}
      />
    </div>
  );
}
