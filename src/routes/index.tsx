import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Users, ShieldCheck, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading, profile, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ sheets: 0, approved: 0, pending: 0, checkins: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user || !isManager) return;
    setStatsLoading(true);
    Promise.all([
      supabase.from("goal_sheets").select("*", { count: "exact", head: true }).eq("manager_id", user.id),
      supabase.from("goal_sheets").select("*", { count: "exact", head: true }).eq("manager_id", user.id).eq("status", "approved"),
      supabase.from("goal_sheets").select("*", { count: "exact", head: true }).eq("manager_id", user.id).eq("status", "submitted"),
    ]).then(([s, a, p]) => {
      setStats({ sheets: s.count || 0, approved: a.count || 0, pending: p.count || 0, checkins: 0 });
      setStatsLoading(false);
    });
  }, [user?.id, isManager]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completionRate = stats.sheets > 0 ? Math.round((stats.approved / stats.sheets) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Welcome back, {profile?.full_name?.split(" ")[0] || "there"}</h1>
          <p className="text-muted-foreground mt-2">Set goals, track progress, and align with your team — all in one place.</p>
        </div>
      </div>

      {isManager && !statsLoading && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total team sheets</p>
                  <p className="text-3xl font-bold">{stats.sheets}</p>
                </div>
                <ClipboardList className="size-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending approval</p>
                  <p className="text-3xl font-bold text-amber-600">{stats.pending}</p>
                </div>
                <AlertCircle className="size-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{stats.approved}</p>
                </div>
                <CheckCircle2 className="size-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Completion</p>
                <div className="space-y-1">
                  <Progress value={completionRate} className="h-2" />
                  <p className="text-2xl font-bold">{completionRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
          <CardHeader>
            <ClipboardList className="size-6 text-blue-600 mb-2" />
            <CardTitle>My Goal Sheet</CardTitle>
            <CardDescription>Create goals, log progress, align with manager.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/my-goals">Open <ArrowRight className="size-4 ml-2" /></Link>
            </Button>
          </CardContent>
        </Card>

        {isManager && (
          <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-amber-500">
            <CardHeader>
              <Users className="size-6 text-amber-600 mb-2" />
              <CardTitle>Team Approvals</CardTitle>
              <CardDescription>Review & approve team goal sheets and check-ins.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <Link to="/team">Open <ArrowRight className="size-4 ml-2" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-purple-500">
            <CardHeader>
              <ShieldCheck className="size-6 text-purple-600 mb-2" />
              <CardTitle>Admin Console</CardTitle>
              <CardDescription>Manage users, roles, audit, and exports.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <Link to="/admin">Open <ArrowRight className="size-4 ml-2" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📅 Fiscal Year Calendar</CardTitle>
          <CardDescription>Key dates for goal setting, check-ins, and reviews</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5 text-sm">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
              <div className="font-semibold text-blue-900 dark:text-blue-100">May</div>
              <div className="text-blue-700 dark:text-blue-300 text-xs mt-1">Goal Setting Window</div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4">
              <div className="font-semibold text-amber-900 dark:text-amber-100">Jul / Oct</div>
              <div className="text-amber-700 dark:text-amber-300 text-xs mt-1">Q1 & Q2 Check-ins</div>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4">
              <div className="font-semibold text-green-900 dark:text-green-100">Jan</div>
              <div className="text-green-700 dark:text-green-300 text-xs mt-1">Q3 Check-in</div>
            </div>
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 p-4">
              <div className="font-semibold text-purple-900 dark:text-purple-100">Mar/Apr</div>
              <div className="text-purple-700 dark:text-purple-300 text-xs mt-1">Q4 & Year-End Review</div>
            </div>
            <div className="rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 p-4">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Always</div>
              <div className="text-slate-700 dark:text-slate-300 text-xs mt-1">View progress & notes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">✨ Platform Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Goal Management</p>
                <p className="text-xs text-muted-foreground">Create, edit, and submit annual goal sheets with up to 8 goals</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Manager Approval</p>
                <p className="text-xs text-muted-foreground">Managers review and approve/reject employee goal sheets</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Quarterly Check-ins</p>
                <p className="text-xs text-muted-foreground">Log actual values and scores during designated check-in windows</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Automated Scoring</p>
                <p className="text-xs text-muted-foreground">System computes weighted scores based on achievement</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Shared Goals</p>
                <p className="text-xs text-muted-foreground">Admin can publish org-wide goals to multiple employees</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="size-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Reporting & Audit</p>
                <p className="text-xs text-muted-foreground">CSV exports, full reports, and complete audit trail</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
