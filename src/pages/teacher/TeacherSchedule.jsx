import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/shared/AppLayout';
import { apiFetch } from '../../lib/api';
import SpiralLoader from '../../components/shared/Loader'
import { formatCohort } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';

const timeSlots = Array.from({ length: 9 }, (_, i) => {
  const hour = 9 + i;
  return hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? `12:00 PM` : `${hour}:00 AM`;
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DAY_MAP = {
  mon: 'Monday', monday: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
  wed: 'Wednesday', wednesday: 'Wednesday',
  thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
  fri: 'Friday', friday: 'Friday',
  sat: 'Saturday', saturday: 'Saturday',
};

function normalizeDay(dayValue) {
  if (!dayValue) return dayValue;
  const key = String(dayValue).trim().toLowerCase();
  return DAY_MAP[key] || dayValue;
}

// Color palette for distinguishing different section/year combos
const SECTION_PALETTES = [
  { bg: 'from-indigo-500/10 to-indigo-600/20', border: 'border-indigo-500/30', hoverBorder: 'hover:border-indigo-400/60', text: 'text-indigo-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(99,102,241,0.1)]', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { bg: 'from-emerald-500/10 to-emerald-600/20', border: 'border-emerald-500/30', hoverBorder: 'hover:border-emerald-400/60', text: 'text-emerald-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(16,185,129,0.1)]', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { bg: 'from-purple-500/10 to-purple-600/20', border: 'border-purple-500/30', hoverBorder: 'hover:border-purple-400/60', text: 'text-purple-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(168,85,247,0.1)]', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { bg: 'from-amber-500/10 to-amber-600/20', border: 'border-amber-500/30', hoverBorder: 'hover:border-amber-400/60', text: 'text-amber-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(245,158,11,0.1)]', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { bg: 'from-pink-500/10 to-pink-600/20', border: 'border-pink-500/30', hoverBorder: 'hover:border-pink-400/60', text: 'text-pink-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(236,72,153,0.1)]', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  { bg: 'from-cyan-500/10 to-cyan-600/20', border: 'border-cyan-500/30', hoverBorder: 'hover:border-cyan-400/60', text: 'text-cyan-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(6,182,212,0.1)]', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  { bg: 'from-rose-500/10 to-rose-600/20', border: 'border-rose-500/30', hoverBorder: 'hover:border-rose-400/60', text: 'text-rose-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(244,63,94,0.1)]', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { bg: 'from-teal-500/10 to-teal-600/20', border: 'border-teal-500/30', hoverBorder: 'hover:border-teal-400/60', text: 'text-teal-50', shadow: 'shadow-[0_4px_20px_-10px_rgba(20,184,166,0.1)]', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
];

const SPECIAL_STYLES = {
  LIB: 'bg-slate-800/60 border-slate-600/80 border-dashed text-slate-300 shadow-none',
  REM: 'bg-orange-900/30 border-orange-800/80 border-dashed text-orange-300 shadow-none',
  LUNCH: 'bg-yellow-900/30 border-yellow-800/80 border-dashed text-yellow-300 shadow-none',
};

function getSectionKey(item) {
  const section = item.section || '';
  const year = item.yearOfStudy || '';
  const dept = item.department || '';
  return `${dept}-Y${year}-${section}`;
}

function formatHour(h) {
  if (h === 0 || h === 12) return `12:00 ${h === 0 ? 'AM' : 'PM'}`;
  return h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
}

export default function TeacherSchedule() {
  const [mounted, setMounted] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const { user } = useAuth();

  // Map section keys to palette indices for consistent coloring
  const [sectionColorMap, setSectionColorMap] = useState({});

  // Close detail panel on Escape
  useEffect(() => {
    if (!selectedBlock) return;
    const handler = (e) => { if (e.key === 'Escape') setSelectedBlock(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedBlock]);

  useEffect(() => {
    setMounted(true);
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    try {
      setError(null);
      const data = await apiFetch('/api/v1/schedules/teacher', {
        cache: false,
        forceRefresh: true,
      });
      const rawItems = data.data || [];

      if (rawItems.length === 0) {
        setSchedule([]);
        return;
      }

      const formatted = rawItems
        .map(s => {
          const timeSlot = s.timeSlot || s.time_slot || '';
          const roomNumber = s.roomNumber || s.room_number || 'TBA';

          if (!timeSlot) {
            console.warn('[TeacherSchedule] Skipping entry with empty time_slot:', s.id);
            return null;
          }

          const timeParts = timeSlot.split('-');
          const startHour = parseInt(timeParts[0]?.split(':')[0]);
          const endHour = timeParts.length > 1 ? parseInt(timeParts[1]?.split(':')[0]) : startHour + 1;

          if (isNaN(startHour) || isNaN(endHour)) {
            console.warn('[TeacherSchedule] Invalid time format:', s.id, timeSlot);
            return null;
          }

          return {
            id: s.id,
            day: normalizeDay(s.day),
            start: startHour,
            duration: Math.max(1, endHour - startHour),
            title: s.courses?.name || s.class_sections?.courses?.name,
            code: s.courses?.code || s.class_sections?.courses?.code,
            room: roomNumber,
            section: s.class_sections?.section || '',
            yearOfStudy: s.class_sections?.year_of_study || '',
            department: s.class_sections?.department || '',
          };
        })
        .filter(Boolean);

      // Build color map based on unique section keys
      const uniqueKeys = [...new Set(formatted.map(getSectionKey))];
      const colorMap = {};
      uniqueKeys.forEach((key, i) => {
        colorMap[key] = i % SECTION_PALETTES.length;
      });
      setSectionColorMap(colorMap);

      setSchedule(formatted);
    } catch (err) {
      console.error('Error fetching teacher schedule:', err);
      setError('Failed to load schedule. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  function getStyleForItem(item) {
    const code = (item.code || '').trim().toUpperCase();
    if (SPECIAL_STYLES[code]) return { classes: SPECIAL_STYLES[code], palette: null };

    const key = getSectionKey(item);
    const paletteIndex = sectionColorMap[key] ?? 0;
    const p = SECTION_PALETTES[paletteIndex];
    return {
      classes: `bg-gradient-to-br ${p.bg} ${p.border} ${p.hoverBorder} ${p.text} ${p.shadow}`,
      palette: p,
    };
  }

  // Compute unique sections for legend
  const uniqueSections = [...new Set(schedule.map(getSectionKey))].map(key => {
    const item = schedule.find(s => getSectionKey(s) === key);
    const paletteIndex = sectionColorMap[key] ?? 0;
    return {
      key,
      section: item?.section || '—',
      year: item?.yearOfStudy || '—',
      department: item?.department || '—',
      palette: SECTION_PALETTES[paletteIndex],
    };
  });

  // Stat chips
  const totalClasses = schedule.filter(s => !['LIB', 'REM', 'LUNCH'].includes((s.code || '').trim().toUpperCase())).length;
  const uniqueSectionsCount = uniqueSections.length;

  return (
    <AppLayout title="My Schedule">
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        {/* Header Section */}
        <div
          className={`flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-6 transition-all duration-700 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teaching Schedule</h1>
            <p className="text-gray-500 mt-2 text-lg">Your weekly assigned classes across all sections</p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-4 shadow-xl shadow-slate-900/10">
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-400">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Classes</p>
                <p className="text-sm font-medium text-slate-200 mt-0.5">{totalClasses} / Week</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-4 shadow-xl shadow-slate-900/10">
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-400">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sections</p>
                <p className="text-sm font-medium text-slate-200 mt-0.5">{uniqueSectionsCount} Assigned</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section Legend */}
        {!loading && uniqueSections.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-5 transition-all duration-700 delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            {uniqueSections.map(s => (
              <div
                key={s.key}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${s.palette.badge} backdrop-blur-sm`}
              >
                <span className="font-bold">{s.department}</span>
                <span className="opacity-60">·</span>
                <span>Year {s.year}</span>
                <span className="opacity-60">·</span>
                <span>Sec {s.section}</span>
              </div>
            ))}
          </div>
        )}

        {/* Schedule Grid Container */}
        <div
          className={`flex-1 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-1000 delay-100 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <SpiralLoader />
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 max-w-md">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-red-400 mx-auto mb-3"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                <p className="text-red-300 text-sm font-medium">{error}</p>
                <button onClick={() => { setLoading(true); fetchSchedule(); }} className="mt-4 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors border border-red-500/30">
                  Try Again
                </button>
              </div>
            </div>
          ) : schedule.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 py-20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 text-slate-600">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              <p className="text-sm font-medium">No classes assigned to you yet</p>
              <p className="text-xs text-slate-600">Ask your admin to assign sections and create a schedule</p>
            </div>
          ) : (
            <div className="p-4 md:p-6 overflow-x-auto custom-scrollbar flex-1">
              <div
                className="grid gap-2.5 select-none min-w-[1000px]"
                style={{
                  gridTemplateColumns: `80px repeat(${timeSlots.length}, minmax(120px, 1fr))`,
                  gridAutoRows: 'minmax(60px, auto)'
                }}
              >

                {/* Vertical Lines */}
                {timeSlots.map((_, i) => (
                  <div
                    key={`vline-${i}`}
                    className="border-l border-slate-800/60 pointer-events-none"
                    style={{ gridColumn: `${i + 2}/${i + 3}`, gridRow: `1/${days.length + 2}` }}
                  ></div>
                ))}
                <div className="border-l border-slate-800/60 pointer-events-none" style={{ gridColumn: `${timeSlots.length + 2}/${timeSlots.length + 3}`, gridRow: `1/${days.length + 2}` }}></div>

                {/* Horizontal Lines */}
                {days.map((_, i) => (
                  <div
                    key={`hline-${i}`}
                    className="border-t border-slate-800/60 pointer-events-none"
                    style={{ gridColumn: `1/${timeSlots.length + 3}`, gridRow: `${2 + i}/${3 + i}` }}
                  ></div>
                ))}

                {/* Time Slot Headers */}
                {timeSlots.map((slot, i) => (
                  <div
                    key={`header-slot-${i}`}
                    className="pb-2 pt-1 font-semibold text-left pl-3 text-[12px] text-slate-500 z-10"
                    style={{ gridColumn: `${i + 2}/${i + 3}`, gridRow: '1/2' }}
                  >
                    {slot}
                  </div>
                ))}

                {/* Corner Empty Space */}
                <div style={{ gridColumn: '1/2', gridRow: '1/2' }}></div>

                {/* Day Labels */}
                {days.map((day, i) => (
                  <div
                    key={`label-${day}`}
                    className="font-bold text-slate-200 flex items-center justify-center text-sm tracking-widest z-10 uppercase bg-slate-800/30 rounded-l-xl my-1 border-y border-l border-slate-800/50 mr-2"
                    style={{ gridColumn: '1/2', gridRow: `${i + 2}/${i + 3}` }}
                  >
                    {day.substring(0, 3)}
                  </div>
                ))}

                {/* Animated Schedule Items */}
                {schedule.map((item, i) => {
                  const dayIndex = days.indexOf(item.day);
                  if (dayIndex === -1) return null;

                  const rowStart = 2 + dayIndex;
                  const rowEnd = rowStart + 1;
                  const colStart = 2 + (item.start - 9);
                  const colEnd = colStart + item.duration;

                  const { classes: styleClasses, palette } = getStyleForItem(item);
                  const isSpecial = ['LIB', 'REM', 'LUNCH'].includes((item.code || '').trim().toUpperCase());

                  return (
                    <div
                      key={`item-${item.id}-${i}`}
                      className={`
                        ${styleClasses}
                        rounded-[12px] z-20 px-3 py-2 my-1
                        flex flex-col justify-center items-center text-center
                        transition-all duration-300 ease-out
                        ${isSpecial
                          ? 'cursor-default shadow-none border-none ring-0'
                          : 'backdrop-blur-md border hover:-translate-y-1 hover:scale-[1.02] hover:z-30 cursor-pointer shadow-lg'}
                        group overflow-hidden
                      `}
                      style={{
                        gridColumn: `${colStart}/${colEnd}`,
                        gridRow: `${rowStart}/${rowEnd}`,
                        animationDelay: `${(dayIndex * 50) + ((item.start - 9) * 20)}ms`,
                        animationFillMode: 'both',
                        animation: mounted ? `fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards` : 'none'
                      }}
                      onClick={() => !isSpecial && setSelectedBlock(item)}
                    >
                      <div className="flex flex-col items-center justify-center w-full gap-0.5 mb-1">
                        <span className="font-bold text-[13px] leading-tight group-hover:text-white transition-colors truncate w-full">
                          {item.code}
                        </span>
                        <span className="text-[10px] opacity-80 leading-tight truncate w-full">
                          {item.title}
                        </span>
                      </div>

                      {!isSpecial && (
                        <div className="flex flex-col items-center gap-y-1 text-[11px] opacity-85 group-hover:opacity-100 transition-opacity w-full">
                          <div className="flex items-center justify-between w-full px-1">
                            <div className="flex items-center gap-1 truncate">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                              <span className="truncate">{item.room || 'TBA'}</span>
                            </div>
                            {palette && (
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] leading-none border ${palette.badge}`}>
                                {item.department ? `${item.department} ` : ''}Y{item.yearOfStudy || '?'} · {item.section || '—'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-slate-950/50 px-8 py-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <p>Schedule auto-updates when admin makes changes</p>
            <button
              onClick={() => { setLoading(true); fetchSchedule(); }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

      </div>

      {/* Detail Modal Overlay */}
      {selectedBlock && (() => {
        const block = selectedBlock;
        const { classes: blockStyle, palette: blockPalette } = getStyleForItem(block);
        const timeRange = `${formatHour(block.start)} – ${formatHour(block.start + block.duration)}`;
        return (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={() => setSelectedBlock(null)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" style={{ animation: 'modalFadeIn 0.2s ease-out' }} />

            {/* Modal Card */}
            <div
              className="relative w-full max-w-sm bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden"
              style={{ animation: 'modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top accent bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${blockPalette ? blockPalette.bg.replace('to-', 'to-r ').replace('from-', '') : 'from-indigo-500 to-purple-500'}`} />

              {/* Close button */}
              <button
                onClick={() => setSelectedBlock(null)}
                className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
              </button>

              <div className="p-6 pt-5">
                {/* Course Code & Name */}
                <div className="mb-5">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="text-xl font-bold text-white tracking-tight">{block.code}</h3>
                    {blockPalette && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${blockPalette.badge}`}>
                        {block.department || ''} Y{block.yearOfStudy || '?'} · Sec {block.section || '—'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{block.title || 'Untitled Course'}</p>
                </div>

                {/* Detail rows */}
                <div className="space-y-3">
                  {/* Day & Time */}
                  <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
                    <div className="p-2 rounded-lg bg-slate-700/60">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-indigo-400"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Day & Time</p>
                      <p className="text-sm text-slate-200 font-medium">{block.day} · {timeRange}</p>
                    </div>
                  </div>

                  {/* Room */}
                  <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
                    <div className="p-2 rounded-lg bg-slate-700/60">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Room</p>
                      <p className="text-sm text-slate-200 font-medium">{block.room || 'TBA'}</p>
                    </div>
                  </div>

                  {/* Section Info */}
                  <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
                    <div className="p-2 rounded-lg bg-slate-700/60">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Class</p>
                      <p className="text-sm text-slate-200 font-medium">
                        {formatCohort(block.department, block.yearOfStudy, block.section)}
                      </p>
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
                    <div className="p-2 rounded-lg bg-slate-700/60">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-purple-400"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Duration</p>
                      <p className="text-sm text-slate-200 font-medium">{block.duration} hour{block.duration > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5">
                <button
                  onClick={() => setSelectedBlock(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700/50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}} />
    </AppLayout>
  );
}