import React from 'react';
import { formatShortDateIndo } from '../../data/presets';

interface ProgressChartProps {
  reports: {id:string;date:string;score:number;topic:string}[];
  childName: string;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ reports, childName }) => {
  if (!reports || reports.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 text-center text-sm text-slate-500">
        Belum ada histori nilai untuk menampilkan grafik perkembangan.
      </div>
    );
  }

  // Sort chronological (oldest to newest for trend)
  const sortedReports = [...reports]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-6); // Last 6 lessons

  const scores = sortedReports.map((r) => r.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);
  const range = maxScore - minScore || 1;

  // Compute SVG dimensions
  const width = 340;
  const height = 130;
  const paddingX = 24;
  const paddingTop = 20;
  const paddingBottom = 26;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = sortedReports.map((r, index) => {
    const x =
      sortedReports.length === 1
        ? width / 2
        : paddingX + (index / (sortedReports.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((r.score - minScore) / range) * chartHeight;
    return { x, y, score: r.score, date: r.date, topic: r.topic };
  });

  const pathD = points.reduce((acc, curr, index) => {
    if (index === 0) return `M ${curr.x} ${curr.y}`;
    // Smooth bezier curve
    const prev = points[index - 1];
    const cpX1 = prev.x + (curr.x - prev.x) / 2;
    const cpX2 = cpX1;
    return `${acc} C ${cpX1} ${prev.y}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y}`;
  }, '');

  // Calculate simple trend insight
  let insightText: string;
  if (scores.length >= 2) {
    const first = scores[0];
    const last = scores[scores.length - 1];
    const diff = Math.round((last - first) * 10) / 10;
    if (diff > 0) {
      insightText = `Nilai ${childName} menunjukkan tren perkembangan positif (+${diff} poin) dalam ${scores.length} sesi terakhir.`;
    } else if (diff === 0) {
      insightText = `Perkembangan ${childName} terjaga stabil dan konsisten pada nilai ${last}.`;
    } else {
      insightText = `Perlu pengulangan materi ringan untuk memperkuat penguasaan topik terakhir.`;
    }
  } else {
    insightText = `Sesi perdana tercatat dengan nilai ${scores[0]}. Lanjutkan pendampingan berkala.`;
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Grafik Perkembangan Nilai</h4>
          <p className="text-xs text-slate-500 mt-0.5">Tren hasil belajar 6 pertemuan terakhir</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 tabular-nums">
            Rata-rata: {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10}
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden flex justify-center py-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-sm h-auto select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          <line
            x1={paddingX}
            y1={paddingTop}
            x2={width - paddingX}
            y2={paddingTop}
            stroke="#f1f5f9"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingTop + chartHeight / 2}
            x2={width - paddingX}
            y2={paddingTop + chartHeight / 2}
            stroke="#f1f5f9"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingTop + chartHeight}
            x2={width - paddingX}
            y2={paddingTop + chartHeight}
            stroke="#e2e8f0"
          />

          {/* Area under curve */}
          {points.length > 1 && (
            <path
              d={`${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`}
              fill="url(#chartGradient)"
            />
          )}

          {/* Curve line */}
          <path
            d={pathD}
            fill="none"
            stroke="#4f46e5"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots and Labels */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                fill="#ffffff"
                stroke="#4f46e5"
                strokeWidth="2.5"
              />
              {/* Score text above dot */}
              <text
                x={pt.x}
                y={pt.y - 8}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#1e293b"
                className="font-mono tabular-nums"
              >
                {pt.score}
              </text>
              {/* Date text below chart */}
              <text
                x={pt.x}
                y={paddingTop + chartHeight + 16}
                textAnchor="middle"
                fontSize="9"
                fontWeight="500"
                fill="#64748b"
              >
                {formatShortDateIndo(pt.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {insightText && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-600 bg-slate-50/80 rounded-lg p-2.5">
          <span className="text-indigo-600 font-bold shrink-0">💡 Catatan Perkembangan:</span>
          <span>{insightText}</span>
        </div>
      )}
    </div>
  );
};
