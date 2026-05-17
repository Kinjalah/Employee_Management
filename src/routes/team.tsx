import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/team")({ component: TeamPage });

interface Sheet {
  id: string; employee_id: string; manager_id: string | null; cycle_year: number;
  status: "draft" | "submitted" | "approved" | "returned" | "locked";
  manager_comments: string; submitted_at: string | null;
}
interface Goal { id: string; sheet_id: string; thrust_area: string; title: string; description: string; uom: string; uom_type: string; target: number; weightage: number; }
interface Profile { id: string; full_name: string; email: string; department: string | null; }

function TeamPage() {
  const { user, isManager, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [open, setOpen] = useState<Sheet | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
    else if (!authLoading && user && !isManager && !isAdmin) { toast.error("Access denied"); navigate({ to: "/" }); }
  }, [authLoading, user, isManager, isAdmin, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const q = supabase.from("goal_sheets").select("*").order("submitted_at", { ascending: false });
    const { data: ss } = isAdmin ? await q : await q.eq("manager_id", user.id);
    const list = (ss ?? []) as Sheet[];
    setSheets(list);
    const ids = Array.from(new Set(list.map((s) => s.employee_id)));
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id,full_name,email,department").in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { if (user && (isManager || isAdmin)) void load(); /* eslint-disable-next-line */ }, [user?.id, isManager, isAdmin]);

  const openSheet = async (s: Sheet) => {
    setOpen(s);
    setComments(s.manager_comments || "");
    const { data } = await supabase.from("goals").select("*").eq("sheet_id", s.id).order("sort_order");
    setGoals((data ?? []) as Goal[]);
  };

  const approve = async () => {
    if (!open) return;
    const { error } = await supabase.from("goal_sheets")
      .update({ status: "approved", approved_at: new Date().toISOString(), manager_comments: comments })
      .eq("id", open.id);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: open.id, action: "approve" });
    toast.success("Approved");
    setOpen(null); void load();
  };

  const returnSheet = async () => {
    if (!open) return;
    if (!comments.trim()) return toast.error("Add comments explaining what to change");
    const { error } = await supabase.from("goal_sheets")
      .update({ status: "returned", manager_comments: comments })
      .eq("id", open.id);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: open.id, action: "return" });
    toast.success("Returned to employee");
    setOpen(null); void load();
  };

  if (authLoading || loading) return <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team Goal Sheets</h1>
        <p className="text-muted-foreground text-sm">Review, approve, or return goal sheets from your direct reports.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">All sheets ({sheets.length})</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          {sheets.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground text-center">No goal sheets assigned to you yet. Employees must select you as their manager.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((s) => {
                  const p = profiles[s.employee_id];
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{p?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p?.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">{p?.department || "—"}</TableCell>
                      <TableCell className="text-sm">FY {s.cycle_year}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                      <TableCell className="text-sm">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openSheet(s)}><Eye className="size-4" />Review</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open && profiles[open.employee_id]?.full_name} — FY {open?.cycle_year}</DialogTitle>
            <DialogDescription>Status: <span className="capitalize">{open?.status}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thrust Area</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Target (UoM)</TableHead>
                  <TableHead>Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="text-sm">{g.thrust_area}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{g.title}</div>
                      <div className="text-xs text-muted-foreground">{g.description}</div>
                    </TableCell>
                    <TableCell className="text-sm">{g.target} {g.uom}</TableCell>
                    <TableCell className="text-sm">{g.weightage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="space-y-2">
              <Label>Manager comments</Label>
              <Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Required when returning the sheet." />
            </div>
            {open?.status === "submitted" || open?.status === "returned" ? (
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={returnSheet}><RotateCcw className="size-4" />Return</Button>
                <Button onClick={approve}><CheckCircle2 className="size-4" />Approve</Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
