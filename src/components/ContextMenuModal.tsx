import React from "react";
import {
  ExternalLink,
  Shield,
  Copy,
  Share2,
  Download,
  X,
  Link2,
  Image as ImageIcon,
} from "lucide-react";
import { Language, translations } from "../locales";
import {
  NativeContextMenuRequestedContractEvent,
  getContextMenuAllowedActions,
} from "../services/nativeBrowserEngine";

export interface ContextMenuModalProps {
  request?: NativeContextMenuRequestedContractEvent | null;
  prompt?: NativeContextMenuRequestedContractEvent | null;
  isOpen?: boolean;
  isPrivate?: boolean;
  lang: Language;
  onOpenInNewTab: (url: string) => void;
  onOpenInPrivateTab: (url: string) => void;
  onCopyLink: (url: string) => void;
  onShareLink: (url: string) => void;
  onDownloadImage: (tabId: string, imageUrl: string) => void;
  onClose?: () => void;
  onCancel?: () => void;
}

export const ContextMenuModal: React.FC<ContextMenuModalProps> = ({
  request,
  prompt,
  isOpen,
  isPrivate,
  lang,
  onOpenInNewTab,
  onOpenInPrivateTab,
  onCopyLink,
  onShareLink,
  onDownloadImage,
  onClose,
  onCancel,
}) => {
  const activeRequest = request ?? prompt ?? null;
  if (!activeRequest || isOpen === false) return null;
  const handleClose = onClose || onCancel || (() => {});
  const t = translations[lang];

  const isPrivateTab = Boolean(isPrivate ?? activeRequest.isPrivate);
  const allowedActions = getContextMenuAllowedActions(activeRequest, isPrivateTab);
  const hasLink = Boolean(activeRequest.linkUrl);
  const hasImage = Boolean(activeRequest.imageUrl);
  const effectiveLinkUrl = activeRequest.linkUrl || activeRequest.imageUrl || "";

  return (
    <div
      id="context-menu-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              {hasImage && !hasLink ? (
                <ImageIcon className="w-4 h-4 text-cyan-400" />
              ) : (
                <Link2 className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                {t.contextMenuTitle}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {effectiveLinkUrl}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={t.contextMenuCancel}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2 space-y-1">
          {effectiveLinkUrl && (
            <>
              {allowedActions.includes("open_new_tab") && !isPrivateTab && (
                <button
                  type="button"
                  id="context-menu-open-new-tab-btn"
                  onClick={() => {
                    onOpenInNewTab(effectiveLinkUrl);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{t.contextMenuOpenNewTab}</span>
                </button>
              )}

              {allowedActions.includes("open_private_tab") && (
                <button
                  type="button"
                  id="context-menu-open-private-tab-btn"
                  onClick={() => {
                    onOpenInPrivateTab(effectiveLinkUrl);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-purple-200 hover:bg-purple-950/40 transition-colors"
                >
                  <Shield className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{t.contextMenuOpenPrivateTab}</span>
                </button>
              )}

              {allowedActions.includes("copy_link") && (
                <button
                  type="button"
                  id="context-menu-copy-link-btn"
                  onClick={() => {
                    onCopyLink(effectiveLinkUrl);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <Copy className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t.contextMenuCopyLink}</span>
                </button>
              )}

              {allowedActions.includes("share_link") && (
                <button
                  type="button"
                  id="context-menu-share-link-btn"
                  onClick={() => {
                    onShareLink(effectiveLinkUrl);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{t.contextMenuShareLink}</span>
                </button>
              )}
            </>
          )}

          {allowedActions.includes("download_image") &&
            !isPrivateTab &&
            hasImage &&
            activeRequest.imageUrl && (
              <button
                type="button"
                id="context-menu-download-image-btn"
                onClick={() => {
                  onDownloadImage(activeRequest.tabId, activeRequest.imageUrl!);
                  handleClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-amber-200 hover:bg-amber-950/40 transition-colors"
              >
                <Download className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t.contextMenuDownloadImage}</span>
              </button>
            )}

          <div className="pt-1 border-t border-slate-800/80">
            <button
              type="button"
              id="context-menu-cancel-btn"
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            >
              <span>{t.contextMenuCancel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

