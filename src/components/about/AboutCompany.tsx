import { Building, User, Rocket } from "lucide-react";

export default function AboutCompany() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Company Summary */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--kb-accent-gold)]/10 ring-1 ring-[var(--kb-accent-gold)]/20">
              <Building className="h-6 w-6 text-[var(--kb-accent-gold)]" />
            </div>
            <h3 className="text-lg font-semibold">Company Summary</h3>
          </div>
          <p className="text-foreground/80 leading-relaxed text-sm">
            KB Stylish will, upon commencement of operations, sell a wide range of beauty services and products. 
            The company will provide quality hair services, along with top lines of beauty products. What will 
            set KB Stylish apart from the competition is the company&apos;s commitment to providing all of these 
            services in one convenient location.
          </p>
        </div>

        {/* Company Ownership */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--kb-primary-brand)]/10 ring-1 ring-[var(--kb-primary-brand)]/20">
              <User className="h-6 w-6 text-[var(--kb-primary-brand)]" />
            </div>
            <h3 className="text-lg font-semibold">Company Ownership</h3>
          </div>
          <p className="text-foreground/80 leading-relaxed text-sm">
            KB Stylish is a Private Limited Company in a sole investment of <span className="font-medium text-foreground">Buddi Raj Bhattarai</span> in 
            Kathmandu Valley. The investor may sell shares to any other people later on as he wants.
          </p>
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-foreground/50">Registered in Kathmandu Valley, Nepal</p>
          </div>
        </div>

        {/* Start-up Summary */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
              <Rocket className="h-6 w-6 text-[var(--kb-accent-gold)]" />
            </div>
            <h3 className="text-lg font-semibold">Start-up Summary</h3>
          </div>
          <p className="text-foreground/80 leading-relaxed text-sm">
            After spending several months searching for a salon to purchase, the owners decided to start a salon 
            from the ground up. The start-up capital will be used for the design, leasehold improvements, and 
            equipment of the salon.
          </p>
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-foreground/50">Details available in feasibility study sheet</p>
          </div>
        </div>
      </div>
    </section>
  );
}
