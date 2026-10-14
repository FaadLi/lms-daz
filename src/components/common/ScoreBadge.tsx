import React from 'react';
import { ScoreCategory } from '../../types';
import { getScoreCategoryLabel, getScoreCategoryStyle } from '../../data/presets';

interface ScoreBadgeProps {
  score: number;
  category?: ScoreCategory;
  size?: 'sm' | 'md' | 'lg';
  showCategory?: boolean;
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  category,
  size = 'md',
  showCategory = true,
}) => {
  const cat = category || (score >= 90 ? 'sangat_baik' : score >= 80 ? 'berkembang_baik' : score >= 70 ? 'perlu_latihan' : 'perlu_pendampingan');
  const style = getScoreCategoryStyle(cat);
  const label = getScoreCategoryLabel(cat);

  if (size === 'lg') {
    return (
      <div className="flex items-baseline gap-3">
        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
          {score}
        </span>
        {showCategory && (
          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}`}>
            {label}
          </span>
        )}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs">
        <span className="font-bold text-slate-900 tabular-nums">{score}</span>
        {showCategory && (
          <span className={`font-medium ${style.text}`}>
            · {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-lg font-bold text-slate-900 tabular-nums">{score}</span>
      {showCategory && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
          {label}
        </span>
      )}
    </div>
  );
};
