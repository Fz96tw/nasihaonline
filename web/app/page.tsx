import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Nasiha</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Foundational scaffold — Next.js, Tailwind, and shadcn/ui are wired up.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
