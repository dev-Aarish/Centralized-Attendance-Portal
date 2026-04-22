# Centralized Attendance Portal — Project Planning
> Heritage Institute of Technology · React 19 + Vite + Express.js + Supabase
> Last reviewed: April 2026

---

## 📐 Architecture Overview

```
Frontend (Vite :5173)          Backend (Express :3001)         Database
──────────────────────         ───────────────────────         ─────────
src/lib/api.js (apiFetch)  →   requireAuth middleware      →   Supabase (PostgreSQL)
  attaches Supabase JWT         verifies JWT via Supabase        Row Level Security
                                attaches req.user + req.supabase
```

**Run everything:** `npm run dev:all` (root package.json)

---

## 🗄️ Database Tables (Current)

| Table | Key Columns |
|---|---|
| `profiles` | `id, email, full_name, role, college_name` |
| `student_profiles` | `id, profile_id, roll_number, department, year_of_study, section` |
| `teacher_profiles` | `id, profile_id, employee_id, department` |
| `courses` | `id, code, name, department, semester` |
| `class_sections` | `id, course_id, department, year_of_study, section` |
| `enrollments` | `id, student_id, class_section_id` |
| `teacher_assignments` | `id, teacher_id, class_section_id` |
| `schedules` | `id, class_section_id, day_of_week, start_time, end_time, room` |
| `attendance_sessions` | `id, class_section_id, teacher_id, session_date, session_type` |
| `attendance_records` | `id, session_id, student_id, status` |
| `content_items` | `id, class_section_id, uploaded_by, type, title, file_url` |
| `assignments` | `id, class_section_id, created_by, title, question_count, due_at` |
| `question_bank` | `id, class_section_id, created_by, question_text, topic, difficulty` |
| `assignment_questions` | `id, assignment_id, question_id` |

---

## ✅ What Is Already Done

| File | Status |
|---|---|
| `AuthPage.jsx` | ✅ Google + Email auth |
| `OnboardingPage.jsx` | ⚠️ Works but hits Supabase directly |
| `StudentDashboard.jsx` | ✅ Attendance rings (lecture + lab) |
| `StudentLectureDetails.jsx` | ✅ Full detail view |
| `StudentLabDetails.jsx` | ✅ Full detail view |
| `StudentContacts.jsx` | ✅ UI done — waiting on backend |
| `TeacherDashboard.jsx` | ✅ Stats + today's classes |
| `TeacherAttendance.jsx` | ✅ Full marking flow |
| `TeacherCourses.jsx` | ✅ Section drill-down |
| `TeacherNotes.jsx` | ✅ Upload + list |
| `TeacherAssignments.jsx` | ⚠️ Works but hits Supabase directly |
| `backend/src/server.js` | ✅ Express + CORS + routes |
| `backend/src/middleware/authMiddleware.js` | ✅ JWT verification |
| `attendanceRoutes.js` | ✅ Complete (student + teacher) |
| `profileRoutes.js` | ✅ Complete |
| `scheduleRoutes.js` | ✅ Complete |
| `contentRoutes.js` | ✅ Complete |
| `marksRoutes.js` | ⚠️ Exists — needs admin endpoints |
| `contactRoutes.js` | ❌ Stub — empty |

---

## 🚨 Known Bugs / Issues

1. **`TeacherAssignments.jsx`** imports `supabase` directly — bypasses Express backend
2. **`OnboardingPage.jsx`** writes to Supabase directly — bypasses Express backend
3. **`contactRoutes.js`** is a stub — `StudentContacts.jsx` will fail on real data
4. **`LoadingScreen.jsx`** is empty (74 bytes)
5. **Dev "Switch Role" button** in `TopHeader.jsx` is visible in production — should be dev-only
6. **Admin pages** (all 6) are empty stubs: `export default function AdminX() { return <div>Admin X</div> }`
7. **Student pages** are stubs: `StudentSchedule`, `StudentAssignments`, `StudentNotes`

---

## 🔌 Complete API Reference

