import React, { useState, useEffect } from 'react';
import { Child, LessonReport, LessonPhoto } from '../../types';
import { db } from '../../services/db';
import {
  QUICK_SCORES,
  SUBJECT_OPTIONS,
  REPORT_TEMPLATES,
  getScoreCategory,
  getScoreCategoryLabel,
  getScoreCategoryStyle,
} from '../../data/presets';
import { validateImageFile } from '../../services/security';
import {
  X,
  Sparkles,
  Camera,
  Trash2,
  Share2,
  Save,
  Clock,
  BookOpen,
  Calendar,
  AlertCircle,
} from 'lucide-react';

interface ReportFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  child: Child;
  initialReport?: LessonReport | null;
  onSaved: (report: LessonReport, openShareModal: boolean) => void;
}

export const ReportFormModal: React.FC<ReportFormModalProps> = ({
  isOpen,
  onClose,
  child,
  initialReport,
  onSaved,
}) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [subject, setSubject] = useState<string>(SUBJECT_OPTIONS[0]);
  const [topic, setTopic] = useState<string>('');
  const [whatLearned, setWhatLearned] = useState<string>('');
  const [learningOutcome, setLearningOutcome] = useState<string>('');
  const [score, setScore] = useState<number>(85);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [nextStep, setNextStep] = useState<string>('');
  const [homePractice, setHomePractice] = useState<string>('');
  const [photos, setPhotos] = useState<LessonPhoto[]>([]);
  const [uploadError, setUploadError] = useState<string>('');

  // Selected template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    if (initialReport) {
      setDate(initialReport.date);
      setDurationMinutes(initialReport.durationMinutes);
      setSubject(initialReport.subject);
      setTopic(initialReport.topic);
      setWhatLearned(initialReport.whatLearned);
      setLearningOutcome(initialReport.learningOutcome);
      setScore(initialReport.score);
      setTeacherNotes(initialReport.teacherNotes);
      setNextStep(initialReport.nextStep);
      setHomePractice(initialReport.homePractice);
      setPhotos(initialReport.photos || []);
    } else {
      // Defaults for fast reporting
      setDate(new Date().toISOString().split('T')[0]);
      setDurationMinutes(60);
      setSubject('Membaca');
      setTopic('Membaca kata dua suku kata (KV-KV)');
      setWhatLearned('Latihan membaca gabungan konsonan-vokal terbuka.');
      setLearningOutcome(`${child.nickname} membaca 8 dari 10 kata dengan tepat dan mandiri.`);
      setScore(85);
      setTeacherNotes(`${child.nickname} antusias dan makin percaya diri saat membaca.`);
      setNextStep('Latihan membaca kalimat pendek 3-4 kata.');
      setHomePractice('Membaca 5 kalimat cerita pendek bersama orang tua.');
      setPhotos([]);
      setSelectedTemplateId('');
    }
  }, [initialReport, child]);

  if (!isOpen) return null;

  const currentCategory = getScoreCategory(score);
  const categoryLabel = getScoreCategoryLabel(currentCategory);
  const categoryStyle = getScoreCategoryStyle(currentCategory);

  const handleApplyTemplate = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const tmpl = REPORT_TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setSubject(tmpl.subject);
      setTopic(tmpl.topic);
      setWhatLearned(tmpl.whatLearned);
      setLearningOutcome(
        tmpl.learningOutcome.replace(/Anak/g, child.nickname)
      );
      setScore(tmpl.score);
      setTeacherNotes(tmpl.teacherNotes.replace(/Anak/g, child.nickname));
      setNextStep(tmpl.nextStep);
      setHomePractice(tmpl.homePractice);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError('');

    const file = files[0];
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setUploadError(validation.error || 'File tidak valid');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newPhoto: LessonPhoto = {
        id: 'ph_' + Date.now(),
        childId: child.id,
        url: dataUrl,
        caption: `Dokumentasi belajar ${topic || subject}`,
        createdAt: new Date().toISOString(),
      };
      setPhotos((prev) => [...prev, newPhoto]);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = (shareWhatsappNow: boolean) => {
    const newReport: LessonReport = {
      id: initialReport ? initialReport.id : 'rep_' + Date.now(),
      childId: child.id,
      date,
      durationMinutes,
      subject,
      topic: topic || `${subject} Sesi ${date}`,
      whatLearned,
      learningOutcome,
      score: Number(score),
      scoreCategory: currentCategory,
      teacherNotes,
      nextStep,
      homePractice,
      photos,
      sharedViaWhatsapp: initialReport ? initialReport.sharedViaWhatsapp : false,
      createdAt: initialReport ? initialReport.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveReport(newReport);
    onSaved(newReport, shareWhatsappNow);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src={child.avatarUrl}
              alt={child.fullName}
              className="w-9 h-9 rounded-full object-cover border border-slate-200"
            />
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {initialReport ? 'Edit Laporan Belajar' : 'Buat Laporan Belajar'}
              </h3>
              <p className="text-xs text-slate-500">
                Murid: <span className="font-semibold text-slate-700">{child.fullName}</span> ({child.gradeLevel})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Quick Template Selector */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Gunakan Template Cepat (Hemat Waktu Ketik):</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    selectedTemplateId === tmpl.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  {tmpl.subject}: {tmpl.topic.split('(')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Row 1: Date & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Tanggal Les
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Durasi (Menit)
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
              >
                <option value={45}>45 Menit</option>
                <option value={60}>60 Menit (1 Jam)</option>
                <option value={90}>90 Menit (1,5 Jam)</option>
                <option value={120}>120 Menit (2 Jam)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Subject & Topic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Mata Pelajaran
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
              >
                {SUBJECT_OPTIONS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Topik / Materi Pokok
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Misal: Membaca kata dua suku kata"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
                required
              />
            </div>
          </div>

          {/* Nilai / Score Section with Quick Buttons */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800">
                Nilai & Kategori Perkembangan
              </label>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}>
                {score} · {categoryLabel}
              </span>
            </div>

            {/* Quick Score Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Preset:</span>
              {QUICK_SCORES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScore(s)}
                  className={`w-9 h-8 text-xs font-bold rounded-lg border transition-all ${
                    score === s
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs scale-105'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-16 text-center font-bold text-xs bg-white border border-slate-300 rounded-lg p-1.5 text-slate-900"
              />
            </div>
          </div>

          {/* Apa yang Dipelajari & Hasil Pembelajaran */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Apa yang Dipelajari Hari Ini
              </label>
              <textarea
                value={whatLearned}
                onChange={(e) => setWhatLearned(e.target.value)}
                rows={2}
                placeholder="Latihan membaca gabungan huruf konsonan dan vokal..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white resize-none"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Hasil Pembelajaran
              </label>
              <textarea
                value={learningOutcome}
                onChange={(e) => setLearningOutcome(e.target.value)}
                rows={2}
                placeholder={`Misal: ${child.nickname} dapat membaca 8 dari 10 kata secara mandiri...`}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white resize-none"
                required
              />
            </div>
          </div>

          {/* Catatan Guru, Tahap Berikutnya & Rekomendasi Latihan di Rumah */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Catatan Guru untuk Orang Tua
              </label>
              <textarea
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                rows={2}
                placeholder={`${child.nickname} mulai lebih percaya diri...`}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Tahap Pembelajaran Berikutnya
                </label>
                <textarea
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  rows={2}
                  placeholder="Latihan membaca kalimat pendek 3-4 kata..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Rekomendasi Latihan di Rumah
                </label>
                <textarea
                  value={homePractice}
                  onChange={(e) => setHomePractice(e.target.value)}
                  rows={2}
                  placeholder="Membaca 5 kalimat bersama orang tua selama 10 menit..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white resize-none"
                />
              </div>
            </div>
          </div>

          {/* Foto Kegiatan Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-500" /> Foto Kegiatan (Maks 5 MB)
              </label>
              <span className="text-[11px] text-slate-400">
                {photos.length} foto terlampir
              </span>
            </div>

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200 mb-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Photos Preview */}
            <div className="flex flex-wrap gap-2.5 mb-2">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Foto kegiatan'}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id)}
                    className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity"
                    title="Hapus foto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Upload trigger button */}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-500 hover:text-indigo-600">
                <Camera className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-semibold">+ Foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="px-4 py-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan Saja
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              Simpan & Share WA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
