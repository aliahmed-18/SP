import { EyeOff, LogIn, Presentation, ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { JoinCard } from './JoinCard';
import { LivePreviewCard } from './LivePreviewCard';

const HERO_WORDS = ['Assess', 'Interact', 'Be efficient'];
const HOW_IT_WORKS = [
  'Show the code or QR at the start of the lecture.',
  'Questions arrive quietly, and you group them by topic.',
  'Check understanding with Quick Checks and finish with a take-away.',
];

export function HomePage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-primary/10 blur-3xl"
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="Getit home" className="rounded-md">
          <Wordmark className="h-9 w-auto sm:h-10" />
        </Link>
        <ThemeToggle />
      </header>

      {/* The slogan, always centred on the page (every screen size). */}
      <div className="relative flex justify-center px-4 pb-6 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-accent px-4 py-1.5 text-center font-medium text-accent-foreground">
          <span aria-hidden className="text-attention">
            ✦
          </span>
          Make sure your students get it.
        </p>
      </div>

      {/* Phones/tablets: headline under the logo → For instructors → For students → the rest.
          Laptop (lg): headline + details on the left, the two cards on the right. */}
      <main className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_minmax(0,32rem)] lg:content-start lg:gap-x-16 lg:gap-y-6 lg:pt-6">
        <section
          aria-labelledby="hero-title"
          className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1 lg:gap-6"
        >
          <h1 id="hero-title" className="text-4xl font-bold tracking-tight sm:text-6xl">
            {HERO_WORDS.map((w) => (
              <span key={w} className="block">
                {w}
                <span className="text-attention">.</span>
              </span>
            ))}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Assess understanding, hear every question and keep the whole class involved, without losing
            lecture time.
          </p>
        </section>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {/* Instructors first on phones and tablets (like the MVP); students first beside the headline on laptops. */}
          <div className="lg:order-2">
            <InstructorCard />
          </div>
          <div className="lg:order-1">
            <JoinCard />
          </div>
        </div>

        <section aria-label="About Getit" className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> No student accounts
            </li>
            <li className="flex items-center gap-1.5">
              <EyeOff className="size-4 text-primary" aria-hidden /> Anonymous questions
            </li>
            <li className="flex items-center gap-1.5">
              <Smartphone className="size-4 text-primary" aria-hidden /> Works on any phone
            </li>
          </ul>

          <div className="hidden lg:block">
            <LivePreviewCard />
          </div>

          <section aria-labelledby="how-title" className="max-w-xl">
            <h2 id="how-title" className="mb-3 text-lg font-semibold">
              How it works
            </h2>
            <ol className="flex flex-col gap-3">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted-foreground">
              No student accounts. Questions stay anonymous.
            </p>
          </section>
        </section>
      </main>
    </div>
  );
}

function InstructorCard() {
  return (
    <section aria-labelledby="instructors-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary">
          <Presentation className="size-5" aria-hidden />
        </span>
        For instructors
      </div>
      <h2 id="instructors-title" className="text-xl font-semibold">
        Start a session
      </h2>
      <p className="mb-5 text-muted-foreground">Log in to run a lecture, see questions and results.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg">
          <Link to="/login">
            <LogIn /> Log in
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/register">
            <UserPlus /> Create account
          </Link>
        </Button>
      </div>
    </section>
  );
}