```
GET  /api/health                                  ← no auth

PROFILE
GET  /api/v1/profile/me
GET  /api/v1/profile/role
GET  /api/v1/profile/student
GET  /api/v1/profile/teacher
GET  /api/v1/profile/assigned-sections            ← teacher
GET  /api/v1/profile/enrolled-sections            ← student
GET  /api/v1/profile/sections/:id/students
PUT  /api/v1/profile/dev-role                     ← dev only

ATTENDANCE
POST /api/v1/attendance/sessions                  ← { classSectionId, sessionType }
POST /api/v1/attendance/sessions/:id/records      ← { attendanceMap }
GET  /api/v1/attendance/sections/:id/sessions
GET  /api/v1/attendance/sessions/:id/records
GET  /api/v1/attendance/summary
GET  /api/v1/attendance/summary/:type             ← lecture|lab
GET  /api/v1/attendance/details/:type

SCHEDULE
GET  /api/v1/schedule/student
GET  /api/v1/schedule/teacher
GET  /api/v1/schedule/today?role=student|teacher

CONTENT
POST /api/v1/content/upload                       ← multipart/form-data
GET  /api/v1/content/sections/:id?type=note
GET  /api/v1/content/student?type=note|assignment
DELETE /api/v1/content/:id

CONTACTS
GET  /api/v1/contacts/student                     ← ❌ stub — needs implementation

ASSIGNMENTS (not yet created)
POST   /api/v1/assignments/
GET    /api/v1/assignments/student
GET    /api/v1/assignments/sections/:id
POST   /api/v1/assignments/questions
GET    /api/v1/assignments/questions/:sectionId
DELETE /api/v1/assignments/:id

ADMIN (not yet created)
GET  /api/v1/admin/stats
GET  /api/v1/admin/users?role=&search=
GET  /api/v1/admin/users/:id
PUT  /api/v1/admin/users/:id/role
DELETE /api/v1/admin/users/:id
GET  /api/v1/admin/courses
POST /api/v1/admin/courses
GET  /api/v1/admin/courses/:id/sections
POST /api/v1/admin/sections/:id/assign-teacher
POST /api/v1/admin/sections/:id/enroll-student
GET  /api/v1/admin/attendance/report
GET  /api/v1/admin/alerts/low-attendance
```

---

## 🎨 Shared UI Design System

All pages use these Tailwind patterns — never deviate:

```jsx
// Layout
<AppLayout title="Page Title">
  <div style={{ width: '100%' }} className="flex flex-col gap-6">
    {/* content */}
  </div>
</AppLayout>

// Card
<div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4" />

// Loading skeleton
<div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />

// Empty state
<div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
  <p className="text-sm text-gray-400 dark:text-gray-500">No data yet.</p>
</div>

// Primary button
<button className="text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40" />

// Status badge — green / red / amber / blue
<span className="text-xs px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900" />
```

**Rule:** Every Tailwind class must have a `dark:` variant. No inline styles except layout (flex, height, width).

---

---

# 👤 PERSON A — Backend & Admin Panel

**You own:** `/backend/src/`, `/src/pages/admin/`, `/src/components/admin/`  
**Do not touch:** Student/teacher pages

---

### Phase 1 — Backend Completion

#### A1 · Implement `contactRoutes.js`

The frontend `StudentContacts.jsx` expects `GET /api/v1/contacts/student`:

```js
// Expected response shape
{
  data: [
    {
      subjectId: "uuid",
      subjectName: "Data Structures",
      type: "Lecture",
      teachers: [
        { id, name, role: "Lecturer", email, phone, otherDetails }
      ]
    }
  ]
}
```

Query path: `enrollments → class_sections → teacher_assignments → teacher_profiles → profiles`

---

#### A2 · Create `assignmentRoutes.js`

```js
// backend/src/routes/assignmentRoutes.js
POST   /api/v1/assignments/                    ← create assignment
GET    /api/v1/assignments/student             ← all assignments for student
GET    /api/v1/assignments/sections/:id        ← assignments for a section
POST   /api/v1/assignments/questions           ← add question to bank
GET    /api/v1/assignments/questions/:sectionId
DELETE /api/v1/assignments/:id
```

Register in `server.js`:
```js
import assignmentRoutes from './routes/assignmentRoutes.js'
app.use('/api/v1/assignments', requireAuth, assignmentRoutes)
```

**Notify Person B** when endpoints are live so they can migrate `TeacherAssignments.jsx`.

---

#### A3 · Create `POST /api/v1/profile/onboard`

