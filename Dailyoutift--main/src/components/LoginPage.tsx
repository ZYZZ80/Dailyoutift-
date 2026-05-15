import { useRef, useState } from 'react'
import { Camera, CloudSun, Eye, EyeOff, Images, Loader2, Mail, ShieldCheck, Sparkles, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { convertImageFileToJpegDataUrl } from '../lib/image'
import { saveProfilePhotos } from '../lib/storage'
import { saveProfilePhotosCloud, uploadProfilePhoto } from '../lib/cloud'

interface Props {
  onLogin?: () => void
}

type Mode = 'signin' | 'signup'

function GoogleMark() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function LoginPage({ onLogin: _onLogin }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [photo, setPhoto] = useState('')
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setPhotoLoading(true)
    setError('')
    try {
      const converted = await convertImageFileToJpegDataUrl(file, 900, 0.78)
      setPhoto(converted.dataUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.substring(0, 180) : String(e).substring(0, 180))
    } finally {
      setPhotoLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveSignupPhoto(userId: string) {
    if (!photo) return ''
    saveProfilePhotos([photo])
    const url = await uploadProfilePhoto(userId, photo, 'account-photo')
    await saveProfilePhotosCloud(userId, [url])
    saveProfilePhotos([url])
    return url
  }

  async function submitEmailPassword() {
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.')
      return
    }

    const cleanEmail = email.trim()
    const cleanName = name.trim()
    if (!cleanEmail || !password) {
      setError('Add your email and password.')
      return
    }
    if (mode === 'signup' && !cleanName) {
      setError('Add your name for the account.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (authError) throw authError
        return
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            name: cleanName,
          },
        },
      })
      if (authError) throw authError

      if (data.session && data.user) {
        const avatarUrl = await saveSignupPhoto(data.user.id)
        if (avatarUrl) {
          await supabase.auth.updateUser({
            data: { full_name: cleanName, name: cleanName, avatar_url: avatarUrl, picture: avatarUrl },
          })
        }
        setMessage('Account created. Loading your dashboard...')
      } else {
        if (photo) saveProfilePhotos([photo])
        setMessage('Account created. Check your email to confirm, then sign in. Your photo will be added after login.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.substring(0, 180))
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (authError) throw authError
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Sign-in error: ${msg.substring(0, 160)}`)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] px-5 py-10 safe-top safe-bottom flex items-center justify-center">
      <div className="w-full max-w-[1120px] grid gap-6 lg:grid-cols-[1.02fr_0.98fr] items-stretch">
        <section className="bg-[#2d2d2c] text-white rounded-[28px] p-8 sm:p-9 lg:p-10 flex flex-col justify-between min-h-[560px] overflow-hidden relative shadow-[0_1px_2px_rgba(44,44,44,0.12)]">
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#8f6f64]/45 via-[#ff8b6d]/10 to-transparent" />
          <div className="relative">
            <div className="w-[52px] h-[52px] bg-white/10 rounded-[17px] flex items-center justify-center mb-7">
              <Sparkles className="w-6 h-6 text-[#f2c4b0]" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] text-white/48 mb-3">Daily Stylist</p>
            <h1 className="text-[34px] sm:text-[42px] leading-[1.12] font-semibold max-w-[500px] tracking-normal">
              Your wardrobe, outfits, styles, and AI photos in one synced dashboard.
            </h1>
          </div>

          <div className="relative grid gap-3 sm:grid-cols-3 mt-12">
            <div className="bg-white/[0.035] rounded-[18px] p-4 border border-white/10 min-h-[154px]">
              <Images className="w-5 h-5 text-[#f2c4b0] mb-5" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-white/90">App wardrobe</p>
              <p className="text-[13px] text-white/42 mt-2 leading-relaxed">Same clothes on phone, iPad, and desktop.</p>
            </div>
            <div className="bg-white/[0.035] rounded-[18px] p-4 border border-white/10 min-h-[154px]">
              <CloudSun className="w-5 h-5 text-[#a8b5a0] mb-5" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-white/90">Weather aware</p>
              <p className="text-[13px] text-white/42 mt-2 leading-relaxed">Daily outfits can match the day outside.</p>
            </div>
            <div className="bg-white/[0.035] rounded-[18px] p-4 border border-white/10 min-h-[154px]">
              <ShieldCheck className="w-5 h-5 text-white/75 mb-5" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-white/90">Private account</p>
              <p className="text-[13px] text-white/42 mt-2 leading-relaxed">Your data loads only after login.</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-[28px] shadow-[0_1px_4px_rgba(44,44,44,0.06)] border border-gray-100 p-6 sm:p-10 flex flex-col justify-center min-h-[560px]">
          <div className="max-w-[430px] mx-auto w-full">
            <div className="mb-7">
              <div className="w-[58px] h-[58px] bg-charcoal rounded-[16px] flex items-center justify-center mb-6">
                {mode === 'signup' ? <UserPlus className="w-7 h-7 text-white" strokeWidth={1.5} /> : <Sparkles className="w-7 h-7 text-white" strokeWidth={1.5} />}
              </div>
              <h2 className="text-[26px] font-semibold text-charcoal leading-tight">
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-[15px] text-gray-400 mt-3 leading-relaxed">
                {mode === 'signup'
                  ? 'Add your name, email, password, and optional try-on photo.'
                  : 'Sign in to load your wardrobe, generated pictures, and outfit history.'}
              </p>
            </div>

            <div className="grid grid-cols-2 bg-gray-50 rounded-2xl p-1 mb-5">
              <button type="button" onClick={() => { setMode('signin'); setError(''); setMessage('') }} className={`h-11 rounded-xl text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-charcoal'}`}>
                Login
              </button>
              <button type="button" onClick={() => { setMode('signup'); setError(''); setMessage('') }} className={`h-11 rounded-xl text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-[#ff8b6d] text-white shadow-sm' : 'text-gray-500 hover:text-charcoal'}`}>
                Create account
              </button>
            </div>

            <div className="space-y-3">
              {mode === 'signup' && (
                <div className="grid grid-cols-[74px_1fr] gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-[74px] h-[74px] rounded-2xl bg-[#fff4ef] border border-[#ffd8ca] overflow-hidden flex items-center justify-center text-[#ff8b6d]"
                    aria-label="Add profile photo"
                  >
                    {photo ? <img src={photo} alt="Profile preview" className="w-full h-full object-cover" /> : photoLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-6 h-6" strokeWidth={1.7} />}
                  </button>
                  <div>
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-charcoal hover:text-[#ff8b6d]">
                      {photo ? 'Change profile photo' : 'Add profile photo'}
                    </button>
                    <p className="text-xs text-gray-400 mt-1">Used for your account and try-on photos.</p>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void choosePhoto(event.target.files?.[0])} />
                </div>
              )}

              {mode === 'signup' && (
                <label className="block">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-12 rounded-2xl border border-gray-200 px-4 text-sm outline-none focus:border-[#ff8b6d] focus:ring-4 focus:ring-[#ff8b6d]/10" placeholder="Your name" autoComplete="name" />
                </label>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</span>
                <div className="mt-1 relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" strokeWidth={1.7} />
                  <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full h-12 rounded-2xl border border-gray-200 pl-11 pr-4 text-sm outline-none focus:border-[#ff8b6d] focus:ring-4 focus:ring-[#ff8b6d]/10" placeholder="you@example.com" type="email" autoComplete="email" />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Password</span>
                <div className="mt-1 relative">
                  <input value={password} onChange={(event) => setPassword(event.target.value)} className="w-full h-12 rounded-2xl border border-gray-200 px-4 pr-12 text-sm outline-none focus:border-[#ff8b6d] focus:ring-4 focus:ring-[#ff8b6d]/10" placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={submitEmailPassword}
              disabled={loading || photoLoading}
              className={`mt-5 w-full h-[54px] flex items-center justify-center gap-3 rounded-[16px] text-sm font-semibold transition-colors disabled:opacity-60 shadow-sm ${mode === 'signup' ? 'bg-[#ff8b6d] text-white hover:bg-[#ef7658]' : 'bg-charcoal text-white hover:bg-black'}`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'signup' ? <UserPlus className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
              {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Login with email'}
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-gray-100 flex-1" />
              <span className="text-xs text-gray-300">or</span>
              <div className="h-px bg-gray-100 flex-1" />
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full h-[52px] flex items-center justify-center gap-3 bg-white border border-gray-200 text-charcoal rounded-[16px] text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <GoogleMark />}
              Continue with Google
            </button>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <p className="text-red-600 text-xs leading-relaxed">{error}</p>
              </div>
            )}
            {message && (
              <div className="mt-4 bg-[#f1f8ee] border border-[#dcebd5] rounded-2xl px-4 py-3">
                <p className="text-[#5f7d55] text-xs leading-relaxed">{message}</p>
              </div>
            )}

            <p className="text-[11px] text-gray-300 text-center mt-6 leading-relaxed px-4">
              Login is required so empty browser storage can never overwrite your app account.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
