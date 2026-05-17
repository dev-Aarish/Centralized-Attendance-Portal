import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const linksByRole = {
  student: [
    { to: '/dashboard', label: 'Home' },
    { to: '/schedule', label: 'Schedule' },
    { to: '/assignments', label: 'Tasks' },
    { to: '/notes', label: 'Notes' },
    { to: '/contacts', label: 'Hub' },
  ],
  teacher: [
    { to: '/dashboard', label: 'Home' },
    { to: '/courses', label: 'Courses' },
    { to: '/attendance', label: 'Attend.' },
    { to: '/performance', label: 'Perf.' },
    { to: '/assignments', label: 'Tasks' },
  ],
  admin: [
    { to: '/dashboard', label: 'Home' },
    { to: '/users', label: 'Users' },
    { to: '/courses', label: 'Courses' },
    { to: '/alerts', label: 'Alerts' },
  ],
}

export default function BottomNav() {
  const { role } = useAuth()
  const links = linksByRole[role] || []

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex z-50">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 text-xs transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400 font-medium'
                : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}