import { supabaseAdmin } from '../lib/supabase.js'

/**
 * Middleware to verify user has admin role
 * Must be used after requireAuth middleware
 */
function normalizeDepartment(value) {
  if (!value) return ''
  const compact = String(value).trim().toUpperCase().replace(/[^A-Z]/g, '')

  if (compact === 'CSE' || compact.includes('COMPUTERSCIENCE')) return 'CSE'
  if (compact === 'IT' || compact.includes('INFORMATIONTECHNOLOGY')) return 'IT'
  if (compact === 'ECE' || compact.includes('ELECTRONICS') || compact.includes('COMMUNICATION')) return 'ECE'
  if (compact === 'EE' || compact.includes('ELECTRICAL')) return 'EE'
  if (compact === 'ME' || compact.includes('MECHANICAL')) return 'ME'
  if (compact === 'CE' || compact.includes('CIVIL')) return 'CE'
  if (compact === 'AEIE') return 'AEIE'
  if (compact === 'CSBS') return 'CSBS'
  if (compact === 'CSDS') return 'CSDS'
  if (compact === 'AIML') return 'AIML'
  if (compact === 'CHE' || compact.includes('CHEMICAL')) return 'CHE'
  if (compact === 'MATHEMATICS' || compact.includes('MATH')) return 'MATHEMATICS'
  if (compact === 'PHYSICS') return 'PHYSICS'

  return compact
}

function findDepartmentFromEmail(email) {
  if (!email) return null
  const localPart = email.split('@')[0].toUpperCase()
  const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AEIE', 'CSBS', 'CSDS', 'AIML', 'CHE', 'MATHEMATICS', 'PHYSICS']

  for (const dept of DEPARTMENTS) {
    const regex = new RegExp(`(^|[^A-Z])${dept}([^A-Z]|$)`)
    if (regex.test(localPart)) return dept
  }

  const normalized = normalizeDepartment(localPart)
  return DEPARTMENTS.includes(normalized) ? normalized : null
}

function isKnownAdminEmail(email) {
  if (!email) return false
  const lower = email.toLowerCase()
  if (lower === 'admin@heritageit.edu.in' || lower === 'admin@heritageit.edu') return true
  if (lower.includes('-hod@') || lower.includes('.hod@')) return true
  return false
}

export async function requireAdminRole(req, res, next) {
  try {
    const db = supabaseAdmin || req.supabase
    const { data: profile, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .maybeSingle()

    if (error) {
      console.warn('[requireAdminRole] profiles fetch error:', error)
    }

    let fallbackRole = req.user?.app_metadata?.role || req.user?.user_metadata?.role || null
    const fallbackDept = req.user?.user_metadata?.department || req.user?.app_metadata?.department || null
    const fallbackEmail = req.user?.email || null

    if (!fallbackRole && isKnownAdminEmail(fallbackEmail)) {
      fallbackRole = 'admin'
    }

    if (error && fallbackRole !== 'admin') {
      return res.status(401).json({ error: 'User profile not found' })
    }

    let resolvedProfile = profile

    if (!resolvedProfile && fallbackRole === 'admin') {
      resolvedProfile = {
        role: 'admin',
        email: fallbackEmail,
        department: fallbackDept || findDepartmentFromEmail(fallbackEmail),
      }
    }

    if (!resolvedProfile) {
      const writeDb = supabaseAdmin || req.supabase
      const fullName = req.user?.user_metadata?.full_name || req.user?.user_metadata?.name || null
      const { error: insertError } = await writeDb
        .from('profiles')
        .upsert(
          {
            id: req.user.id,
            email: req.user.email,
            full_name: fullName,
            role: null,
          },
          { onConflict: 'id' }
        )

      if (insertError) {
        console.error('Failed to create profile row:', insertError)
        return res.status(401).json({ error: 'User profile not found' })
      }

      const { data: refetched } = await db
        .from('profiles')
        .select('*')
        .eq('id', req.user.id)
        .maybeSingle()

      if (refetched) {
        resolvedProfile = refetched
      } else if (fallbackRole === 'admin') {
        resolvedProfile = {
          role: 'admin',
          email: fallbackEmail,
          department: fallbackDept,
        }
      } else {
        return res.status(401).json({ error: 'User profile not found' })
      }
    }

    if (resolvedProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Determine admin department
    let adminDept = normalizeDepartment(resolvedProfile.department)
    
    // 1. Try to get department from teacher_profiles if the admin is also an HOD
    const { data: teacherProfile } = await db
      .from('teacher_profiles')
      .select('department')
      .eq('profile_id', req.user.id)
      .single()
      
    if (teacherProfile && teacherProfile.department) {
      adminDept = normalizeDepartment(teacherProfile.department)
    }

    if (!adminDept) {
      adminDept = findDepartmentFromEmail(resolvedProfile.email)
    }

    // Attach admin flags to request
    req.isAdmin = true
    req.adminDepartment = adminDept
    next()
  } catch (err) {
    console.error('requireAdminRole middleware error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
