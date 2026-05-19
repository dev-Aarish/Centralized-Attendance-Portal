import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import SpiralLoader from '../../components/shared/Loader'
import { getMyMarks } from '../../lib/marks'

export default function StudentMarks() {
  const [loading, setLoading] = useState(true)
  const [marks, setMarks] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await getMyMarks()
      if (fetchError) {
        setError(fetchError.message || 'Failed to load marks.')
      } else {
        setMarks(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const grouped = useMemo(() => {
    return (marks || []).reduce((acc, row) => {
      const course = row.class_sections?.courses || {}
      const key = `${course.code || 'COURSE'}::${course.name || 'Course'}`
      if (!acc[key]) {
        acc[key] = {
          code: course.code || 'COURSE',
          name: course.name || 'Course',
          items: [],
        }
      }
      acc[key].items.push(row)
      return acc
    }, {})
  }, [marks])

  if (loading) {
    return (
      <AppLayout title="Marks">
        <div className="flex items-center justify-center min-h-[50vh]">
          <SpiralLoader />
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="Marks">
        <div className="rounded-2xl border border-red-200/40 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </AppLayout>
    )
  }

  if (!marks.length) {
    return (
      <AppLayout title="Marks">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-sm text-gray-500 dark:text-gray-400">
          No marks available yet.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Marks">
      <div className="flex flex-col gap-6">
        {Object.values(grouped).map((group) => (
          <div key={group.code} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{group.code}</p>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{group.name}</h2>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-3">Exam</th>
                    <th className="pb-2 pr-3">Marks</th>
                    <th className="pb-2 pr-3">Max</th>
                    <th className="pb-2">Recorded</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-200">
                  {group.items.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3">{row.exam_name}</td>
                      <td className="py-2 pr-3">{row.marks_obtained}</td>
                      <td className="py-2 pr-3">{row.max_marks}</td>
                      <td className="py-2 text-xs text-gray-500 dark:text-gray-400">
                        {row.recorded_at ? new Date(row.recorded_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
