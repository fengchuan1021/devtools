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
  return { name: 'home' as const }
}
