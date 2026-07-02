export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">404 Page Not Found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The requested sandbox page does not exist.
        </p>
      </div>
    </div>
  );
}
