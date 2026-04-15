import { supabase } from './supabase'

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function getMyStudentSchedule() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: new Error('Not logged in') }

  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!studentProfile) return { data: [], error: new Error('No student profile') }

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('class_section_id')
    .eq('student_id', studentProfile.id)

  if (!enrollments?.length) return { data: [], error: null }

  const sectionIds = enrollments.map((e) => e.class_section_id)

  const { data, error } = await supabase
    .from('schedules')
    .select(`*, class_sections (section, courses (name, code))`)
    .in('class_section_id', sectionIds)
    .order('start_time', { ascending: true })

  const sorted = data?.sort(
    (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
  )

  return { data: sorted, error }
}

export async function getMyTeacherSchedule() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: new Error('Not logged in') }

  const { data: teacherProfile } = await supabase
    .from('teacher_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!teacherProfile) return { data: [], error: new Error('No teacher profile') }

  const { data: assignments } = await supabase
    .from('teacher_assignments')
    .select('class_section_id')
    .eq('teacher_id', teacherProfile.id)

  if (!assignments?.length) return { data: [], error: null }

  const sectionIds = assignments.map((a) => a.class_section_id)

  const { data, error } = await supabase
    .from('schedules')
    .select(`*, class_sections (section, courses (name, code))`)
    .in('class_section_id', sectionIds)
    .order('start_time', { ascending: true })

  const sorted = data?.sort(
    (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
  )

  return { data: sorted, error }
}

export async function getTodaySchedule(role) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = days[new Date().getDay()]

  const { data, error } = role === 'teacher'
    ? await getMyTeacherSchedule()
    : await getMyStudentSchedule()

  const todayOnly = data?.filter((s) => s.day_of_week === today) || []
  return { data: todayOnly, error }
}