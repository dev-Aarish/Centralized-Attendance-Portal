import React, { useState, useEffect } from 'react';
import AppLayout from '../../components/shared/AppLayout';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

const timeSlots = Array.from({ length: 10 }, (_, i) => {
  const hour = 8 + i;
  return hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? `12:00 PM` : `${hour}:00 AM`;
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getTypeStyles = (courseCode) => {
  if (!courseCode) return 'bg-slate-800/60 border border-slate-600/50 text-slate-200';
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

export default function TeacherSchedule() {
  const [mounted, setMounted] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    setMounted(true);
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    try {
      const data = await apiFetch('/api/v1/schedule/teacher');
      const formatted = (data.data || []).map(s => {
        const timeParts = s.time_slot.split('-');
        const startHour = parseInt(timeParts[0].split(':')[0]);
        const endHour = timeParts.length > 1 ? parseInt(timeParts[1].split(':')[0]) : startHour + 1;
        
        return {
          id: s.id,
          day: s.day,
          start: startHour,
          duration: endHour - startHour,
          title: s.class_sections?.courses?.name,
          code: s.class_sections?.courses?.code,
          room: s.room_number,
          section: s.class_sections?.section,
        };
      });
      setSchedule(formatted);
    } catch (err) {
      console.error('Error fetching teacher schedule:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout title="My Schedule">
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        {/* Header Section */}
        <div 
          className={`flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8 transition-all duration-700 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teaching Schedule</h1>
            <p className="text-gray-500 mt-2 text-lg">Your weekly assigned classes</p>
          </div>
          
          <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-4 shadow-xl shadow-slate-900/10 sm:min-w-[280px]">
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-400">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Classes</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5">{schedule.length} Sessions / Week</p>
            </div>
          </div>
        </div>

        {/* Schedule Grid Container */}
        <div 
          className={`flex-1 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-1000 delay-100 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : schedule.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              No classes assigned to you yet.
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
                    style={{ gridColumn: `${i+2}/${i+3}`, gridRow: `1/${days.length + 2}` }}
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
                    style={{ gridColumn: `${i+2}/${i+3}`, gridRow: '1/2' }}
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
                    style={{ gridColumn: '1/2', gridRow: `${i+2}/${i+3}` }}
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

                  const colStart = 2 + (item.start - 8);
                  const colEnd = colStart + item.duration;
                  
                  const styleClasses = getTypeStyles(item.code);

                  return (
                    <div 
                      key={`item-${item.id}-${i}`} 
                      className={`
                        ${styleClasses} 
                        rounded-[12px] z-20 px-3 py-2 my-1
                        flex flex-col justify-center items-center text-center
                        transition-all duration-300 ease-out backdrop-blur-md
                        hover:-translate-y-1 hover:scale-[1.02] hover:z-30 cursor-pointer shadow-lg
                        group overflow-hidden border
                      `} 
                      style={{ 
                        gridColumn: `${colStart}/${colEnd}`, 
                        gridRow: `${rowStart}/${rowEnd}`,
                        animationDelay: `${(dayIndex * 50) + ((item.start - 8) * 20)}ms`,
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
                      
                      <div className="flex flex-col items-center gap-y-1 text-[11px] opacity-85 group-hover:opacity-100 transition-opacity w-full">
                        <div className="flex items-center justify-between w-full px-1">
                          <div className="flex items-center gap-1 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span className="truncate">{item.room || 'TBA'}</span>
                          </div>
                          <span className="font-bold bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[9px]">
                            Sec {item.section}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
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
