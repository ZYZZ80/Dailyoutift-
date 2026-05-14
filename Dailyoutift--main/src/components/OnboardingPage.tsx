import { Shirt, Wand2, ShoppingBag, ArrowRight } from 'lucide-react'

interface Props {
  userName?: string
  onAddFirstItem: () => void
}

const STEPS = [
  {
    icon: Shirt,
    color: 'bg-blush/20 text-blush-dark',
    title: 'Add your clothes',
    desc: 'Photo every item in your wardrobe. AI tags them automatically — takes under a minute.',
  },
  {
    icon: Wand2,
    color: 'bg-sage/20 text-sage-dark',
    title: 'Get a daily outfit',
    desc: 'Pick an occasion and your AI stylist builds the perfect look from what you own.',
  },
  {
    icon: ShoppingBag,
    color: 'bg-[#E8E4DF] text-charcoal',
    title: 'Try before you buy',
    desc: 'See how online clothes look on your real photo before spending money.',
  },
]

export default function OnboardingPage({ userName, onAddFirstItem }: Props) {
  const first = userName?.split(' ')[0]
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12 animate-fade-in">
      <div className="max-w-md w-full space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-charcoal rounded-3xl shadow-md mb-4">
            <Wand2 className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-charcoal">
            {first ? `Hi ${first} 👋` : 'Welcome!'}
          </h1>
          <p className="text-charcoal-muted text-base leading-relaxed">
            Your AI wardrobe stylist is ready. Add your first clothing item to get started.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DF] p-4 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${step.color}`}>
                <step.icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-charcoal">{step.title}</p>
                <p className="text-xs text-charcoal-muted mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
              <span className="ml-auto text-xs font-bold text-charcoal-muted/40 flex-shrink-0 pt-0.5">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onAddFirstItem}
          className="w-full flex items-center justify-center gap-2 bg-charcoal text-white py-4 rounded-2xl text-base font-semibold hover:bg-black transition-colors shadow-sm animate-scale-in"
        >
          <Shirt className="w-5 h-5" />
          Add My First Item
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-center text-xs text-charcoal-muted/60">
          Photos stay private and are only used to generate outfit suggestions.
        </p>
      </div>
    </div>
  )
}
