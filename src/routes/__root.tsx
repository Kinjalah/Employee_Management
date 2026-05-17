import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Target, LogOut } from "lucide-react";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <div className="mt-6">
          <Link to="/" className="underline">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => { router.invalidate(); reset(); }}>Try again</Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AtomQuest — Goal Setting & Tracking Portal" },
      { name: "description", content: "In-house portal for setting, approving, and tracking employee goals across quarters." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  const { user, profile, roles, isAdmin, isManager, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // invalidate on auth change so route loaders/queries refresh
  }, []);

  if (!user) return <Outlet />;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Target className="size-5 text-primary" />
            <span>AtomQuest Goals</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link to="/" className="px-3 py-2 rounded-md hover:bg-accent" activeOptions={{ exact: true }} activeProps={{ className: "px-3 py-2 rounded-md bg-accent font-medium" }}>Dashboard</Link>
            <Link to="/my-goals" className="px-3 py-2 rounded-md hover:bg-accent" activeProps={{ className: "px-3 py-2 rounded-md bg-accent font-medium" }}>My Goals</Link>
            {isManager && (
              <Link to="/team" className="px-3 py-2 rounded-md hover:bg-accent" activeProps={{ className: "px-3 py-2 rounded-md bg-accent font-medium" }}>Team</Link>
            )}
            {isAdmin && (
              <Link to="/admin" className="px-3 py-2 rounded-md hover:bg-accent" activeProps={{ className: "px-3 py-2 rounded-md bg-accent font-medium" }}>Admin</Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{profile?.full_name || user.email}</div>
              <div className="text-xs text-muted-foreground">{roles.join(", ") || "employee"}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { await signOut(); router.navigate({ to: "/login" }); }}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
