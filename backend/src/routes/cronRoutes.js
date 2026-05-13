import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { sendEmail } from '../lib/email.js'

const router = Router()

const REMINDER_DELAY_HOURS = 3
const SPECIAL_CODES = new Set(['LIB', 'REM', 'LUNCH'])

function toIstDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function getIstDayName(dateString) {
  const date = new Date(`${dateString}T00:00:00+05:30`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
  }).format(date)
}

function parseTimeSlotEnd(timeSlot) {
  if (!timeSlot || typeof timeSlot !== 'string') return null
  const parts = timeSlot.split('-')
  if (parts.length !== 2) return null
  const end = parts[1].trim()
  if (!/^\d{1,2}:\d{2}$/.test(end)) return null
  const [hours, minutes] = end.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getCourseFromSchedule(schedule) {
  return schedule.courses || schedule.class_sections?.courses || null
}

function resolveTeacherId(schedule) {
  return schedule.teacher_id || schedule.class_sections?.teacher_assignments?.[0]?.teacher_id || null
}

function buildReminderKey(sectionId, sessionDate, timeSlot) {
  return `${sectionId}::${sessionDate}::${timeSlot}`
}

router.post('/attendance-reminders', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for cron reminders.' })
    }

    const todayIst = toIstDateString(new Date())
    const yesterdayIst = toIstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const targetDates = [yesterdayIst, todayIst]

    const schedulesByDate = []
    for (const dateString of targetDates) {
      const dayName = getIstDayName(dateString)
      const { data: schedules, error } = await supabaseAdmin
        .from('class_schedules')
        .select(`
          id,
          day,
          time_slot,
          room_number,
          class_section_id,
          teacher_id,
          class_routines!inner(is_active),
          courses ( id, name, code, semester, department, type ),
          class_sections (
            id,
            section,
            year_of_study,
            department,
            courses ( id, name, code, semester, department, type ),
            teacher_assignments ( teacher_id )
          )
        `)
        .eq('class_routines.is_active', true)
        .eq('day', dayName)

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      schedulesByDate.push({ dateString, dayName, schedules: schedules || [] })
    }

    const allSchedules = schedulesByDate.flatMap((entry) =>
      (entry.schedules || []).map((schedule) => ({ ...schedule, dateString: entry.dateString, dayName: entry.dayName }))
    )

    if (allSchedules.length === 0) {
      return res.json({ sent: 0, skipped: 0, total: 0 })
    }

    const sectionIds = Array.from(new Set(allSchedules.map((s) => s.class_section_id).filter(Boolean)))
    const { data: sessions, error: sessionError } = await supabaseAdmin
      .from('attendance_sessions')
      .select('id, class_section_id, session_date, time_slot, attendance_records ( id )')
      .in('class_section_id', sectionIds)
      .in('session_date', targetDates)

    if (sessionError) {
      return res.status(500).json({ error: sessionError.message })
    }

    const sessionMap = new Map()
    for (const session of sessions || []) {
      const key = buildReminderKey(session.class_section_id, session.session_date, session.time_slot)
      sessionMap.set(key, session)
    }

    const reminderKeys = allSchedules.map((schedule) =>
      buildReminderKey(schedule.class_section_id, schedule.dateString, schedule.time_slot)
    )

    const { data: logRows, error: logError } = await supabaseAdmin
      .from('attendance_reminder_logs')
      .select('class_section_id, session_date, time_slot')
      .in('class_section_id', sectionIds)
      .in('session_date', targetDates)

    if (logError) {
      return res.status(500).json({ error: logError.message })
    }

    const loggedKeys = new Set(
      (logRows || []).map((row) => buildReminderKey(row.class_section_id, row.session_date, row.time_slot))
    )

    const teacherIds = Array.from(
      new Set(allSchedules.map((s) => resolveTeacherId(s)).filter(Boolean))
    )

    const { data: teachers, error: teacherError } = await supabaseAdmin
      .from('teacher_profiles')
      .select('id, profiles ( full_name, email )')
      .in('id', teacherIds)

    if (teacherError) {
      return res.status(500).json({ error: teacherError.message })
    }

    const teacherMap = new Map()
    for (const teacher of teachers || []) {
      teacherMap.set(teacher.id, teacher)
    }

    let sentCount = 0
    let skippedCount = 0

    for (const schedule of allSchedules) {
      const timeSlot = schedule.time_slot
      const endTime = parseTimeSlotEnd(timeSlot)
      if (!endTime) {
        skippedCount++
        continue
      }

      const endTimestamp = new Date(`${schedule.dateString}T${endTime}:00+05:30`)
      if (Number.isNaN(endTimestamp.getTime())) {
        skippedCount++
        continue
      }

      const deadline = new Date(endTimestamp.getTime() + REMINDER_DELAY_HOURS * 60 * 60 * 1000)
      if (Date.now() < deadline.getTime()) {
        skippedCount++
        continue
      }

      const reminderKey = buildReminderKey(schedule.class_section_id, schedule.dateString, timeSlot)
      if (loggedKeys.has(reminderKey)) {
        skippedCount++
        continue
      }

      const session = sessionMap.get(reminderKey)
      if (session && session.attendance_records && session.attendance_records.length > 0) {
        skippedCount++
        continue
      }

      const course = getCourseFromSchedule(schedule)
      const courseCode = (course?.code || '').trim().toUpperCase()
      if (SPECIAL_CODES.has(courseCode)) {
        skippedCount++
        continue
      }

      const teacherId = resolveTeacherId(schedule)
      const teacher = teacherId ? teacherMap.get(teacherId) : null
      const teacherName = teacher?.profiles?.full_name || 'Teacher'
      const teacherEmail = teacher?.profiles?.email
      if (!teacherEmail) {
        skippedCount++
        continue
      }

      const section = schedule.class_sections?.section || 'N/A'
      const year = schedule.class_sections?.year_of_study || 'N/A'
      const department = schedule.class_sections?.department || course?.department || 'N/A'
      const semester = course?.semester || 'N/A'
      const roomNumber = schedule.room_number || 'TBA'

      const emailResult = await sendEmail({
        to: teacherEmail,
        subject: `Attendance Reminder: ${course?.name || 'Class'} (${courseCode || 'N/A'})`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>Attendance Reminder</h2>
            <p>Hello <strong>${teacherName}</strong>,</p>
            <p>This is a reminder that attendance has not been submitted for the class below, and 3 hours have passed since it ended.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 10px; margin: 16px 0;">
              <p style="margin: 0;"><strong>Course:</strong> ${course?.name || 'N/A'} (${courseCode || 'N/A'})</p>
              <p style="margin: 6px 0 0 0;"><strong>Department:</strong> ${department}</p>
              <p style="margin: 6px 0 0 0;"><strong>Year / Semester:</strong> ${year} / ${semester}</p>
              <p style="margin: 6px 0 0 0;"><strong>Section:</strong> ${section}</p>
              <p style="margin: 6px 0 0 0;"><strong>Room:</strong> ${roomNumber}</p>
              <p style="margin: 6px 0 0 0;"><strong>Class Date:</strong> ${schedule.dateString} (${schedule.dayName})</p>
              <p style="margin: 6px 0 0 0;"><strong>Time Slot:</strong> ${timeSlot}</p>
            </div>
            <p>Please submit the attendance as soon as possible.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #777;">This is an automated reminder from the Centralized Attendance Portal.</p>
          </div>
        `,
      })

      if (emailResult?.success) {
        const { error: insertError } = await supabaseAdmin
          .from('attendance_reminder_logs')
          .insert({
            session_id: session?.id || null,
            teacher_id: teacherId,
            class_section_id: schedule.class_section_id,
            reminder_type: 'attendance_missing_3h',
            session_date: schedule.dateString,
            time_slot: timeSlot,
          })

        if (insertError) {
          console.error('[reminder] Log insert failed:', insertError)
        }

        sentCount++
      } else {
        console.error('[reminder] Email failed:', emailResult?.error || 'Unknown error')
      }
    }

    return res.json({ sent: sentCount, skipped: skippedCount, total: allSchedules.length })
  } catch (err) {
    console.error('POST /cron/attendance-reminders error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
