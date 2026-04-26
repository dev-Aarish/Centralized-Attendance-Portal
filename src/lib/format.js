/**
 * Consistent formatting for year and section strings across the app.
 * Standard format: [DEPARTMENT] Year [YEAR] · Section [SECTION]
 */

export function formatCohort(dept, year, section) {
  if (!dept && !year && !section) return 'Unknown'
  
  const d = (dept || '').trim().toUpperCase()
  const y = (year || '').trim()
  const s = (section || '').trim().toUpperCase()
  
  const parts = []
  if (d) parts.push(d)
  if (y) parts.push(`Year ${y}`)
  if (s) parts.push(`Section ${s}`)
  
  return parts.join(' · ')
}

export function formatYearSection(year, section) {
  const y = (year || '').trim()
  const s = (section || '').trim().toUpperCase()
  
  const parts = []
  if (y) parts.push(`Year ${y}`)
  if (s) parts.push(`Section ${s}`)
  
  return parts.join(' · ')
}