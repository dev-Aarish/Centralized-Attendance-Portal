import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
import { getSessionsForSection, getRecordsForSession } from '../../lib/attendance'
import SpiralLoader from '../../components/shared/Loader'

export default function TeacherCourses() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSectionId = searchParams.get('sectionId') || ''
  const [sections, setSections] = useState([])
  const [selected, setSelected] = useState(null)
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await getMyAssignedSections()
      setSections(data || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (loading) return

    // If no sectionId in URL, reset selection
    if (!selectedSectionId) {
      if (selected) {
        setSelected(null)
        setStudents([])
        setSessions([])
      }
      return
    }

    // If sectionId in URL but not selected yet, or changed
    const currentId = selected?.class_section_id || selected?.id
    if (!selected || currentId !== selectedSectionId) {
      const match = sections.find((s) => (s.class_section_id || s.id) === selectedSectionId)
      if (match) {
        handleSelect(match)
      } else {
        // ID in URL but no match in sections (maybe old/invalid)
        setSelected(null)
        setSearchParams({}, { replace: true })
      }
    }
  }, [loading, selectedSectionId, sections, selected])

  async function handleSelect(section) {
    setSelected(section)
    setLoadingDetail(true)
    setExportError(null)
    const sectionId = section.class_section_id || section.id
    if (sectionId) {
      setSearchParams({ sectionId }, { replace: true })
    }
    const [{ data: studentData }, { data: sessionData }] = await Promise.all([
      getStudentsInSection(section.class_section_id),
      getSessionsForSection(section.class_section_id),
    ])
    setStudents(studentData || [])
    setSessions(sessionData || [])
    setLoadingDetail(false)
  }

  function buildFilenameBase() {
    const code = selected?.class_sections?.courses?.code || 'COURSE'
    const section = selected?.class_sections?.section || 'SEC'
    const year = selected?.class_sections?.year_of_study || 'YEAR'
    const dept = selected?.class_sections?.department || 'DEPT'
    return `${code}_${dept}_Y${year}_S${section}_Attendance`
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
  }

  async function buildAttendanceExportData() {
    const course = selected?.class_sections?.courses || {}
    const courseInfo = {
      courseName: course.name || 'Unknown Course',
      courseCode: course.code || 'N/A',
      department: selected?.class_sections?.department || 'N/A',
      year: selected?.class_sections?.year_of_study || 'N/A',
      section: selected?.class_sections?.section || 'N/A',
      semester: course.semester || 'N/A',
    }

    const sessionRows = (sessions || []).map((s) => ({
      id: s.id,
      date: s.session_date,
      type: s.session_type,
    }))

    const sessionRecordMaps = {}
    if (sessionRows.length > 0) {
      const recordResponses = await Promise.all(
        sessionRows.map((s) => getRecordsForSession(s.id))
      )

      sessionRows.forEach((s, idx) => {
        const data = recordResponses[idx]?.data || []
        sessionRecordMaps[s.id] = new Map(
          data.map((rec) => [rec.studentId, rec.status])
        )
      })
    }

    const studentRows = (students || []).map((s) => {
      const profile = s.student_profiles || {}
      const fullName = profile.profiles?.full_name || 'Unknown'
      const rollNumber = profile.roll_number || 'N/A'
      const studentId = profile.id

      let present = 0
      let late = 0
      let absent = 0
      let unmarked = 0

      for (const session of sessionRows) {
        const status = sessionRecordMaps[session.id]?.get(studentId) || null
        if (!status) {
          unmarked += 1
        } else if (status === 'present') {
          present += 1
        } else if (status === 'late') {
          late += 1
        } else if (status === 'absent') {
          absent += 1
        } else {
          unmarked += 1
        }
      }

      const marked = present + late + absent
      const percentage = marked > 0 ? Math.round(((present + late) / marked) * 100) : 0

      return {
        fullName,
        rollNumber,
        present,
        late,
        absent,
        unmarked,
        marked,
        totalSessions: sessionRows.length,
        percentage,
      }
    })

    return { courseInfo, studentRows, sessionRows }
  }

  async function handleExportPdf() {
    if (!selected) return
    setExporting(true)
    setExportError(null)

    try {
      const { courseInfo, studentRows, sessionRows } = await buildAttendanceExportData()
      const { jsPDF } = await import('jspdf')
      const autoTableModule = await import('jspdf-autotable')
      const autoTable = autoTableModule.default || autoTableModule
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const autoTableFn = typeof autoTable === 'function' ? autoTable : autoTable?.default

      if (typeof autoTableFn !== 'function') {
        throw new Error('PDF export dependency missing (autoTable).')
      }

      doc.setFontSize(18)
      doc.text('Attendance Report', 40, 50)
      doc.setFontSize(11)
      doc.text(`${courseInfo.courseCode} — ${courseInfo.courseName}`, 40, 70)
      doc.text(`Dept: ${courseInfo.department} · Year: ${courseInfo.year} · Section: ${courseInfo.section}`, 40, 88)
      doc.text(`Semester: ${courseInfo.semester} · Sessions: ${sessionRows.length} · Students: ${studentRows.length}`, 40, 106)

      autoTableFn(doc, {
        startY: 130,
        head: [[
          'Roll',
          'Student',
          'Present',
          'Late',
          'Absent',
          'Unmarked',
          'Marked',
          'Total',
          'Attendance %',
        ]],
        body: studentRows.map((row) => ([
          row.rollNumber,
          row.fullName,
          row.present,
          row.late,
          row.absent,
          row.unmarked,
          row.marked,
          row.totalSessions,
          `${row.percentage}%`,
        ])),
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 9, cellPadding: 4 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      })

      doc.save(`${buildFilenameBase()}.pdf`)
    } catch (err) {
      setExportError(err.message || 'Failed to export PDF.')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportExcel() {
    if (!selected) return
    setExporting(true)
    setExportError(null)

    try {
      const { courseInfo, studentRows, sessionRows } = await buildAttendanceExportData()
      const XLSX = await import('xlsx')

      const summarySheet = XLSX.utils.json_to_sheet([
        {
          Course: courseInfo.courseName,
          Code: courseInfo.courseCode,
          Department: courseInfo.department,
          Year: courseInfo.year,
          Section: courseInfo.section,
          Semester: courseInfo.semester,
          Students: studentRows.length,
          Sessions: sessionRows.length,
        },
      ])

      const studentsHeader = [
        'Roll',
        'Student',
        'Present',
        'Late',
        'Absent',
        'Unmarked',
        'Marked',
        'Total',
        'Attendance %',
      ]

      const studentsRows = studentRows.map((row) => ([
        row.rollNumber,
        row.fullName,
        row.present,
        row.late,
        row.absent,
        row.unmarked,
        row.marked,
        row.totalSessions,
        row.percentage,
      ]))

      const studentsSheet = XLSX.utils.aoa_to_sheet([
        ['Attendance Report'],
        [`${courseInfo.courseCode} — ${courseInfo.courseName}`],
        [`Dept: ${courseInfo.department} · Year: ${courseInfo.year} · Section: ${courseInfo.section}`],
        [`Semester: ${courseInfo.semester} · Sessions: ${sessionRows.length} · Students: ${studentRows.length}`],
        [],
        studentsHeader,
        ...studentsRows,
      ])

      studentsSheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } },
      ]
      studentsSheet['!cols'] = [
        { wch: 12 },
        { wch: 26 },
        { wch: 9 },
        { wch: 8 },
        { wch: 9 },
        { wch: 11 },
        { wch: 9 },
        { wch: 8 },
        { wch: 14 },
      ]

      const sessionsSheet = XLSX.utils.json_to_sheet(
        sessionRows.map((s) => ({
          Date: s.date,
          Type: s.type,
        }))
      )

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')
      XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students')
      XLSX.utils.book_append_sheet(wb, sessionsSheet, 'Sessions')

      XLSX.writeFile(wb, `${buildFilenameBase()}.xlsx`)
    } catch (err) {
      setExportError(err.message || 'Failed to export Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AppLayout title="My Courses">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {!selected ? (
          <>
            {!loading && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {`${sections.length} course${sections.length !== 1 ? 's' : ''} assigned this semester`}
              </p>
            )}

            {loading ? (
              <div className="flex items-center justify-center min-h-[40vh]">
                <SpiralLoader />
              </div>
            ) : sections.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-12 text-center">
                <p className="text-sm text-gray-400">No courses assigned yet. Contact your admin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 text-left hover:border-gray-200 dark:hover:border-gray-700 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                          {s.class_sections?.courses?.code}
                        </span>
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mt-0.5">
                          {s.class_sections?.courses?.name}
                        </h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {s.class_sections?.department} · {s.class_sections?.year_of_study} year
                          {s.class_sections?.section ? ` · Section ${s.class_sections.section}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-blue-500 dark:text-blue-400">View →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Back + header */}
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => setSearchParams({}, { replace: true })}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-2 transition-colors"
                >
                  ← Back to courses
                </button>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
                  {selected.class_sections?.courses?.name}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {selected.class_sections?.courses?.code} · {selected.class_sections?.department}
                  {selected.class_sections?.section ? ` · Section ${selected.class_sections.section}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPdf}
                  disabled={exporting || loadingDetail}
                  className="text-xs px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors disabled:opacity-50"
                >
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
                <button
                  onClick={handleExportExcel}
                  disabled={exporting || loadingDetail}
                  className="text-xs px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors disabled:opacity-50"
                >
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
              </div>
            </div>

            {exportError && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl border border-red-100 dark:border-red-800/30 text-sm font-medium">
                {exportError}
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Students', value: loadingDetail ? '—' : students.length },
                { label: 'Sessions held', value: loadingDetail ? '—' : sessions.length },
                { label: 'Semester', value: selected.class_sections?.courses?.semester || '—' },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3">
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Student list */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Enrolled students
              </h3>
              {loadingDetail ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <SpiralLoader />
                </div>
              ) : students.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No students enrolled yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {students.map((s, i) => (
                    <div
                      key={s.id}
                      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-300 dark:text-gray-600 w-5">{i + 1}</span>
                        <div>
                          <p className="text-sm text-gray-800 dark:text-white font-medium">
                            {s.student_profiles.profiles.full_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {s.student_profiles.roll_number}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {s.student_profiles.year_of_study} yr
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sessions */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Recent sessions
              </h3>
              {loadingDetail ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <SpiralLoader />
                </div>
              ) : sessions.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No sessions held yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sessions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(s.session_date).toDateString()}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 capitalize">
                        {s.session_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}