# Centralized Digital Attendance Portal

A comprehensive, secure, and intelligent web-based platform designed to revolutionize attendance management in colleges and higher educational institutions. This centralized digital attendance system eliminates manual registers, reduces proxy attendance, enforces academic discipline, and fosters better communication between students, professors, and administrators.

Built with modern technologies, the portal provides role-specific dashboards, real-time tracking, predictive analytics, and automated workflows. It ensures high accuracy through classroom WiFi-based marking while offering flexibility for professors and robust administrative controls. The system not only simplifies daily attendance processes but also supports long-term academic planning through insightful visualizations, recovery planners, and policy enforcement mechanisms.

Whether it's managing large student datasets, handling leave requests, sending timely parental alerts, or gamifying attendance to boost engagement — this platform delivers a seamless and reliable experience for all stakeholders.

## Features

### Access Control & Security
- Role-based authentication: Admin, Professor/Teacher, and Student portals
- Magic link login with OTP verification
- Temporary access provision for substitute teachers
- Professors and Admins can restrict students from exams, assignments, or tests based on attendance
- Professors control lab access using theory attendance or custom rules
- Limited feature access for students with low attendance
- Multi-device login detection to prevent proxy attendance
- Student attendance records are hidden from peers

### Attendance Management
- WiFi-based automatic attendance marking (must connect to classroom WiFi)
- Accurate attendance tracking with support for manual entry and voice commands
- Quick bulk marking (Mark all present → edit absentees)
- Track late entries
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
