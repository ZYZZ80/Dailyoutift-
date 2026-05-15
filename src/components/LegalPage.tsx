import { ShieldCheck } from 'lucide-react'

export default function LegalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-charcoal">Privacy & Terms</h2>
        <p className="text-sm text-gray-400 mt-0.5">Plain-English launch policies for beta and paid users.</p>
      </div>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4 text-sm text-gray-500 leading-relaxed">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sage" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-charcoal">Privacy Policy</h3>
        </div>
        <p>Your wardrobe items, generated pictures, outfit history, profile photos, usage records, and account settings are stored in Supabase under your authenticated user account.</p>
        <p>Uploaded photos and outfit prompts may be sent to the configured AI provider to analyze clothing or generate images. Do not upload photos you do not have permission to use.</p>
        <p>Local browser storage is used as temporary cache and recovery storage. Cloud data is the source of truth after login.</p>
        <p>You can delete your account from Settings. Deletion removes app database rows, stored files, and the login account when the server service key is configured.</p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4 text-sm text-gray-500 leading-relaxed">
        <h3 className="text-sm font-semibold text-charcoal">Terms of Use</h3>
        <p>Daily Stylist provides AI-generated outfit suggestions and images for inspiration. It is not a professional fashion, health, safety, or purchasing advisor.</p>
        <p>AI results can be inaccurate, delayed, or unavailable. Paid access may include higher usage limits, but does not guarantee perfect generation results.</p>
        <p>Users are responsible for uploaded content, account security, and following local laws and platform rules.</p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4 text-sm text-gray-500 leading-relaxed">
        <h3 className="text-sm font-semibold text-charcoal">AI Image Notice</h3>
        <p>Generated try-on images are synthetic. They may alter body shape, clothing fit, color, texture, or proportions. Use them as styling previews, not exact product representations.</p>
      </section>
    </div>
  )
}
