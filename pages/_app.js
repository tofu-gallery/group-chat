// Tofu changed this file on 2026-10-25 (TOFU.md says why): each person's role is read from the database
// (public.current_app_role()) instead of a custom claim in the access token; a sign-in sends the person on to a
// channel only from the sign-in page, not on every later auth event (a token refresh, a return to the tab); the
// session is no longer logged to the console; and the auth listener is unsubscribed the way supabase-js v2 returns it.
import '~/styles/style.css'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import UserContext from 'lib/UserContext'
import { supabase } from 'lib/Store'

export default function SupabaseSlackClone({ Component, pageProps }) {
  const [userLoaded, setUserLoaded] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [appRole, setAppRole] = useState(null)
  const router = useRouter()

  useEffect(() => {
    function saveSession(
      /** @type {Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']} */
      session
    ) {
      setSession(session)
      const currentUser = session?.user
      setUser(currentUser ?? null)
      setUserLoaded(!!currentUser)
      setAuthChecked(true)
      if (currentUser && window.location.pathname === '/') {
        router.push('/channels/[id]', '/channels/1')
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => saveSession(session))

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      saveSession(session)
    })

    return () => {
      authListener.unsubscribe()
    }
  }, [])

  // The signed-in person's role (admin, member or viewer), read from the database once they are signed in.
  useEffect(() => {
    if (!user?.id) {
      setAppRole(null)
      return
    }
    let current = true
    supabase.rpc('current_app_role').then(({ data }) => {
      if (current) setAppRole(data ?? null)
    })
    return () => {
      current = false
    }
  }, [user?.id])

  const userWithRole = useMemo(() => (user ? { ...user, appRole } : null), [user, appRole])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/')
    }
  }

  return (
    <UserContext.Provider
      value={{
        userLoaded,
        authChecked,
        user: userWithRole,
        signOut,
      }}
    >
      <Component {...pageProps} />
    </UserContext.Provider>
  )
}
