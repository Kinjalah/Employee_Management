import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle2, RotateCcw, Eye, AlertCircle } from "lucide-react";
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
  const [checkins, setCheckins] = useState<any[]>([]);
  const [comments, setComments] = useState("");
  const [approveConfirm, setApproveConfirm] = useState(false);
  const [returnConfirm, setReturnConfirm] = useState(false);

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
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("goals").select("*").eq("sheet_id", s.id).order("sort_order"),
      supabase.from("check_ins").select("*").in("goal_id", (await supabase.from("goals").select("id").eq("sheet_id", s.id)).data?.map((x: any) => x.id) ?? []),
    ]);
    setGoals((g ?? []) as Goal[]);
    setCheckins((c ?? []) as any[]);
  };

  const approve = async () => {
    if (!open) return;
    // Save any inline edits before approving
    await saveGoals();
    const { error } = await supabase.from("goal_sheets")
      .update({ status: "approved", approved_at: new Date().toISOString(), manager_comments: comments })
      .eq("id", open.id);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: open.id, action: "approve" });
    toast.success("✓ Goal sheet approved successfully");
    setApproveConfirm(false);
    setOpen(null); void load();
  };

  const saveGoals = async () => {
    if (!open) return;
    try {
      for (const g of goals) {
        const payload = { target: g.target, weightage: g.weightage };
        const { error } = await supabase.from("goals").update(payload).eq("id", g.id);
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: open.id, action: "manager_edit_goals" });
      toast.success("✓ Goal edits saved");
      void load();
      return true;
    } catch (err: any) {
      toast.error(err.message || String(err));
      return false;
    }
  };

  const returnSheet = async () => {
    if (!open) return;
    if (!comments.trim()) return toast.error("Add comments explaining what to change");
    const { error } = await supabase.from("goal_sheets")
      .update({ status: "returned", manager_comments: comments })
      .eq("id", open.id);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: open.id, action: "return" });
    toast.success("✓ Sheet returned to employee for revision");
    setReturnConfirm(false);
    setOpen(null); void load();
  };

  const saveManagerCheckins = async (quarter: string) => {
    if (!open) return;
    try {
      for (const g of goals) {
        const existing = checkins.find((c) => c.goal_id === g.id && c.quarter === quarter);
        const manager_note = (existing?.manager_note) ?? "";
        const payload = { goal_id: g.id, quarter, manager_note };
        if (existing) {
          const { error } = await supabase.from("check_ins").update({ manager_note }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("check_ins").insert(payload);
          if (error) throw error;
        }
      }
      await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "check_ins", action: "manager_checkin" });
      toast.success("Saved manager check-ins");
      void openSheet(open);
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  if (authLoading || loading) return <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Team Goal Sheets</h1>
        <p className="text-muted-foreground text-sm mt-2">Review and approve goal sheets submitted by your direct reports.</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending & Active Sheets ({sheets.length})</CardTitle>
          <CardDescription>
            Submitted sheets require your review and approval. Manage targets, review goals, and provide feedback.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto">
          {sheets.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="size-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No goal sheets assigned to you yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Employees must select you as their manager in the goal sheet form.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((s) => {
                  const p = profiles[s.employee_id];
                  const statusColor = {
                    draft: "bg-slate-100 text-slate-800",
                    submitted: "bg-blue-100 text-blue-800",
                    approved: "bg-green-100 text-green-800",
                    returned: "bg-amber-100 text-amber-800",
                    locked: "bg-red-100 text-red-800",
                  }[s.status] || "bg-gray-100";
                  
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{p?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p?.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">{p?.department || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">FY {s.cycle_year}</TableCell>
                      <TableCell>
                        <Badge className={`capitalize font-medium ${statusColor}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openSheet(s)}>
                          <Eye className="size-4 mr-1" />Review
                        </Button>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {open && profiles[open.employee_id]?.full_name} — FY {open?.cycle_year}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <span>Status:</span>
              <Badge className="capitalize" variant={open?.status === 'approved' ? 'default' : 'secondary'}>
                {open?.status}
              </Badge>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Goals Table */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Goal Details</h3>
              <div className="overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Thrust Area</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Target (UoM)</TableHead>
                      <TableHead>Weight %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goals.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium text-sm">{g.thrust_area}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{g.title}</div>
                          <div className="text-xs text-muted-foreground">{g.description}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {(open?.status === 'submitted' || open?.status === 'returned') && (isManager || isAdmin) ? (
                            <Input 
                              type="number" 
                              className="w-24"
                              value={g.target as any} 
                              onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, target: Number(e.target.value) } : x))} 
                            />
                          ) : (
                            <span>{g.target} {g.uom}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(open?.status === 'submitted' || open?.status === 'returned') && (isManager || isAdmin) ? (
                            <Input 
                              type="number" 
                              className="w-16"
                              value={g.weightage as any} 
                              onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, weightage: Number(e.target.value) } : x))} 
                            />
                          ) : (
                            <span>{g.weightage}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Manager Comments */}
            <div>
              <Label className="font-semibold text-base mb-2 block">Manager Feedback & Comments</Label>
              <Textarea 
                rows={4} 
                value={comments} 
                onChange={(e) => setComments(e.target.value)}
                placeholder={open?.status === 'returned' ? "Explain required changes..." : "Optional feedback for the employee..."} 
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {open?.status === 'returned' ? "Comments are required when returning sheets." : "Share feedback or notes for the employee."}
              </p>
            </div>

            {/* Action Buttons */}
            {(open?.status === "submitted" || open?.status === "returned") && (isManager || isAdmin) ? (
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setReturnConfirm(true)}
                  className="gap-2"
                >
                  <RotateCcw className="size-4" />
                  Return for Revision
                </Button>
                <Button 
                  onClick={() => setApproveConfirm(true)}
                  className="gap-2"
                >
                  <CheckCircle2 className="size-4" />
                  Approve Sheet
                </Button>
              </div>
            ) : null}

            {open?.status === "submitted" && (isManager || isAdmin) && (
              <Button 
                variant="secondary" 
                className="w-full" 
                onClick={saveGoals}
              >
                Save Goal Edits (if modified)
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation */}
      <AlertDialog open={approveConfirm} onOpenChange={setApproveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Goal Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the goal sheet as approved and lock it for editing. The employee will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approve} className="bg-green-600 hover:bg-green-700">
              Approve
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return Confirmation */}
      <AlertDialog open={returnConfirm} onOpenChange={setReturnConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Sheet for Revision?</AlertDialogTitle>
            <AlertDialogDescription>
              The employee will need to revise and resubmit. Make sure to include specific feedback above.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={returnSheet} className="bg-amber-600 hover:bg-amber-700">
              Return Sheet
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
