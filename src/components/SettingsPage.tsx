import { AlertTriangle, CreditCard, Crown, Download, Loader2, LogOut, Settings, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AppConfig } from '../lib/storage'
import { getOutfits, getProfilePhotos, getStyles, getWardrobe } from '../lib/storage'
import { getAccountStatus, openBillingPortal, openCheckout, type AccountStatus } from '../lib/account'

interface Props {
  user: User
  config: AppConfig
  counts: {
    wardrobe: number
    outfits: number
    styles: number
  }
  onChangeProvider: () => void
  onSignOut: () => void
}

export default function SettingsPage({ user, config, counts, onChangeProvider, onSignOut }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [billingError, setBillingError] = useState('')
  const [billingLoading, setBillingLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
    getAccountStatus().then(setAccount).catch(() => {})
  }, [])

  async function handleBilling(action: 'checkout' | 'portal') {
    setBillingLoading(true)
    setBillingError('')
    try {
      if (action === 'checkout') await openCheckout()
      else await openBillingPortal()
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : String(error))
      setBillingLoading(false)
    }
  }

  async function deleteAccount() {
    if (deleteText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      const session = await supabase?.auth.getSession()
      const token = session?.data.session?.access_token
      if (!token) throw new Error('Please sign in again before deleting your account.')

      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json().catch(() => ({})) as { details?: string; error?: string }
      if (!res.ok) throw new Error(data.details ?? data.error ?? `Delete failed (${res.status})`)

      localStorage.clear()
      await supabase?.auth.signOut()
      window.location.reload()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
      setDeleting(false)
    }
  }

  function exportAccountData() {
    const data = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      },
      wardrobe: getWardrobe(),
      outfits: getOutfits(),
      styles: getStyles(),
      profilePhotos: getProfilePhotos(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `daily-stylist-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function updatePassword() {
    if (newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters.')
      return
    }
    setPasswordSaving(true)
    setPasswordMessage('')
    try {
      const { error } = await supabase!.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setPasswordMessage('Password updated.')
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Settings</h2>
        <p className="text-sm text-gray-400 mt-0.5">Account, privacy, AI provider, and app data.</p>
      </div>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-charcoal rounded-2xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-charcoal truncate">{user.user_metadata?.full_name ?? user.email}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-2xl p-3 text-center">
            <p className="text-lg font-semibold text-charcoal">{counts.wardrobe}</p>
            <p className="text-[11px] text-gray-400">Wardrobe</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-3 text-center">
            <p className="text-lg font-semibold text-charcoal">{counts.styles}</p>
            <p className="text-[11px] text-gray-400">History</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-3 text-center">
            <p className="text-lg font-semibold text-charcoal">{counts.outfits}</p>
            <p className="text-[11px] text-gray-400">Outfits</p>
          </div>
        </div>

        <div className="bg-sage/10 border border-sage/20 rounded-2xl p-3">
          <p className="text-xs font-semibold text-charcoal">App account sync is active</p>
          <p className="text-xs text-gray-500 mt-1">Your wardrobe, outfits, photos, and style history are saved to your app account after login. This browser only keeps a temporary fast cache.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onChangeProvider}
            className="inline-flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Change AI provider
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
          <button
            type="button"
            onClick={exportAccountData}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export data
          </button>
        </div>
        <p className="text-xs text-gray-400">Current provider: {config.provider}</p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sage" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-charcoal">Password</h3>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input
            value={newPassword}
            onChange={(event) => { setNewPassword(event.target.value); setPasswordMessage('') }}
            type="password"
            placeholder="New password"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage/20"
          />
          <button
            type="button"
            onClick={updatePassword}
            disabled={passwordSaving || newPassword.length === 0}
            className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Update password
          </button>
        </div>
        {passwordMessage && <p className="text-xs text-gray-500">{passwordMessage}</p>}
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-blush" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-charcoal">Plan & billing</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-[11px] text-gray-400">Current plan</p>
            <p className="text-lg font-semibold text-charcoal capitalize">{account?.plan ?? 'Free'}</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-[11px] text-gray-400">AI usage</p>
            <p className="text-lg font-semibold text-charcoal">
              {account ? (account.limit === null ? `${account.used}` : `${account.used}/${account.limit}`) : '-'}
            </p>
          </div>
        </div>
        {billingError && <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">{billingError}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleBilling('checkout')}
            disabled={billingLoading || account?.plan === 'pro'}
            className="inline-flex items-center gap-2 bg-charcoal text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-black disabled:opacity-50 transition-colors"
          >
            {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Upgrade to Pro
          </button>
          <button
            type="button"
            onClick={() => handleBilling('portal')}
            disabled={billingLoading || !account?.stripeCustomerId}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Manage billing
          </button>
        </div>
        <p className="text-xs text-gray-400">Billing is powered by Stripe. Add Stripe env vars before accepting paid users.</p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sage" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-charcoal">Privacy</h3>
        </div>
        <div className="grid gap-3 text-sm text-gray-500 leading-relaxed">
          <p>Your wardrobe, generated pictures, outfit history, profile photos, and settings are stored in your app account and loaded only after login.</p>
          <p>Photos are used to analyze clothing and create AI try-on images. AI-generated images may be processed by the configured AI provider.</p>
          <p>Local browser storage is used only as a temporary cache and recovery layer. It should never overwrite your app account data.</p>
        </div>
      </section>

      <section className="bg-white border border-red-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-charcoal">Delete account</h3>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          This permanently deletes your wardrobe, generated pictures, outfit history, settings, stored files, and login account.
        </p>

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <input
              value={deleteText}
              onChange={(event) => { setDeleteText(event.target.value); setDeleteError('') }}
              placeholder="Type DELETE"
              className="w-full border border-red-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting}
                className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Permanently delete
              </button>
              <button
                type="button"
                onClick={() => { setConfirmingDelete(false); setDeleteText(''); setDeleteError('') }}
                disabled={deleting}
                className="bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
