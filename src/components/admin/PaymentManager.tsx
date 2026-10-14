import React, { useState } from 'react';
import { db } from '../../services/db';
import { PaymentRecord, PaymentPackageType } from '../../types';
import {
  formatDateIndo,
  formatRupiah,
  getPaymentStatusStyle,
  getPaymentStatusLabel,
} from '../../data/presets';
import { CreditCard, CheckCircle2, Plus, Calendar, Check, AlertCircle } from 'lucide-react';

export const PaymentManager: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'belum_lunas' | 'lunas'>('all');

  const children = db.getChildren();
  const payments = db.getPayments();

  // New payment record form state
  const [childId, setChildId] = useState(children[0]?.id || '');
  const [period, setPeriod] = useState('Oktober 2026');
  const [packageType, setPackageType] = useState<PaymentPackageType>('paket_sesi');
  const [sessionCount, setSessionCount] = useState(8);
  const [amount, setAmount] = useState(800000);
  const [dueDate, setDueDate] = useState('2026-10-15');
  const [notes, setNotes] = useState('Paket 8 sesi les privat');

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childId) return;

    const newPayment: PaymentRecord = {
      id: 'pay_' + Date.now(),
      childId,
      period,
      packageType,
      sessionCount: packageType === 'paket_sesi' ? Number(sessionCount) : undefined,
      amount: Number(amount),
      paidAmount: 0,
      dueDate,
      status: 'belum_lunas',
      notes,
      transactions: [],
    };

    db.savePayment(newPayment);
    setIsAddModalOpen(false);
  };

  const handleMarkPaid = (paymentId: string) => {
    db.markPaymentPaid(paymentId, 'Transfer Bank');
  };

  const filteredPayments = payments.filter((p) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'lunas') return p.status === 'lunas';
    return p.status === 'belum_lunas' || p.status === 'jatuh_tempo';
  });

  const totalTagihan = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalTerbayar = payments.reduce((acc, p) => acc + p.paidAmount, 0);
  const totalTertunda = totalTagihan - totalTerbayar;

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kelola Pembayaran Les</h1>
          <p className="text-xs text-slate-500">
            Catat invoice, paket belajar, dan status pelunasan les
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> Buat Tagihan Baru
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 block">Total Tagihan Periode Ini</span>
          <span className="text-xl font-bold text-slate-900 tabular-nums block mt-1">
            {formatRupiah(totalTagihan)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-700 block">Sudah Diterima (Lunas)</span>
          <span className="text-xl font-bold text-emerald-600 tabular-nums block mt-1">
            {formatRupiah(totalTerbayar)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-amber-700 block">Belum Lunas</span>
          <span className="text-xl font-bold text-amber-600 tabular-nums block mt-1">
            {formatRupiah(totalTertunda)}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
          }`}
        >
          Semua Tagihan ({payments.length})
        </button>
        <button
          onClick={() => setStatusFilter('belum_lunas')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            statusFilter === 'belum_lunas' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
          }`}
        >
          Belum Lunas ({payments.filter((p) => p.status !== 'lunas').length})
        </button>
        <button
          onClick={() => setStatusFilter('lunas')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            statusFilter === 'lunas' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
          }`}
        >
          Lunas ({payments.filter((p) => p.status === 'lunas').length})
        </button>
      </div>

      {/* Payment Records List */}
      <div className="space-y-3">
        {filteredPayments.map((pay) => {
          const child = children.find((c) => c.id === pay.childId);
          const style = getPaymentStatusStyle(pay.status);

          return (
            <div
              key={pay.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5">
                {child && (
                  <img
                    src={child.avatarUrl}
                    alt={child.fullName}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {child?.fullName || 'Murid'}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.border}`}
                    >
                      {getPaymentStatusLabel(pay.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periode: <strong className="text-slate-700">{pay.period}</strong> · Jatuh tempo:{' '}
                    {formatDateIndo(pay.dueDate)}
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    {formatRupiah(pay.amount)} {pay.sessionCount && `(${pay.sessionCount} Sesi)`}
                  </p>
                  {pay.paidDate && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                      ✓ Lunas pada {formatDateIndo(pay.paidDate)} via Transfer Bank
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                {pay.status !== 'lunas' ? (
                  <button
                    onClick={() => handleMarkPaid(pay.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Tandai Lunas
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Lunas Terverifikasi
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Payment Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-5 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Buat Tagihan Les Baru</h3>
            <p className="text-xs text-slate-500 mb-4">
              Atur periode, jumlah pertemuan, dan nominal tagihan
            </p>

            <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pilih Murid</label>
                <select
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                >
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.gradeLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Periode</label>
                  <input
                    type="text"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="Oktober 2026"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Model Paket</label>
                  <select
                    value={packageType}
                    onChange={(e) => setPackageType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  >
                    <option value="paket_sesi">Paket Sejumlah Sesi</option>
                    <option value="bulanan">Paket Bulanan</option>
                    <option value="per_pertemuan">Per Pertemuan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jumlah Sesi</label>
                  <input
                    type="number"
                    value={sessionCount}
                    onChange={(e) => setSessionCount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nominal (Rp)</label>
                  <input
                    type="number"
                    step="50000"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tanggal Jatuh Tempo</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: Biaya 8 pertemuan bulan berjalan"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
                >
                  Simpan Tagihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
