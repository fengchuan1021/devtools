import request from '../utils/request'

export function login(username, password) {
  return request.post('/api/user/login', { username, password })
}

export function getUserProfile() {
  return request.get('/api/user/profile')
}

export function createUser(username, password) {
  return request.post('/api/user', { username, password })
}
