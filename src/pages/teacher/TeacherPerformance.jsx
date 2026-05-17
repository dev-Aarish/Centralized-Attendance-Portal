import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AppLayout from '../../components/shared/AppLayout'
import SpiralLoader from '../../components/shared/Loader'
import { getTeacherPerformanceStats, getSectionPerformanceDetails } from '../../lib/attendance'

export default function TeacherPerformance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sections, setSections] = useState([])
  
  const [selectedSection, setSelectedSection] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [sectionDetails, setSectionDetails] = useState([])

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      const { data, error: err } = await getTeacherPerformanceStats()
      if (err) {
        setError(err.message || 'Failed to load performance stats.')
      } else {
        const validSections = (data || []).filter(sec => sec.totalSessions > 0)
        setSections(validSections)
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  async function handleSectionClick(section) {
    setSelectedSection(section)
    setDetailsLoading(true)
    const { data, error: err } = await getSectionPerformanceDetails(section.sectionId)
    if (!err) {
      setSectionDetails(data || [])
    }
    setDetailsLoading(false)
  }

  function closeDetails() {
    setSelectedSection(null)
    setSectionDetails([])
  }

  // Categorize students
  const topPerformers = sectionDetails.filter(s => s.percentage >= 80)
  const averagePerformers = sectionDetails.filter(s => s.percentage >= 60 && s.percentage < 80)
  const fallingBehind = sectionDetails.filter(s => s.percentage < 60)

  if (loading) {
    return (
      <AppLayout title="Performance Dashboard">
        <div className="flex items-center justify-center min-h-[60vh]">
          <SpiralLoader />
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="Performance Dashboard">
        <div className="p-6">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
            {error}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Performance Dashboard">
      <div className="min-h-full p-4 md:p-8 pb-24 text-white">
        <div className="max-w-7xl mx-auto space-y-10">
          
          <div className="flex flex-col gap-3 mb-8">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              Performance Insights
            </h1>
            <p className="text-white/60 text-sm md:text-base font-medium max-w-2xl">
              A comprehensive overview of attendance health across all your assigned subjects and sections. 
              Click on any section to view a detailed student breakdown.
            </p>
          </div>

          {sections.length === 0 && (
            <div className="py-24 text-center rounded-[2rem] bg-[#12121a] border border-white/5 shadow-sm">
              <div className="text-6xl mb-6 opacity-30">📊</div>
              <h2 className="text-2xl font-bold mb-3 text-white">No Data Available</h2>
              <p className="text-white/50 max-w-md mx-auto">
                You do not have any attendance data to display yet. Once you conduct sessions, they will appear here.
              </p>
            </div>
          )}

          {/* Detailed Section Grid */}
          {sections.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sections.map((sec, i) => (
                <motion.div
                  key={sec.sectionId}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  onClick={() => handleSectionClick(sec)}
                  className="group bg-[#12121a] border border-white/5 rounded-2xl p-6 cursor-pointer hover:border-blue-500/30 transition-all shadow-sm hover:shadow-lg relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="pr-4 flex-1 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-white/60 bg-white/5 px-2 py-1 rounded-md inline-block max-w-full truncate">
                        {sec.subjectCode} {sec.section ? `· SEC ${sec.section}` : ''}
                      </span>
                      <h3 className="font-bold text-white mt-3 truncate text-lg">
                        {sec.subjectName}
                      </h3>
                      <p className="text-xs text-white/50 mt-1 truncate">
                        {sec.department} · Year {sec.year}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className={`text-2xl sm:text-3xl font-black ${sec.overallPercentage >= 80 ? 'text-emerald-400' : sec.overallPercentage < 60 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {sec.overallPercentage}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-full h-2 bg-[#0a0a0f] rounded-full overflow-hidden mt-4">
                    <div 
                      className={`h-full rounded-full ${sec.overallPercentage >= 80 ? 'bg-emerald-500' : sec.overallPercentage < 60 ? 'bg-rose-500' : 'bg-amber-500'}`}
                      style={{ width: `${sec.overallPercentage}%` }}
                    />
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-white/40 uppercase tracking-wider flex justify-between">
                    <span>Total Sessions: {sec.totalSessions}</span>
                    <span className="group-hover:text-blue-400 transition-colors">View Details &rarr;</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Extended View Modal */}
      <AnimatePresence>
        {selectedSection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeDetails}
            />
            
            {/* Modal Content */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-[#12121a] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] sm:max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex justify-between items-start bg-white/[0.02]">
                <div className="pr-4">
                  <h2 className="text-xl font-black text-white leading-tight">
                    {selectedSection.subjectName}
                  </h2>
                  <p className="text-sm font-medium text-white/50 mt-2 uppercase tracking-wider">
                    {selectedSection.subjectCode} {selectedSection.section ? `· Sec ${selectedSection.section}` : ''}
                  </p>
                </div>
                <button
                  onClick={closeDetails}
                  className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {detailsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <SpiralLoader />
                  </div>
                ) : sectionDetails.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="text-4xl mb-4 opacity-30">👥</div>
                    <p className="text-white/50 font-medium">No students or attendance records found.</p>
                  </div>
                ) : (
                  <div className="space-y-10 pb-4">
                    
                    {/* Top Performers (>= 80%) */}
                    {topPerformers.length > 0 && (
                      <CategorySection 
                        title="Top Performers (≥ 80%)" 
                        students={topPerformers} 
                        colorTheme="emerald" 
                        icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />}
                      />
                    )}

                    {/* Average (60% - 79%) */}
                    {averagePerformers.length > 0 && (
                      <CategorySection 
                        title="Average (60% - 79%)" 
                        students={averagePerformers} 
                        colorTheme="amber" 
                        icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                      />
                    )}

                    {/* Falling Behind (< 60%) */}
                    {fallingBehind.length > 0 && (
                      <CategorySection 
                        title="Falling Behind (< 60%)" 
                        students={fallingBehind} 
                        colorTheme="rose" 
                        icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />}
                      />
                    )}
                    
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppLayout>
  )
}

function CategorySection({ title, students, colorTheme, icon }) {
  const themes = {
    emerald: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20'
    },
    amber: {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20'
    },
    rose: {
      text: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20'
    }
  }

  const theme = themes[colorTheme]

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 pb-2 border-b border-white/5 ${theme.text}`}>
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
        <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-3">
        {students.map(student => (
          <div key={student.studentId} className={`flex items-center justify-between p-4 rounded-xl border ${theme.bg} ${theme.border}`}>
            <div className="flex-1 overflow-hidden pr-4">
              <h4 className="text-sm font-bold truncate text-white">
                {student.fullName}
              </h4>
              <p className="text-xs font-medium text-white/50 mt-1 uppercase tracking-wider">
                Roll: {student.rollNumber || 'N/A'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xl font-black ${theme.text}`}>{student.percentage}%</div>
              <div className="text-[10px] uppercase font-bold text-white/40 mt-1">
                {student.attendedClasses} / {student.totalClasses}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
