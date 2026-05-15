import { Cloud, Shirt, Sparkles, Wand2 } from 'lucide-react'

interface Props {
  onAddFirstItem: () => void
}

const steps = [
  {
    title: 'Add your wardrobe',
    text: 'Upload tops, bottoms, dresses, shoes, accessories, and outerwear.',
    icon: <Shirt className="w-5 h-5" />,
  },
  {
    title: 'Generate outfits',
    text: 'Pick an occasion and let the stylist build daily or weekly looks.',
    icon: <Wand2 className="w-5 h-5" />,
  },
  {
    title: 'Save every style',
    text: 'Your generated pictures sync to Supabase and follow you across devices.',
    icon: <Cloud className="w-5 h-5" />,
  },
]

export default function OnboardingPage({ onAddFirstItem }: Props) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <section className="w-full max-w-3xl bg-white border border-gray-100 rounded-3xl shadow-sm p-6 sm:p-8 text-center">
        <div className="w-16 h-16 bg-charcoal rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-8 h-8 text-white" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal">Build your smart wardrobe</h1>
        <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
          Start with a few clothing photos. After that, Daily Stylist becomes your live dashboard for outfits, generated pictures, and saved styles.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mt-8 text-left">
          {steps.map((step, index) => (
            <div key={step.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-charcoal border border-gray-100">
                  {step.icon}
                </span>
                <span className="text-xs font-semibold text-gray-300">Step {index + 1}</span>
              </div>
              <p className="text-sm font-semibold text-charcoal">{step.title}</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddFirstItem}
          className="mt-8 inline-flex items-center justify-center gap-2 bg-charcoal text-white px-6 py-3 rounded-2xl text-sm font-medium hover:bg-black transition-colors"
        >
          <Shirt className="w-4 h-4" />
          Add My First Item
        </button>
      </section>
    </div>
  )
}
