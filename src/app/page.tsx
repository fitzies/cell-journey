export default function HomePage() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/icon.svg" alt="Cell Journey" className="w-10 h-10" />
        <h1 className="text-2xl font-semibold tracking-tight">Cell Journey</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in. Home page coming soon.
        </p>
      </div>
    </div>
  );
}