Move logic from `OnboardingPage.jsx` to the backend:
```js
// Body: { role, fullName, department, year?, section?, rollNumber?, employeeId? }
// 1. UPDATE profiles SET full_name, role, college_name WHERE id = req.user.id
// 2. INSERT into student_profiles OR teacher_profiles
```

**Notify Person B** when done so they can remove the direct Supabase calls from `OnboardingPage.jsx`.

---

#### A4 · Create `adminRoutes.js` + `requireAdminRole` middleware

```js
// backend/src/middleware/requireAdminRole.js
export async function requireAdminRole(req, res, next) {
  const { data } = await req.supabase
    .from('profiles').select('role').eq('id', req.user.id).single()
  if (data?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

// Register in server.js
import adminRoutes from './routes/adminRoutes.js'
import { requireAdminRole } from './middleware/requireAdminRole.js'
app.use('/api/v1/admin', requireAuth, requireAdminRole, adminRoutes)
```

Endpoints to implement (see API Reference above).

---

### Phase 2 — Admin Panel Pages

All 6 are stubs. Build them in `/src/pages/admin/` using the design system above.

#### A5 · `AdminDashboard.jsx`
Stat cards: total students, teachers, courses, sessions today, departments.  
Call: `GET /api/v1/admin/stats`

#### A6 · `AdminUsers.jsx`
List all users, filter by role, search by name/email, change role, delete user.  
Calls: `GET /api/v1/admin/users`, `PUT /api/v1/admin/users/:id/role`, `DELETE /api/v1/admin/users/:id`

#### A7 · `AdminCourses.jsx`
List courses, create course, create class section, assign teacher, enroll student.  
Calls: `GET /api/v1/admin/courses`, `POST /api/v1/admin/courses`, etc.

#### A8 · `AdminDepartments.jsx`
Static list (CSE, IT, ECE, EE, ME, CE) with student/teacher/course counts per dept.  
Call: `GET /api/v1/admin/stats` or add a dept breakdown endpoint.

#### A9 · `AdminAttendance.jsx`
Filter by dept/course/date range, show per-section summary, flag < 75% students.  
Call: `GET /api/v1/admin/attendance/report`

#### A10 · `AdminAlerts.jsx`
Students who dropped below 75% attendance, grouped by department.  
Call: `GET /api/v1/admin/alerts/low-attendance`  
Logic: reuse `buildAttendanceDetails()` from `attendanceRoutes.js`.

---

### Phase 3 — Infrastructure

#### A11 · CORS for production
```js
// server.js — add Vercel URL when deploying
const allowed = ['http://localhost:5173', 'https://your-app.vercel.app']
origin: (origin, cb) => (!origin || allowed.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed'))
```

#### A12 · Admin BottomNav entry
Add admin links to `BottomNav.jsx` (coordinate with Person B):
```js
admin: [
  { to: '/dashboard', label: 'Home' },
  { to: '/users', label: 'Users' },
  { to: '/courses', label: 'Courses' },
  { to: '/alerts', label: 'Alerts' },
]
```
This is already in BottomNav — just make sure admin pages are wired.

---

### A · Definition of Done
- [ ] Route is under `requireAuth` (and `requireAdminRole` for admin routes)
- [ ] Proper HTTP status codes for errors
- [ ] No raw Supabase error objects leaked to client
- [ ] Admin page fetches real data (no hardcoded values)
- [ ] Dark mode on all admin page UI
- [ ] Loading + empty + error states handled

---

---

# 👤 PERSON B — Student & Teacher Frontend

**You own:** `/src/pages/student/`, `/src/pages/teacher/`, `/src/components/student/`, `/src/components/teacher/`, `/src/lib/*.js`  
**Do not touch:** Backend routes, admin pages

---

### Phase 1 — Missing Student Pages (Priority: HIGH)

#### B1 · `StudentSchedule.jsx` — Weekly timetable

**Endpoint (already working):** `GET /api/v1/schedule/student`

Response shape:
```js
[{ id, day_of_week: "Mon", start_time: "09:00:00", end_time: "10:00:00",
   room: "Room 203", class_sections: { section: "A", courses: { name, code } } }]
```

**Fetch with:**
```js
import { apiFetch } from '../../lib/api'
const { data } = await apiFetch('/api/v1/schedule/student')
```

**UI:** Day tabs (Mon–Sat), class cards per selected day, highlight today, empty state per day.

---

#### B2 · `StudentNotes.jsx` — View course notes

