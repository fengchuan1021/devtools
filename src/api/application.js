import request from '../utils/request'

export function getApplications() {
  return request.get('/api/applications')
}
