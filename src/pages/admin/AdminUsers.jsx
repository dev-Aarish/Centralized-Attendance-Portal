import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import SpiralLoader from '../../components/shared/Loader'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [roleFilter, setRoleFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [newRole, setNewRole] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [roleFilter])

  async function fetchUsers() {
    try {
      setLoading(true)
      const query = roleFilter ? `?role=${roleFilter}` : ''
      const data = await apiFetch(`/api/v1/admin/users${query}`)
      setUsers(data.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load users')
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter((u) =>
    !searchTerm ||
    u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  async function handleChangeRole() {
    if (!newRole || !editingId) return

    try {
      await apiFetch(`/api/v1/admin/users/${editingId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ newRole }),
      })
      setEditingId(null)
      setNewRole('')
      await fetchUsers()
    } catch (err) {
      setError(err.message || 'Failed to change role')
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Are you sure you want to delete this user?')) return

    // Optimistic UI Update: hide the user instantly
    setUsers((prev) => prev.filter((u) => u.id !== id))

    try {
      await apiFetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' })
      // fetch in background to sync
      fetchUsers()
    } catch (err) {
      setError(err.message || 'Failed to delete user')
      // Revert on error
      await fetchUsers()
    }
  }

  if (loading) {
    return (
      <AppLayout title="User Management">
        <div style={{ width: '100%' }} className="flex items-center justify-center min-h-[60vh]">
          <SpiralLoader />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="User Management">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Users</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">View, search, and manage user accounts</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Users Table */}
        {filteredUsers.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No users found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Details</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{user.fullName || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-600 dark:text-gray-400 text-xs">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === user.id ? (
                          <div className="flex gap-2">
                            <select
                              value={newRole}
                              onChange={(e) => setNewRole(e.target.value)}
                              className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                              <option value="">Select role</option>
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              onClick={handleChangeRole}
                              className="px-2 py-1 rounded text-xs bg-green-500 text-white hover:bg-green-600 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 rounded text-xs bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                            {user.role || 'None'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                        {user.role === 'student' && user.studentDetails && (
                          <p>{user.studentDetails.rollNumber} • {user.studentDetails.department}</p>
                        )}
                        {user.role === 'teacher' && user.teacherDetails && (
                          <p>{user.teacherDetails.employeeId} • {user.teacherDetails.department}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(user.id)
                              setNewRole(user.role || '')
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stats Footer */}
        <div className="text-xs text-gray-400 dark:text-gray-500">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>
    </AppLayout>
  )
}
