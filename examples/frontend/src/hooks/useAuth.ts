'use client'

import { useState, useCallback } from 'react'

export interface CurrentUser {
  userId: string
  email: string
  name: string
  role: string
}

function loadFromStorage(): { token: string | null; user: CurrentUser | null } {
  if (typeof window === 'undefined') return { token: null, user: null }
  return {
    token: localStorage.getItem('authToken'),
    user:  JSON.parse(localStorage.getItem('currentUser') ?? 'null'),
  }
}

export function useAuth() {
  const [{ token, user }, setState] = useState(loadFromStorage)

  const login = useCallback((tok: string, u: CurrentUser) => {
    localStorage.setItem('authToken', tok)
    localStorage.setItem('currentUser', JSON.stringify(u))
    setState({ token: tok, user: u })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('currentUser')
    setState({ token: null, user: null })
  }, [])

  return { token, user, login, logout, isLoggedIn: !!token && !!user }
}
