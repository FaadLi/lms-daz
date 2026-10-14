import React, { useState } from 'react';
import { Child, LessonReport } from '../../types';
import { db } from '../../services/db';
import { generateReportShareMessage, createWhatsappUrl } from '../../utils/whatsapp';
import { MessageSquare, Copy, Check, ExternalLink, X, ShieldCheck } from 'lucide-react';

interface WhatsappShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  child: Child;
  report: LessonReport;
  originUrl: string;
}

export const WhatsappShareModal: React.FC<WhatsappShareModalProps> = ({
  isOpen,
  onClose,
  child,
  report,
  originUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const parent = child.parentId ? db.getParentById(child.parentId) : undefined;
  const tokenObj = db.getTokenForChild(child.id);
  const privateLink = `${originUrl}/#/report/${tokenObj.token}`;

  const message = generateReportShareMessage({
    child,
    parent,
    report,
    privateLink,
  });

  const parentPhone = parent?.whatsappNumber || '';
  const waUrl = createWhatsappUrl(parentPhone, message);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      db.markReportShared(report.id);
    } catch {
      // Fallback
    }
  };

  const handleCopyLinkOnly = async () => {
    try {
      await navigator.clipboard.writeText(privateLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleOpenWhatsapp = () => {
    db.markReportShared(report.id);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Kirim Report via WhatsApp</h3>
              <p className="text-xs text-slate-500">
                Penerima: {parent?.fullName || 'Orang Tua'} ({parentPhone || 'Nomor belum diisi'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200/80">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Tautan menggunakan <strong>Private Security Token</strong>. Hanya orang tua dengan tautan ini yang dapat mengakses laporan.
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Teks Pesan WhatsApp</label>
              <button
                onClick={handleCopyMessage}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Salin Pesan
                  </>
                )}
              </button>
            </div>
            <textarea
              readOnly
              value={message}
              rows={8}
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 focus:outline-none resize-none"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[11px] font-medium text-slate-500 block mb-1">
              Private Report Link:
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-slate-700 truncate select-all">
                {privateLink}
              </span>
              <button
                onClick={handleCopyLinkOnly}
                className="shrink-0 text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Salin Link
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleOpenWhatsapp}
            className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-2 shadow-sm transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Buka WhatsApp Sekarang
          </button>
        </div>
      </div>
    </div>
  );
};
