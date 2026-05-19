import { apiFetch } from './api'

// Upload marks for multiple students in a section
// marksArray = [{ studentId, marksObtained, maxMarks }]
export async function uploadExamMarks(classSectionId, examName, marksArray) {
  try {
    const result = await apiFetch('/api/v1/marks/upload', {
      method: 'POST',
      body: JSON.stringify({ classSectionId, examName, marksArray }),
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Get all exam marks for a specific section
export async function getMarksForSection(classSectionId) {
  try {
    const result = await apiFetch(`/api/v1/marks/sections/${classSectionId}`)
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Get current student's own marks across all sections
export async function getMyMarks() {
  try {
    const result = await apiFetch('/api/v1/marks/mine')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Get class average for a specific exam in a section
export async function getClassAverage(classSectionId, examName) {
  try {
    const result = await apiFetch(`/api/v1/marks/average/${classSectionId}/${examName}`)
    return { average: result.average, error: null }
  } catch (err) {
    return { average: 0, error: err }
  }
}

// Upload Excel and let backend convert to JSON
export async function uploadExamMarksExcel(file, classSectionId, examName, maxMarks) {
  try {
    const formData = new FormData()
    formData.append('marksFile', file)
    formData.append('classSectionId', classSectionId)
    formData.append('examName', examName)
    if (maxMarks != null) formData.append('maxMarks', String(maxMarks))

    const result = await apiFetch('/api/v1/marks/upload-excel', {
      method: 'POST',
      body: formData,
      headers: {},
    })

    return {
      data: result.data,
      parsed: result.parsed,
      imported: result.imported,
      skipped: result.skipped,
      error: null,
    }
  } catch (err) {
    return { data: null, parsed: [], imported: 0, skipped: [], error: err }
  }
}

// Upload marks from JSON text
export async function uploadExamMarksJsonText(classSectionId, examName, rows, maxMarks) {
  try {
    const result = await apiFetch('/api/v1/marks/upload-json', {
      method: 'POST',
      body: JSON.stringify({ classSectionId, examName, rows, maxMarks }),
    })
    return { data: result.data, imported: result.imported, skipped: result.skipped, error: null }
  } catch (err) {
    return { data: null, imported: 0, skipped: [], error: err }
  }
}

// Upload marks from JSON file
export async function uploadExamMarksJsonFile(file, classSectionId, examName, maxMarks) {
  try {
    const formData = new FormData()
    formData.append('marksFile', file)
    formData.append('classSectionId', classSectionId)
    formData.append('examName', examName)
    if (maxMarks != null) formData.append('maxMarks', String(maxMarks))

    const result = await apiFetch('/api/v1/marks/upload-json-file', {
      method: 'POST',
      body: formData,
      headers: {},
    })

    return { data: result.data, imported: result.imported, skipped: result.skipped, error: null }
  } catch (err) {
    return { data: null, imported: 0, skipped: [], error: err }
  }
}