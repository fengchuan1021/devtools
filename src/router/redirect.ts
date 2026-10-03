import { useUserStore } from '../stores/user'

export function pathAfterLogin(redirect: unknown) {
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.startsWith('/login') &&
    !redirect.startsWith('/register')
  ) {
    return redirect
  }
  return { name: 'dev' as const }
}

export function redirectToLogin() {
  useUserStore().logout()
  const hash = window.location.hash
  if (hash.startsWith('#/login') || hash.startsWith('#/register')) return
  const path = hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  const query = new URLSearchParams({ redirect: path })
  window.location.hash = `#/login?${query}`
}
