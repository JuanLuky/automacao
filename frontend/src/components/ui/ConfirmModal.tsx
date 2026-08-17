"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" usa vermelho de alerta no botão de confirmação (ex: excluir). */
  variant?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Ação alternativa opcional (ex: "Finalizar sem mensagem" ao lado de
   * "Finalizar com mensagem") — quando presente, um terceiro botão
   * aparece entre Cancelar e Confirmar. Tem loading próprio pra saber
   * qual dos dois botões está em andamento; os dois ficam desabilitados
   * enquanto qualquer um dos dois carrega.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryLoading?: boolean;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
  secondaryLoading = false,
}: ConfirmModalProps) {
  const emAndamento = loading || secondaryLoading;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !emAndamento) onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, emAndamento, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-900/60 p-4 backdrop-blur-sm"
      onClick={() => !emAndamento && onCancel()}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm animate-queue-in rounded-xl border border-app bg-raised p-6 shadow-panel"
      >
        <div className="flex items-start gap-3">
          {variant === "danger" && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alert/12 text-alert">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h2
              id="confirm-modal-title"
              className="font-display text-base font-semibold text-primary"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 text-[0.875rem] leading-snug text-secondary">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={onCancel}
            disabled={emAndamento}
          >
            {cancelLabel}
          </Button>
          {secondaryLabel && onSecondary && (
            <Button
              type="button"
              variant="ghost"
              className="!px-4 !py-2.5 text-[0.8125rem]"
              loading={secondaryLoading}
              disabled={loading}
              onClick={onSecondary}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            type="button"
            className={`!px-4 !py-2.5 text-[0.8125rem] ${
              variant === "danger" ? "!bg-alert hover:!bg-alert/90" : ""
            }`}
            loading={loading}
            disabled={secondaryLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
