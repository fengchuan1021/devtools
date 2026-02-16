import request from '../utils/request'

export function getScriptsTree() {
  return request.get('/api/scripts_tree')
}

export function getScript(id) {
  return request.get(`/api/scripts/${id}`)
}

export function listScripts() {
  return request.get('/api/scripts')
}

export function updateScriptCategoryOnly(scriptId, categoryId) {
  return request.patch(`/api/scripts/${scriptId}/category`, { category_id: categoryId })
}

export function deleteScript(id) {
  return request.delete(`/api/scripts/${id}`)
}

export function getScriptCategories() {
  return request.get('/api/script_categories')
}

export function createScriptCategory(data) {
  return request.post('/api/script_categories', data)
}

export function updateScriptCategory(id, data) {
  return request.patch(`/api/script_categories/${id}`, data)
}

export function deleteScriptCategory(id) {
  return request.delete(`/api/script_categories/${id}`)
}

export function createScript(data) {
  return request.post('/api/scripts', data)
}

export function updateScript(id, data) {
  return request.patch(`/api/scripts/${id}`, data)
}
