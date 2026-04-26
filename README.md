# Centralized Digital Attendance Portal

A comprehensive, secure, and intelligent web-based platform designed to revolutionize attendance management in colleges and higher educational institutions. This centralized digital attendance system eliminates manual registers, reduces proxy attendance, enforces academic discipline, and fosters better communication between students, professors, and administrators.

Built with modern technologies, the portal provides role-specific dashboards, real-time tracking, predictive analytics, and automated workflows. It ensures high accuracy through classroom WiFi-based marking while offering flexibility for professors and robust administrative controls. The system not only simplifies daily attendance processes but also supports long-term academic planning through insightful visualizations, recovery planners, and policy enforcement mechanisms.

Whether it's managing large student datasets, handling leave requests, sending timely parental alerts, or gamifying attendance to boost engagement — this platform delivers a seamless and reliable experience for all stakeholders.

## Features

### Access Control & Security
- Role-based authentication: Admin, Professor/Teacher, and Student portals
- Professors and Admins can restrict students from exams, assignments, or tests based on attendance
- Professors control lab access using theory attendance or custom rules
- Limited feature access for students with low attendance
- Student attendance records are hidden from peers

### Attendance Management- Accurate attendance tracking with support for manual entry and voice commands
- Quick bulk marking (Mark all present → edit absentees)
- 100% attendance celebration animation
- Sticky headers and clean student list views
- Attendance predictor: shows how many classes can be safely skipped
- Missed class recovery planner with upcoming class recommendations
- Visual attendance patterns, consistency tracking, and monthly heatmaps
- Absent students can request attendance correction from professors
- Smart alerts for low attendance and mass bunk detection

### Communication & Notifications
- Real-time notifications using Socket.io
- Smart reminders to professors if attendance is not marked
- Automated email alerts to parents after 3-4 consecutive absences
- Leave application system with professor approval/rejection workflow
- Warning notifications before applying attendance-based restrictions
- Announcement board for important updates
- Quick email option to faculty or peers
- Anonymous feedback system for professors

### User Interface & Experience
- Built with React
- Clean, uniform design with consistent color scheme
- Bento grid layout with summary cards and remarks on dashboards
- Progress bars and visual rings for attendance percentage (warning below 75%)
- Monthly attendance heatmaps for students
- Individual student attendance tracking for professors
- Export attendance reports as PDF or Excel
- Global search bar with keyboard shortcut
- Loading indicators and smooth UX (no blank screens)
- Profile pictures/avatars for students
- Quick filters by subject or date
- Menu bar for easy navigation between courses

### Routine & Timetable Management
- Daily class routine display
- Students can view schedules using class or email ID
- Admin uploads timetable → automatic professor and class assignment
- Option to mark class cancellations (no attendance counted)
- Teachers/Class Representatives can schedule extra classes

### Data Management
- Secure and isolated data per college/institution
- Relational data handled with Supabase SQL
- Efficient handling of large datasets and historical attendance records
- Store attendance per lecture (date-wise and class-wise history)
- Sort students by attendance percentage
- Bar graphs and visual analytics for attendance patterns

### Assignments & Tests
- Professors can set minimum attendance thresholds to unlock assignments and tests
- Personalized assignments with unique questions
- Student-specific test result dashboard
- Analysis of assignment score vs attendance ratio

### Additional Features
- Auto backup system for attendance records
- Attendance freeze option to prevent proxy corrections after a deadline
- Performance monitoring for system reliability
- Future-ready: GPS-based location verification (with professor confirmation) and OCR for schedule import

## Tech Stack
- **Frontend**: React.js + Tailwind CSS
- **Backend**: Node.js (implied)
- **Authentication**: Auth.js with OTP and magic links
- **Real-time**: Socket.io
- **Database**: Supabase (PostgreSQL) for relational data 
- **Notifications**: Email + real-time via Socket.io


---

**Secure • Accurate • Intelligent**
