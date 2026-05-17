import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Users, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading, profile, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {profile?.full_name?.split(" ")[0] || "there"}</h1>
        <p className="text-muted-foreground mt-1">Set goals, track progress, and align with your manager — all in one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <ClipboardList className="size-6 text-primary mb-2" />
            <CardTitle>My Goal Sheet</CardTitle>
            <CardDescription>Create your annual goals and log quarterly progress.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/my-goals">Open <ArrowRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        {isManager && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Users className="size-6 text-primary mb-2" />
              <CardTitle>Team Approvals</CardTitle>
              <CardDescription>Review goal sheets and check-ins from your direct reports.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <Link to="/team">Open <ArrowRight className="size-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <ShieldCheck className="size-6 text-primary mb-2" />
              <CardTitle>Admin Console</CardTitle>
              <CardDescription>Org-wide goals, roles, audit log, and CSV exports.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <Link to="/admin">Open <ArrowRight className="size-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cycle calendar (FY)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-5 text-sm">
            {[
              ["Apr", "Goal setting"],
              ["May / Jul / Oct / Jan", "Quarterly check-ins"],
              ["Q1", "May window"],
              ["Q4", "January window"],
              ["Mar/Apr", "Year-end review"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3">
                <div className="font-medium">{k}</div>
                <div className="text-muted-foreground text-xs">{v}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// silence unused warning if Navigate not used
void Navigate;
