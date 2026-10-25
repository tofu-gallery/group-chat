// Tofu changed this file on 2026-10-25 (TOFU.md says why): "Continue with Google" signs people in through Tofu's
// sign-in service while NEXT_PUBLIC_TOFU_GOOGLE_SIGN_IN is "true"; Sign up is hidden while NEXT_PUBLIC_DISABLE_SIGN_UP
// is "true" (the database refuses new accounts then too); a sign-up that waits for its confirmation email says so,
// since supabase-js v2 answers such a sign-up with a user and no session; and the confirmation link comes back to the
// address the person signed up on.
import { useState } from 'react'
import { supabase } from 'lib/Store'

const signUpClosed = process.env.NEXT_PUBLIC_DISABLE_SIGN_UP === 'true'
const googleThroughTofu = process.env.NEXT_PUBLIC_TOFU_GOOGLE_SIGN_IN === 'true'

const Home = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (type, username, password) => {
    try {
      const {
        error,
        data: { session },
      } =
        type === 'LOGIN'
          ? await supabase.auth.signInWithPassword({ email: username, password })
          : await supabase.auth.signUp({
              email: username,
              password,
              options: { emailRedirectTo: `${window.location.origin}/` },
            })
      // If there is no session here and an error hasn't been raised yet,
      // that must mean that a confirmation email has been sent.
      // NOTE: Confirming your email address is required by default.
      if (error) {
        alert('Error with auth: ' + error.message)
      } else if (!session) alert('Signup successful, confirmation mail should be sent soon!')
    } catch (error) {
      console.log('error', error)
      alert(error.error_description || error)
    }
  }

  // Tofu's sign-in service signs the person in with Google and sends them back to this address, signed in: the app
  // needs no Google client of its own. It works only for an app Tofu hosts.
  const continueWithGoogle = () => {
    window.location.href = `https://oauth.trytofu.ai/start?return=${encodeURIComponent(`${window.location.origin}/`)}`
  }

  return (
    <div className="w-full h-full flex justify-center items-center p-4 bg-gray-300">
      <div className="w-full sm:w-1/2 xl:w-1/3">
        <div className="border-teal p-8 border-t-12 bg-white mb-6 rounded-lg shadow-lg bg-white">
          {googleThroughTofu && (
            <div className="mb-6">
              <button
                type="button"
                onClick={continueWithGoogle}
                className="w-full border border-gray-400 text-gray-800 py-2 px-4 rounded text-center transition duration-150 hover:bg-gray-100"
              >
                Continue with Google
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">or use your email</p>
            </div>
          )}
          <div className="mb-4">
            <label className="font-bold text-grey-darker block mb-2">Email</label>
            <input
              type="text"
              className="block appearance-none w-full bg-white border border-grey-light hover:border-grey px-2 py-2 rounded shadow"
              placeholder="Your Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="font-bold text-grey-darker block mb-2">Password</label>
            <input
              type="password"
              className="block appearance-none w-full bg-white border border-grey-light hover:border-grey px-2 py-2 rounded shadow"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            {!signUpClosed && (
              <a
                onClick={(e) => {
                  e.preventDefault()
                  handleLogin('SIGNUP', username, password)
                }}
                href={'/channels'}
                className="bg-indigo-700 hover:bg-teal text-white py-2 px-4 rounded text-center transition duration-150 hover:bg-indigo-600 hover:text-white"
              >
                Sign up
              </a>
            )}
            <a
              onClick={(e) => {
                e.preventDefault()
                handleLogin('LOGIN', username, password)
              }}
              href={'/channels'}
              className="border border-indigo-700 text-indigo-700 py-2 px-4 rounded w-full text-center transition duration-150 hover:bg-indigo-700 hover:text-white"
            >
              Login
            </a>
            {signUpClosed && (
              <p className="text-center text-sm text-gray-600 mt-2">
                Sign-up is closed: ask the owner of this chat to add you.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
