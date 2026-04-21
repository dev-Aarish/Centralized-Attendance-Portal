import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/shared/AppLayout';
import { getMyAttendanceDetails } from '../../lib/attendance';

// ─── Color Helpers ──────────────────────────────────────────────
function getPercentageColor(p) {
  if (p >= 90) return { text: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)' };
  if (p >= 80) return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)' };
  if (p >= 75) return { text: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.25)' };
  return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)' };
}

// ─── Teacher Card Component ────────────────────────────────────
function TeacherCard({ teacher }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRecords = expanded ? teacher.records : teacher.records.slice(0, 4);
  const colors = getPercentageColor(teacher.percentage);
  const teacherName = teacher.name || teacher.initials || 'Unassigned';

  function getStatusView(status) {
    if (status === 'late') {
      return {
        text: 'L',
        color: '#fbbf24',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        ),
      };
    }

    if (status === 'present') {
      return {
        text: 'P',
        color: '#34d399',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ),
      };
    }

    return {
      text: 'A',
      color: '#f87171',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      ),
    };
  }

  return (
    <div style={{
      background: 'linear-gradient(145deg, #1a1d2e 0%, #161825 100%)',
      borderRadius: '20px',
      padding: '20px',
      border: '1px solid rgba(255,255,255,0.06)',
      flex: '1 1 280px',
      minWidth: '260px',
      maxWidth: '100%',
      display: 'flex',
      flexDirection: 'column',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    className="teacher-card"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '14px',
          background: `linear-gradient(135deg, ${colors.bg}, rgba(99,102,241,0.15))`,
          border: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '15px', color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teacherName}</p>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{teacher.attended}/{teacher.total} classes</p>
        </div>
      </div>
      <p style={{ fontSize: '28px', fontWeight: 800, color: colors.text, margin: '0 0 16px 0', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {teacher.percentage}%
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        {visibleRecords.map((record, idx) => (
          (() => {
            const statusView = getStatusView(record.status);
            return (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: '12px',
            background: record.status === 'present' ? 'rgba(52,211,153,0.08)' : record.status === 'late' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${record.status === 'present' ? 'rgba(52,211,153,0.15)' : record.status === 'late' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.15)'}`,
            transition: 'background 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1', margin: 0 }}>{record.date}</p>
                {record.time ? <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>{record.time}</p> : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {statusView.icon}
              <span style={{ fontSize: '13px', fontWeight: 700, color: statusView.color }}>
                {statusView.text}
              </span>
            </div>
          </div>
            );
          })()
        ))}
      </div>
      {teacher.records.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', padding: '12px 0 4px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '6px', transition: 'color 0.2s', width: '100%',
        }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#94a3b8'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
        >
          {expanded ? 'Less' : 'More'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}
          ><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
    </div>
  );
}

// ─── Subject Section Component ─────────────────────────────────
function SubjectSection({ subject }) {
  const colors = getPercentageColor(subject.overallPercentage);
  const isIneligible = subject.overallPercentage < 75;
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '12px',
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: '16px', padding: '10px 20px', marginBottom: '16px',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text }}>{subject.subjectCode}</span>
        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: colors.text, opacity: 0.4 }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8' }}>{subject.subjectName}</span>
        <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text }}>{subject.overallPercentage}%</span>
        {isIneligible && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '8px', padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ineligible
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {subject.teachers.map((teacher, idx) => (
          <TeacherCard key={idx} teacher={teacher} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function StudentLectureDetails() {
  const navigate = useNavigate();
  const [lectureDetailsData, setLectureDetailsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await getMyAttendanceDetails('lecture');
        
        if (controller.signal.aborted) return;

        if (fetchError) {
          console.warn('Lecture details fetch error:', fetchError);
          setError(fetchError.message || 'Failed to load lecture details.');
        }
        setLectureDetailsData(data || []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch lecture details:', err);
        setError(err.message || 'Failed to load lecture details.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();

    return () => controller.abort();
  }, []);

  return (
    <AppLayout title="Lecture Details">
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 4px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
          <button onClick={() => navigate('/dashboard')} style={{
            width: '40px', height: '40px', borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s ease', flexShrink: 0,
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.03em', lineHeight: 1.2 }}>Lecture Attendance</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>Detailed attendance breakdown by subject & instructor</p>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '36px', height: '36px', border: '3px solid rgba(99,102,241,0.15)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>Loading lecture details...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#f87171', fontSize: '14px', fontWeight: 500, background: 'rgba(248,113,113,0.06)', borderRadius: '16px', border: '1px solid rgba(248,113,113,0.15)' }}>
            Failed to load lecture details. Please try again.
          </div>
        ) : lectureDetailsData.length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: '#64748b', fontWeight: 500 }}>No lecture attendance records found.</p>
            <p style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>Records will appear here once your instructors start marking lecture attendance.</p>
          </div>
        ) : (
          lectureDetailsData.map((subject, idx) => (
            <SubjectSection key={idx} subject={subject} />
          ))
        )}
      </div>
    </AppLayout>
  );
}
