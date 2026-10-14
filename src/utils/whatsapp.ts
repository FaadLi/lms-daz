import { LessonReport, Child, Parent } from '../types';
import { getScoreCategoryLabel, formatDateIndo } from '../data/presets';

export function generateReportShareMessage({
  child,
  parent,
  report,
  privateLink,
}: {
  child: Child;
  parent?: Parent;
  report: LessonReport;
  privateLink: string;
}): string {
  const greeting = parent ? `Halo Bapak/Ibu ${parent.fullName}` : `Halo Bapak/Ibu`;
  const categoryLabel = getScoreCategoryLabel(report.scoreCategory);
  const formattedDate = formatDateIndo(report.date);

  return `${greeting},

Berikut laporan perkembangan belajar ${child.nickname} pada ${formattedDate}:

📚 Materi:
${report.subject} - ${report.topic}

⭐ Nilai:
${report.score} (${categoryLabel})

✨ Hasil Pembelajaran:
${report.learningOutcome}

🌱 Tahap Berikutnya:
${report.nextStep}

Laporan lengkap, riwayat nilai, jadwal, dan dokumentasi foto dapat dilihat melalui tautan resmi berikut:
${privateLink}

Terima kasih atas kerja samanya.
Salam hangat dari Guru Les.`.trim();
}

export function cleanWhatsappNumber(phone: string): string {
  if (!phone) return '';
  // Remove non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  // If starts with 0, convert to 62 (Indonesia)
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  // If starts with +62
  if (cleaned.startsWith('62')) {
    return cleaned;
  }
  return cleaned;
}

export function createWhatsappUrl(phone: string, message: string): string {
  const cleanedPhone = cleanWhatsappNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (cleanedPhone) {
    return `https://wa.me/${cleanedPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}
