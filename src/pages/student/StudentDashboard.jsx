import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppLayout from '../../components/shared/AppLayout'
import SpiralLoader from '../../components/shared/Loader'
import { getMyAttendanceDetails, getMyAttendanceSummaryByType } from '../../lib/attendance'
import { getMyStudentSchedule } from '../../lib/schedule'
import { getMyStudentProfile } from '../../lib/profile'

// --- Helpers ---
const DAY_MS = 24 * 60 * 60 * 1000;
const getLocalDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

// --- Components ---

// 1. Triple Concentric Activity Rings (Apple Watch style)
const TripleActivityRings = ({ overall = 0, lecture = 0, lab = 0, size = 280 }) => {
  const center = size / 2;
  const strokeWidth = size * 0.08;
  const gap = size * 0.02;
  
  // Radii
  const r1 = (size / 2) - strokeWidth;
  const r2 = r1 - strokeWidth - gap;
  const r3 = r2 - strokeWidth - gap;
  
  // Circumferences
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  const c3 = 2 * Math.PI * r3;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background glow */}
      <div className="absolute inset-0 rounded-full opacity-20 blur-3xl bg-gradient-to-tr from-emerald-500 via-cyan-500 to-blue-500" />
      
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 filter drop-shadow-xl z-10">
        {/* Tracks */}
        <circle cx={center} cy={center} r={r1} fill="none" stroke="#1a2e25" strokeWidth={strokeWidth} strokeLinecap="round" />
        <circle cx={center} cy={center} r={r2} fill="none" stroke="#152636" strokeWidth={strokeWidth} strokeLinecap="round" />
        <circle cx={center} cy={center} r={r3} fill="none" stroke="#362015" strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Progress (Animated) */}
        <motion.circle 
          cx={center} cy={center} r={r1} fill="none" 
          stroke="url(#gradOverall)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c1}
          initial={{ strokeDashoffset: c1 }}
          animate={{ strokeDashoffset: c1 - (c1 * Math.min(overall, 100)) / 100 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        />
        <motion.circle 
          cx={center} cy={center} r={r2} fill="none" 
          stroke="url(#gradLecture)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c2}
          initial={{ strokeDashoffset: c2 }}
          animate={{ strokeDashoffset: c2 - (c2 * Math.min(lecture, 100)) / 100 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
        />
        <motion.circle 
          cx={center} cy={center} r={r3} fill="none" 
          stroke="url(#gradLab)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c3}
          initial={{ strokeDashoffset: c3 }}
          animate={{ strokeDashoffset: c3 - (c3 * Math.min(lab, 100)) / 100 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.6 }}
        />

        {/* Gradients */}
        <defs>
          <linearGradient id="gradOverall" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="gradLecture" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="gradLab" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
      </svg>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
        <div className="text-4xl font-black text-white flex items-baseline drop-shadow-lg">
          <NumberCounter value={overall} duration={1.5} />
          <span className="text-xl ml-1 text-white/50"></span>
        </div>
      </div>
    </div>
  );
};

// 2. Animated Number Counter
const NumberCounter = ({ value, duration = 1.5, className = "" }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime;
    let animationFrame;
    
    const update = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(ease * value));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(update);
      }
    };
    
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <span className={className}>{count}</span>;
};