**Endpoint (already working):** `GET /api/v1/content/student?type=note`

Response shape:
```js
[{ id, title, file_url, created_at,
   class_sections: { courses: { name, code } } }]
```

**Fetch with:**
```js
import { getMyContent } from '../../lib/content'
const { data } = await getMyContent('note')   // check content.js for this function
```

**UI:** Notes grouped by course, title + date, "View" link opens `file_url` in new tab, course filter, search by title.

---

#### B3 · `StudentAssignments.jsx` — View assignments

**Wait for Person A** to create `GET /api/v1/assignments/student`.  
Build the UI shell now — it will show empty state until A's route is ready.

Create `src/lib/assignments.js`:
```js
import { apiFetch } from './api'

export async function getMyAssignments() {
  return apiFetch('/api/v1/assignments/student')
    .then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: [], error: err }))
}
```

**UI:** Assignments grouped by course, due date badge (red = overdue, amber = < 48h, green = safe), question count.

---

### Phase 2 — Teacher Page Fixes (Priority: HIGH)

#### B4 · Migrate `TeacherAssignments.jsx` off Supabase

When Person A's assignment routes are ready, replace:

| Remove (Supabase direct) | Replace with (apiFetch) |
|---|---|
| `supabase.from('assignments').select(*)` | `apiFetch('/api/v1/assignments/sections/:id')` |
| `supabase.from('question_bank').select(*)` | `apiFetch('/api/v1/assignments/questions/:sectionId')` |
| `supabase.from('assignments').insert(...)` | `apiFetch('/api/v1/assignments/', { method:'POST', body:... })` |
| `supabase.from('question_bank').insert(...)` | `apiFetch('/api/v1/assignments/questions', { method:'POST', body:... })` |

Also remove `import { supabase } from '../../lib/supabase'` from this file.

---

#### B5 · Fix dev-only button in `TopHeader.jsx`

```jsx
// Wrap in DEV check so it doesn't appear in production
{import.meta.env.DEV && (
  <button onClick={handleSwapRole} className="...">
    Dev: Switch to {role === 'student' ? 'Teacher' : 'Student'}
  </button>
)}
```

---

#### B6 · Migrate `OnboardingPage.jsx` when Person A is ready

Replace lines 66–101 (direct Supabase writes) with:
```js
await apiFetch('/api/v1/profile/onboard', {
  method: 'POST',
  body: JSON.stringify({ role: selectedRole, fullName, department, year, section, rollNumber, employeeId })
})
```
Remove `import { supabase } from '../lib/supabase'` from this file.

---

### Phase 3 — UI Polish (Priority: MEDIUM)

#### B7 · `LoadingScreen.jsx` — implement properly
```jsx
export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
        <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Loading…</p>
      </div>
    </div>
  )
}
```

#### B8 · Add icons to `BottomNav.jsx`
Install: `npm install @heroicons/react`  
Import icons and add an `icon` field to each nav entry. Display icon above label.

#### B9 · Attendance projection in detail pages
`src/lib/attendance.js` already exports `computeAttendanceProjection(total, attended, threshold)`.  
Use it in `StudentLectureDetails.jsx` and `StudentLabDetails.jsx` to show:  
- "You can miss **X** more classes" (if ≥ 75%)  
- "Attend **X** consecutive classes to recover" (if < 75%)

---

### B · Definition of Done
- [ ] Real data from `apiFetch()` — no direct `supabase` imports in student/teacher pages
- [ ] Loading skeleton shown while fetching
- [ ] Empty state with helpful message
- [ ] Error state with user-friendly message
- [ ] All Tailwind classes have `dark:` variants
- [ ] Mobile layout correct on small screens (BottomNav visible, no overflow)
- [ ] No console errors

---

## 🤝 Coordination Points (Both Persons)

These require both people to sync before implementing:

| Task | Person A does | Person B does |
|---|---|---|
| Assignment routes | Create backend routes | Migrate `TeacherAssignments.jsx`, build `StudentAssignments.jsx` |
| Onboarding migration | Create `POST /api/v1/profile/onboard` | Remove supabase calls from `OnboardingPage.jsx` |
| Contacts | Implement `contactRoutes.js` | `StudentContacts.jsx` already done, will just work |
| Marks/grades | Build marks endpoints | Build student marks view page |
