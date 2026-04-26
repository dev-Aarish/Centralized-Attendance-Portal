import React, { useState, useEffect } from 'react';
import AppLayout from '../../components/shared/AppLayout';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { getMyStudentProfile } from '../../lib/profile';
import SpiralLoader from '../../components/shared/Loader';
import { formatCohort, formatYearSection } from '../../lib/format';

const timeSlots = Array.from({ length: 9 }, (_, i) => {
  const hour = 9 + i;
  return hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? `12:00 PM` : `${hour}:00 AM`;
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DAY_MAP = {
  mon: 'Monday',
  monday: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
};

function normalizeDay(dayValue) {
  if (!dayValue) return dayValue;
  const key = String(dayValue).trim().toLowerCase();
  return DAY_MAP[key] || dayValue;
}

const getTypeStyles = (courseCode) => {
  if (!courseCode) return 'bg-slate-800/60 border border-slate-600/50 text-slate-200';

  // Special Blocks Styling
  if (courseCode === 'LIB') return 'bg-slate-800/60 border-slate-600/80 border-dashed text-slate-300 shadow-none';
  if (courseCode === 'REM') return 'bg-orange-900/30 border-orange-800/80 border-dashed text-orange-300 shadow-none';
  if (courseCode === 'LUNCH') return 'bg-yellow-900/30 border-yellow-800/80 border-dashed text-yellow-300 shadow-none';

  const sum = String(courseCode).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const colors = [
    'bg-gradient-to-br from-indigo-500/10 to-indigo-600/20 border-indigo-500/30 hover:border-indigo-400/60 text-indigo-50 shadow-[0_4px_20px_-10px_rgba(99,102,241,0.1)]',
    'bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 border-emerald-500/30 hover:border-emerald-400/60 text-emerald-50 shadow-[0_4px_20px_-10px_rgba(16,185,129,0.1)]',
    'bg-gradient-to-br from-purple-500/10 to-purple-600/20 border-purple-500/30 hover:border-purple-400/60 text-purple-50 shadow-[0_4px_20px_-10px_rgba(168,85,247,0.1)]',
    'bg-gradient-to-br from-amber-500/10 to-amber-600/20 border-amber-500/30 hover:border-amber-400/60 text-amber-50 shadow-[0_4px_20px_-10px_rgba(245,158,11,0.1)]',
    'bg-gradient-to-br from-pink-500/10 to-pink-600/20 border-pink-500/30 hover:border-pink-400/60 text-pink-50 shadow-[0_4px_20px_-10px_rgba(236,72,153,0.1)]',
    'bg-gradient-to-br from-cyan-500/10 to-cyan-600/20 border-cyan-500/30 hover:border-cyan-400/60 text-cyan-50 shadow-[0_4px_20px_-10px_rgba(6,182,212,0.1)]',
  ];
  return colors[sum % colors.length];
}

export default function StudentSchedule() {
  const [mounted, setMounted] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [profileSection, setProfileSection] = useState('');
  const [profileYear, setProfileYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    setMounted(true);
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    try {
      setError(null);
      const [data, profileRes] = await Promise.all([
        apiFetch('/api/v1/schedules/student', {
          cache: false,
          forceRefresh: true,
        }),
        getMyStudentProfile(),
      ]);

      setProfileSection(profileRes?.data?.section || '');
      setProfileYear(profileRes?.data?.year_of_study || '');
      const rawItems = data.data || [];
      console.log("FETCHED SCHEDULE DATA:", rawItems);

      if (rawItems.length === 0) {
        setSchedule([]);
        return;
      }

      const formatted = rawItems
        .map(s => {
          // Handle both camelCase and snake_case field names
          const timeSlot = s.timeSlot || s.time_slot || '';
          const roomNumber = s.roomNumber || s.room_number || 'TBA';

          // Null-safe time parsing
          if (!timeSlot) {
            console.warn('[StudentSchedule] Skipping entry with empty time_slot:', s.id);
            return null;
          }

          const timeParts = timeSlot.split('-');
          const startHour = parseInt(timeParts[0]?.split(':')[0]);
          const endHour = timeParts.length > 1 ? parseInt(timeParts[1]?.split(':')[0]) : startHour + 1;

          if (isNaN(startHour) || isNaN(endHour)) {
            console.warn('[StudentSchedule] Invalid time format for entry:', s.id, timeSlot);
            return null;
          }

          return {
            id: s.id,
            day: normalizeDay(s.day),
            start: startHour,
            duration: Math.max(1, endHour - startHour),
            title: s.courses?.name || s.class_sections?.courses?.name,
            code: s.courses?.code || s.class_sections?.courses?.code,
            instructor: s.resolved_teacher_name || s.class_sections?.teacher_assignments?.[0]?.teacher_profiles?.profiles?.full_name || 'Unassigned',
            room: roomNumber,
            section: s.class_sections?.section,
          };
        })
        .filter(Boolean); // Remove any null entries from bad data

      setSchedule(formatted);
    } catch (err) {
      console.error('Error fetching student schedule:', err);
      setError('Failed to load schedule. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  // Resolve section for header safely: prefer section from schedule blocks,
  // then fall back to student profile section.
  const firstScheduleSection = schedule.find((item) => item?.section)?.section;
  const resolvedSection = firstScheduleSection || profileSection || '';
  const currentSection = loading
    ? 'Loading...'
    : resolvedSection
      ? formatYearSection(profileYear, resolvedSection)
      : 'Section not assigned';

  return (
    <AppLayout title="Schedule">
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        {/* Header Section */}
        <div
          className={`flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8 transition-all duration-700 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Class Schedule</h1>
            <p className="text-gray-500 mt-2 text-lg">Your weekly academic timeline</p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-4 shadow-xl shadow-slate-900/10 sm:min-w-[280px]">
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-indigo-400">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Section</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5">{currentSection}</p>
            </div>
          </div>
        </div>

        {/* Schedule Grid Container - Modern Dark Theme */}
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
            <div className="flex-1 flex items-center justify-center text-slate-500">
              No schedule found for your enrolled classes.
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
                {/* End border for the last column */}
                <div className="border-l border-slate-800/60 pointer-events-none" style={{ gridColumn: `${timeSlots.length + 2}/${timeSlots.length + 3}`, gridRow: `1/${days.length + 2}` }}></div>

                {/* Horizontal Lines between Days */}
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
                  if (dayIndex === -1) return null; // Safety check

                  const rowStart = 2 + dayIndex;
                  const rowEnd = rowStart + 1;

                  // Convert start time (e.g. 8) to column index. 8 -> col 2.
                  const colStart = 2 + (item.start - 9);
                  const colEnd = colStart + item.duration;

                  const styleClasses = getTypeStyles(item.code);

                  return (
                    <div
                      key={`item-${item.id}-${i}`}
                      className={`
                        ${styleClasses} 
                        rounded-[12px] z-20 px-3 py-2 my-1
                        flex flex-col justify-center items-center text-center
                        transition-all duration-300 ease-out
                        ${['LIB', 'REM', 'LUNCH'].includes((item.code || '').trim().toUpperCase())
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
                    >
                      <div className="flex flex-col items-center justify-center w-full gap-0.5 mb-1.5">
                        <span className="font-bold text-[13px] leading-tight group-hover:text-white transition-colors truncate w-full">
                          {item.code}
                        </span>
                        <span className="text-[10px] opacity-80 leading-tight truncate w-full">
                          {item.title}
                        </span>
                      </div>

                      {!['LIB', 'REM', 'LUNCH'].includes(item.code) && (
                        <div className="flex flex-col items-center gap-y-1 text-[11px] opacity-85 group-hover:opacity-100 transition-opacity w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                            <span className="truncate">{item.room || 'TBA'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            <span className="truncate">{item.instructor}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          )}

          {/* Subtle footer */}
          <div className="bg-slate-950/50 px-8 py-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <p>Targeting 100% attendance</p>
          </div>
        </div>

      </div>

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
      `}} />
    </AppLayout>
  );
}