// 3. Smooth & Sexy Holographic Trend Chart
const HolographicTrendChart = ({ dailyData }) => {
  // Filter only days that actually had classes so the trend is meaningful, take last 14 active days
  const activeDays = dailyData.filter(d => d.total > 0).slice(-14);
  
  if (activeDays.length === 0) {
    return (
      <div className="w-full h-48 mt-4 flex items-center justify-center border-b border-white/5">
        <p className="text-white/20 text-sm font-medium">Not enough data to generate trends</p>
      </div>
    );
  }

  return (
    <div className="w-full h-56 mt-4 relative flex items-end justify-between gap-2 md:gap-3 pb-8 border-b border-white/5">
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none rounded-t-3xl" />
      
      {/* Horizontal grid lines */}
      <div className="absolute inset-x-0 bottom-8 top-0 flex flex-col justify-between pointer-events-none z-0">
        {[100, 75, 50, 25, 0].map(pct => (
          <div key={pct} className="w-full flex items-center gap-4">
            <span className="text-[9px] font-bold text-white/20 w-6 text-right">{pct}%</span>
            <div className="flex-1 border-t border-white/5 border-dashed" />
          </div>
        ))}
      </div>

      <div className="relative flex-1 flex items-end justify-between h-[calc(100%-2rem)] z-10 px-2 sm:px-8">
        {activeDays.map((day, i) => {
          const { present, absent, late, total } = day;
          const pct = Math.round((present / total) * 100);
          const isPerfect = pct === 100;
          const isDanger = pct < 75;
          
          let gradient = 'from-emerald-400 to-emerald-600';
          let shadow = 'rgba(52,211,153,0.4)';
          if (isDanger) {
            gradient = 'from-rose-400 to-rose-600';
            shadow = 'rgba(251,113,133,0.4)';
          } else if (!isPerfect) {
            gradient = 'from-amber-400 to-amber-600';
            shadow = 'rgba(251,191,36,0.4)';
          }

          return (
            <div key={day.date} className="relative h-full flex flex-col justify-end group cursor-pointer w-full max-w-[28px]">
              
              {/* Beautiful floating tooltip */}
              <div className="absolute bottom-[calc(100%+15px)] left-1/2 -translate-x-1/2 mb-2 w-max 
                              opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 
                              transition-all duration-300 pointer-events-none z-50">
                <div className="bg-[#1a1a24]/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 flex flex-col items-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  <div className="text-3xl font-black text-white mb-2 drop-shadow-md">{pct}%</div>
                  <div className="flex gap-3 text-xs font-bold bg-black/40 px-3 py-1.5 rounded-full">
                    <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">{present} P</span>
                    <span className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">{late} L</span>
                    <span className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.8)]">{absent} A</span>
                  </div>
                </div>
                {/* Tooltip triangle */}
                <div className="w-3 h-3 bg-[#1a1a24]/90 border-b border-r border-white/10 absolute -bottom-1.5 left-1/2 -translate-x-1/2 rotate-45" />
              </div>

              {/* The Holographic Pill */}
              <div className="w-full relative rounded-full bg-white/5 backdrop-blur-md border border-white/10 h-full overflow-hidden flex flex-col justify-end">
                <motion.div 
                  initial={{ height: 0, opacity: 0 }} 
                  whileInView={{ height: `${pct}%`, opacity: 1 }} 
                  viewport={{ once: true, margin: "0px 0px -50px 0px" }}
                  transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 + (i * 0.08) }}
                  className={`w-full rounded-full bg-gradient-to-t ${gradient} relative`}
                >
                  {/* Inner reflections to make it look 3D / glass */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent w-1/3 rounded-full" />
                  <div className="absolute top-0 inset-x-0 h-1 bg-white/50 rounded-full" />
                </motion.div>
              </div>

              {/* Hover Glow Underneath */}
              <div 
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"
                style={{ backgroundColor: shadow.replace('0.4', '1') }}
              />

              {/* Date Label */}
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/40 whitespace-nowrap">
                {new Date(day.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// 4. Activity Strip (30 days heatmap)
const ActivityStrip = ({ dailyData }) => {
  const today = new Date();
  const days = Array.from({length: 30}, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * DAY_MS);
    const key = getLocalDateKey(d);
    return {
      date: d,
      key,
      data: dailyData.find(x => x.date === key)
    };
  });

  return (
    <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-2 pt-1">
      {days.map((day, i) => {
        const d = day.data;
        let bgClass = "bg-white/5"; // no class
        if (d && d.total > 0) {
          if (d.absent === d.total) bgClass = "bg-rose-500/80";
          else if (d.late > 0) bgClass = "bg-amber-500/80";
          else if (d.present > 0) bgClass = "bg-emerald-500/80";
        }
        
        return (
          <div key={day.key} className="group relative">
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.015 }}
              className={`w-3 h-6 sm:w-4 sm:h-8 rounded-[3px] sm:rounded-md flex-shrink-0 border border-white/5 ${bgClass} hover:ring-2 hover:ring-white/50 transition-all`}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max bg-black text-xs text-white p-2 rounded shadow-lg z-50 pointer-events-none">
              {day.date.toLocaleDateString()}<br/>
              {d ? `${d.present}P ${d.late}L ${d.absent}A` : 'No Class'}
            </div>
          </div>
        );
      })}
    </div>
  );
};


// Main Component
export default function StudentDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    profile: null,
    overall: 0,
    lecture: 0,
    lab: 0,
    subjects: [],
    dailyData: [],
    stats: {
      totalClasses: 0,
      attendedClasses: 0,
      streak: 0,
      bestSubject: null
    }
  });

  useEffect(() => {
    let active = true;
    
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const [profileRes, detailsRes, scheduleRes] = await Promise.all([
          getMyStudentProfile(),
          getMyAttendanceDetails('all'), // gives subject breakdown + records
          getMyStudentSchedule() // good for baseline
        ]);

        if (!active) return;
        
        const profile = profileRes.data;
        const allDetails = detailsRes.data || [];
        
        const scheduleItems = scheduleRes.data || [];
        
        // 1. Process Subjects
        let lecTotal = 0, lecAttended = 0;
        let labTotal = 0, labAttended = 0;
        let totalSessions = 0, totalAttended = 0;
        let bestSubj = null;

        const processedSubjects = allDetails.map(sub => {
          const t = sub.totalClasses || 0;
          const a = sub.attendedClasses || 0;
          const pct = sub.overallPercentage || 0;
          const code = sub.subjectCode || '';
          const name = sub.subjectName || '';
          
          totalSessions += t;
          totalAttended += a;
          
          // Precise Lab Detection via Schedule Cross-referencing
          const schedItem = scheduleItems.find(s => {
             const c = s.class_sections?.courses?.[0] || s.class_sections?.courses || s.courses?.[0] || s.courses;
             return c?.code === code;
          });
          const cObj = schedItem?.class_sections?.courses?.[0] || schedItem?.class_sections?.courses || schedItem?.courses?.[0] || schedItem?.courses || {};
          const courseType = (cObj.type || '').toLowerCase();
          const classType = (schedItem?.class_type || schedItem?.classType || '').toLowerCase();
          
          const nameStr = String(name || '').toUpperCase();
          const codeStr = String(code || '').toUpperCase();
          
          const isLab = 
            courseType === 'lab' || 
            classType === 'lab' || 
            codeStr.endsWith('L') ||
            codeStr.includes('LAB') ||
            nameStr.includes(' LAB') ||
            nameStr.includes('LAB ') ||
            nameStr.includes('(LAB)') ||
            nameStr.endsWith('LAB') ||
            /\bLAB\b/.test(nameStr);

          if (isLab) {
            labTotal += t;
            labAttended += a;
          } else {
            lecTotal += t;
            lecAttended += a;
          }

          if (t > 0 && (!bestSubj || pct > bestSubj.pct)) {
            bestSubj = { name: sub.subjectName, pct, code: sub.subjectCode };
          }
          
          return {
            id: sub.classSectionId || sub.subjectCode,
            name: sub.subjectName,
            code: sub.subjectCode,
            total: t,
            attended: a,
            percentage: pct,
            isLab
          };
        }).sort((a,b) => b.percentage - a.percentage);

        // Calculate Overall %
        const overall = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0;
        const lecture = lecTotal > 0 ? Math.round((lecAttended / lecTotal) * 100) : 0;
        const lab = labTotal > 0 ? Math.round((labAttended / labTotal) * 100) : 0;

        // 2. Process Daily Data (for charts and streak)
        // Flatten all records from all teachers from all subjects
        const flatRecords = [];
        allDetails.forEach(sub => {
          (sub.teachers || []).forEach(t => {
            (t.records || []).forEach(r => {
              if (r.sessionDate) {
                flatRecords.push(r);
              }
            });
          });
        });

        // Group by date
        const byDate = {};
        flatRecords.forEach(r => {
          if (!byDate[r.sessionDate]) {
            byDate[r.sessionDate] = { date: r.sessionDate, present: 0, absent: 0, late: 0, total: 0 };
          }
          byDate[r.sessionDate].total++;
          if (r.status === 'present') byDate[r.sessionDate].present++;
          if (r.status === 'late') byDate[r.sessionDate].late++;
          if (r.status === 'absent') byDate[r.sessionDate].absent++;
        });

        const dailyData = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date));

        // 3. Calculate Current Streak
        let streak = 0;
        // Go backwards from today
        const today = new Date();
        for (let i = 0; i < 60; i++) { // check up to 60 days back
          const d = new Date(today.getTime() - i * DAY_MS);
          const key = getLocalDateKey(d);
          const day = byDate[key];
          
          if (day) {
            // Day had classes
            if (day.absent > 0) {
              break; // Streak broken!
            } else if (day.present > 0 || day.late > 0) {
              streak++; // Good day
            }
          }
        }

        setData({
          profile,
          overall,
          lecture,
          lab,
          subjects: processedSubjects,
          dailyData,
          stats: {
            totalClasses: totalSessions,
            attendedClasses: totalAttended,
            streak,
            bestSubject: bestSubj
          }
        });

      } catch (err) {
        if (active) setError(err.message || 'Failed to load dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    }
    
    fetchDashboardData();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <AppLayout title="Dashboard">
        <div className="min-h-full flex flex-col items-center justify-center pb-20">
          <SpiralLoader />
          <p className="mt-4 text-white/50 text-sm animate-pulse">Analyzing attendance patterns...</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Dashboard">
        <div className="p-6">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl">
            {error}
          </div>
        </div>
      </AppLayout>
    );
  }

  const { profile, stats, subjects, overall, lecture, lab, dailyData } = data;
  const firstName = profile?.profiles?.full_name?.split(' ')[0] || 'Student';
  const hasData = stats.totalClasses > 0;

  return (
    <AppLayout title="Dashboard">
      <div className="min-h-full p-4 md:p-6 pb-24 text-white overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* 1. Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[2rem] bg-[#12121a]/80 backdrop-blur-xl border border-white/5 p-6 md:p-8"
          >
            
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{firstName}</span>!
            </h1>
            <p className="text-white/60 font-medium">
              {profile ? 
                `${profile.department} · Year ${profile.year_of_study} ${profile.section ? `· Section ${profile.section}` : ''}` :
                'Here is your attendance overview.'
              }
            </p>
          </motion.div>

          {!hasData ? (
            <div className="py-20 text-center rounded-[2rem] bg-[#12121a] border border-white/5">
              <div className="text-6xl mb-4 opacity-50">📊</div>
              <h2 className="text-xl font-bold mb-2">No Data Yet</h2>
              <p className="text-white/50 text-sm">Your attendance records will appear here once classes start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Rings & Stats */}
              <div className="lg:col-span-5 space-y-6">
                {/* Rings Card */}
                <motion.div 
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                  className="rounded-[2rem] bg-[#12121a] border border-white/5 p-6 md:p-8 flex flex-col items-center shadow-2xl relative overflow-hidden"
                >
                  <h2 className="text-lg font-bold self-start mb-6">
                    Performance
                  </h2>
                  <TripleActivityRings overall={overall} lecture={lecture} lab={lab} size={260} />
                  
                  {/* Legend */}
                  <div className="w-full grid grid-cols-3 gap-2 mt-8 text-center">
                    <div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto mb-1 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                      <div className="text-[10px] uppercase text-white/50 font-bold">Overall</div>
                      <div className="text-sm font-black">{overall}%</div>
                    </div>
                    <div>
                      <div className="w-3 h-3 rounded-full bg-cyan-500 mx-auto mb-1 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                      <div className="text-[10px] uppercase text-white/50 font-bold">Lecture</div>
                      <div className="text-sm font-black">{lecture}%</div>
                    </div>
                    <div>
                      <div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-1 shadow-[0_0_10px_rgba(249,115,22,0.5)]"></div>
                      <div className="text-[10px] uppercase text-white/50 font-bold">Lab</div>
                      <div className="text-sm font-black">{lab}%</div>
                    </div>
                  </div>
                </motion.div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <StatCard title="Total Classes" value={stats.totalClasses} delay={0.2} color="blue" />
                  <StatCard title="Attended" value={stats.attendedClasses} delay={0.3} color="emerald" />
                  <StatCard title="Current Streak" value={stats.streak} suffix=" days" delay={0.4} color="amber" icon="🔥" />
                  <StatCard 
                    title="Top Subject" 
                    value={stats.bestSubject ? `${stats.bestSubject.pct}%` : 'N/A'} 
                    subtext={stats.bestSubject?.code}
                    delay={0.5} color="purple" 
                  />
                </div>
                {/* Trends Card moved to Left Column for balance */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="rounded-[2rem] bg-[#12121a] border border-white/5 p-6"
                >
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <h2 className="text-lg font-bold">Attendance Pulse</h2>
                      <p className="text-xs text-white/40">Your performance on active days</p>
                    </div>
                  </div>
                  <HolographicTrendChart dailyData={dailyData} />
                  
                  <div className="mt-8 pt-4 border-t border-white/5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">30-Day Activity Heatmap</h3>
                    <ActivityStrip dailyData={dailyData} />
                  </div>
                </motion.div>
              </div>

              {/* Right Column: Subjects Breakdown Only */}
              <div className="lg:col-span-7 space-y-6">

                {/* Subject Breakdown - Lectures */}
                {subjects.filter(s => !s.isLab).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="rounded-[2rem] bg-[#12121a] border border-white/5 p-6"
                  >
                    <h2 className="text-lg font-bold mb-4">Lecture Breakdown</h2>
                    <div className="space-y-3">
                      {subjects.filter(s => !s.isLab).map((sub, i) => (
                        <SubjectRow key={sub.id || i} subject={sub} index={i} onClick={() => navigate(`/attendance/heatmap/lecture/${encodeURIComponent(sub.code)}`)} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Subject Breakdown - Labs */}
                {subjects.filter(s => s.isLab).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="rounded-[2rem] bg-[#12121a] border border-white/5 p-6"
                  >
                    <h2 className="text-lg font-bold mb-4">Lab Breakdown</h2>
                    <div className="space-y-3">
                      {subjects.filter(s => s.isLab).map((sub, i) => (
                        <SubjectRow key={sub.id || i} subject={sub} index={i} onClick={() => navigate(`/attendance/heatmap/lab/${encodeURIComponent(sub.code)}`)} />
                      ))}
                    </div>
                  </motion.div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// Sub-components

const StatCard = ({ title, value, subtext, suffix = "", delay, color, icon }) => {
  const colors = {
    blue: 'from-blue-500/20 to-transparent border-blue-500/20 text-blue-400',
    emerald: 'from-emerald-500/20 to-transparent border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-transparent border-amber-500/20 text-amber-400',
    purple: 'from-purple-500/20 to-transparent border-purple-500/20 text-purple-400',
  };
  const bgClass = colors[color] || colors.blue;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }}
      className={`rounded-2xl bg-gradient-to-br ${bgClass} border p-4 relative overflow-hidden`}
    >
      <div className="relative z-10">
        <p className="text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1">{title}</p>
        <div className="text-2xl font-black text-white flex items-baseline">
          {typeof value === 'number' ? <NumberCounter value={value} /> : value}
          {suffix && <span className="text-sm font-bold text-white/50 ml-1">{suffix}</span>}
          {icon && <span className="ml-2 text-xl">{icon}</span>}
        </div>
        {subtext && <p className="text-xs text-white/50 mt-1 font-semibold">{subtext}</p>}
      </div>
    </motion.div>
  );
};

const SubjectRow = ({ subject, index, onClick }) => {
  const { name, code, percentage, attended, total, isLab } = subject;
  const isSafe = percentage >= 75;
  const isExcellent = percentage >= 90;
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20, scale: 0.95 }} 
      animate={{ 
        opacity: 1, 
        x: 0,
        scale: isExcellent ? [1, 1.03, 1] : 1,
        ...(isExcellent ? {
          boxShadow: [
            "0px 0px 0px 0px rgba(52,211,153,0)", 
            "0px 4px 30px 5px rgba(52,211,153,0.6)", 
            "0px 0px 0px 0px rgba(52,211,153,0)"
          ]
        } : {})
      }} 
      transition={{ 
        delay: 0.3 + index * 0.05,
        opacity: { duration: 0.4 },
        x: { duration: 0.4 },
        scale: { delay: 0.6 + index * 0.05, duration: 0.8, ease: "backOut" },
        boxShadow: { delay: 0.6 + index * 0.05, duration: 1.5, ease: "easeInOut" }
      }}
      onClick={onClick}
      className={`group cursor-pointer rounded-xl bg-white/[0.02] border ${isExcellent ? 'border-emerald-500/50' : 'border-white/5'} p-4 hover:bg-white/[0.04] transition-all relative overflow-hidden`}
    >
      {isExcellent && (
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ delay: 0.8 + index * 0.05, duration: 1.2, ease: 'easeInOut' }}
          className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent skew-x-12 pointer-events-none"
        />
      )}
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded text-white/60">
            {code}
          </span>
          {isLab && <span className="text-[9px] font-bold uppercase tracking-wider text-orange-400 border border-orange-400/30 px-1.5 rounded-sm">LAB</span>}
        </div>
        <div className="text-right">
          <span className="text-sm font-black">{percentage}%</span>
        </div>
      </div>
      
      <h3 className="font-semibold text-sm truncate mb-3 text-white/90 group-hover:text-white transition-colors">{name}</h3>
      
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1, delay: 0.5 + index * 0.05 }}
            className={`h-full rounded-full ${isSafe ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
        </div>
        <div className="text-[10px] font-bold text-white/40 whitespace-nowrap">
          {attended} / {total}
        </div>
      </div>
    </motion.div>
  );
};