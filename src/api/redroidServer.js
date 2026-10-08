import request from '../utils/request'

export function listRedroidServers() {
  return request.get('/api/redroid_server/list')
}

export function getRedroidServer(id) {
  return request.get(`/api/redroid_server/get?id=${id}`)
}

export function createRedroidServer(data) {
  return request.post('/api/redroid_server/create', data)
}

export function updateRedroidServer(data) {
  return request.post('/api/redroid_server/update', data)
}

export function deleteRedroidServer(id) {
  return request.post('/api/redroid_server/delete', { id })
}

export function listRedroidContainers(id) {
  return request.get(`/api/redroid_server/containers?id=${id}`)
}

export function startRedroidContainer(id, serial) {
  return request.post('/api/redroid_server/container/start', { id, serial })
}

export function stopRedroidContainer(id, serial) {
  return request.post('/api/redroid_server/container/stop', { id, serial })
}

export function getRedroidContainerLocation(serial) {
  return request.get(`/api/redroid_server/container/location?serial=${encodeURIComponent(serial)}`)
}

export function updateRedroidContainerLocation(serial, latitude, longitude) {
  return request.post('/api/redroid_server/container/location', { serial, latitude, longitude })
}
