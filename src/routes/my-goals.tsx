import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Send, Save, Lock } from "lucide-react";
import { toast } from "sonner";
import { computeScore, type UomType, CURRENT_QUARTER_WINDOWS } from "@/lib/scoring";

export const Route = createFileRoute("/my-goals")({ component: MyGoalsPage });

type SheetStatus = "draft" | "submitted" | "approved" | "returned" | "locked";

interface Sheet { id: string; employee_id: string; manager_id: string | null; cycle_year: number; status: SheetStatus; manager_comments: string; }
interface Goal {
  id: string; sheet_id: string;
  thrust_area: string; title: string; description: string;
  uom: string; uom_type: UomType; target: number; weightage: number; sort_order: number; is_shared: boolean;
}
interface CheckIn { id: string; goal_id: string; quarter: string; actual_value: number | null; employee_note: string; manager_note: string; score: number | null; }
interface Manager { id: string; full_name: string; email: string; }

const CYCLE = new Date().getFullYear();
const QUARTERS = ["Q1", "Q2", "Q3", "Q4", "YEAR_END"] as const;

function MyGoalsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate({ to: "/login" }); }, [authLoading, user, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: mgrs } = await supabase.from("profiles").select("id,full_name,email").neq("id", user.id);
    setManagers((mgrs ?? []) as Manager[]);
    const { data: s } = await supabase.from("goal_sheets").select("*").eq("employee_id", user.id).eq("cycle_year", CYCLE).maybeSingle();
    setSheet((s as Sheet) ?? null);
    if (s) {
      const { data: g } = await supabase.from("goals").select("*").eq("sheet_id", s.id).order("sort_order");
      setGoals((g ?? []) as Goal[]);
      const goalIds = (g ?? []).map((x) => x.id);
      if (goalIds.length) {
        const { data: c } = await supabase.from("check_ins").select("*").in("goal_id", goalIds);
        setCheckins((c ?? []) as CheckIn[]);
      } else setCheckins([]);
    } else { setGoals([]); setCheckins([]); }
    setLoading(false);
  };

  useEffect(() => { if (user) void load(); /* eslint-disable-next-line */ }, [user?.id]);

  const totalWeight = useMemo(() => goals.reduce((a, g) => a + (Number(g.weightage) || 0), 0), [goals]);
  const editable = !sheet || sheet.status === "draft" || sheet.status === "returned";

  const createSheet = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase.from("goal_sheets")
      .insert({ employee_id: user.id, cycle_year: CYCLE, status: "draft" })
      .select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    setSheet(data as Sheet);
    await supabase.from("audit_log").insert({ actor_id: user.id, entity: "goal_sheet", entity_id: data.id, action: "create" });
    toast.success("Goal sheet created");
  };

  const setManager = async (mid: string) => {
    if (!sheet) return;
    const { error } = await supabase.from("goal_sheets").update({ manager_id: mid }).eq("id", sheet.id);
    if (error) return toast.error(error.message);
    setSheet({ ...sheet, manager_id: mid });
  };

  const addGoal = () => {
    if (!sheet) return;
    if (goals.length >= 8) return toast.error("Max 8 goals allowed");
    const newGoal: Goal = {
      id: `temp-${Date.now()}`, sheet_id: sheet.id,
      thrust_area: "", title: "", description: "", uom: "Number",
      uom_type: "higher_better", target: 0, weightage: 0, sort_order: goals.length, is_shared: false,
    };
    setGoals([...goals, newGoal]);
  };

  const updateGoal = (id: string, patch: Partial<Goal>) => {
    setGoals(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const removeGoal = async (id: string) => {
    if (!id.startsWith("temp-")) {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) return toast.error(error.message);
    }
    setGoals(goals.filter((g) => g.id !== id));
  };

  const saveDraft = async () => {
    if (!sheet) return;
    setSaving(true);
    for (const g of goals) {
      const payload = {
        sheet_id: sheet.id, thrust_area: g.thrust_area, title: g.title, description: g.description,
        uom: g.uom, uom_type: g.uom_type, target: Number(g.target) || 0, weightage: Number(g.weightage) || 0,
        sort_order: g.sort_order, is_shared: g.is_shared,
      };
      if (g.id.startsWith("temp-")) {
        const { data, error } = await supabase.from("goals").insert(payload).select().single();
        if (error) { setSaving(false); return toast.error(error.message); }
        g.id = (data as Goal).id;
      } else {
        const { error } = await supabase.from("goals").update(payload).eq("id", g.id);
        if (error) { setSaving(false); return toast.error(error.message); }
      }
    }
    setSaving(false);
    toast.success("Draft saved");
    void load();
  };

  const validateForSubmit = (): string | null => {
    if (goals.length === 0) return "Add at least one goal";
    if (goals.length > 8) return "Max 8 goals allowed";
    for (const g of goals) {
      if (!g.thrust_area.trim() || !g.title.trim() || !g.uom.trim()) return "All goals need Thrust Area, Title, and UoM";
      if (g.weightage < 10) return "Each goal must have weightage ≥ 10%";
      if (g.target <= 0 && g.uom_type !== "binary") return "Target must be > 0";
    }
    const total = goals.reduce((a, g) => a + Number(g.weightage), 0);
    if (Math.round(total) !== 100) return `Total weightage must be 100% (currently ${total}%)`;
    if (!sheet?.manager_id) return "Select your reporting manager";
    return null;
  };

  const submitForApproval = async () => {
    const err = validateForSubmit();
    if (err) return toast.error(err);
    await saveDraft();
    const { error } = await supabase.from("goal_sheets")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", sheet!.id);
    if (error) return toast.error(error.message);
    await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "goal_sheet", entity_id: sheet!.id, action: "submit" });
    toast.success("Submitted for manager approval");
    void load();
  };

  const upsertCheckin = async (goalId: string, quarter: string, patch: Partial<CheckIn>) => {
    const existing = checkins.find((c) => c.goal_id === goalId && c.quarter === quarter);
    const goal = goals.find((g) => g.id === goalId)!;
    const actual = patch.actual_value ?? existing?.actual_value ?? null;
    const score = computeScore(goal.uom_type, goal.target, actual);
    const row = {
      goal_id: goalId, quarter,
      actual_value: actual,
      employee_note: patch.employee_note ?? existing?.employee_note ?? "",
      manager_note: existing?.manager_note ?? "",
      score,
    };
    if (existing) {
      const { error } = await supabase.from("check_ins").update(row).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("check_ins").insert(row);
      if (error) return toast.error(error.message);
    }
    void load();
  };

  if (authLoading || loading) return <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">My Goal Sheet — FY {CYCLE}</h1>
          <p className="text-muted-foreground text-sm">Define your annual KPIs and log quarterly progress.</p>
        </div>
        {sheet && <StatusBadge status={sheet.status} />}
      </div>

      {!sheet ? (
        <Card>
          <CardHeader>
            <CardTitle>No goal sheet yet</CardTitle>
            <CardDescription>Create your goal sheet for FY {CYCLE} to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={createSheet} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Create goal sheet</Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="goals">
          <TabsList>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          </TabsList>
          <TabsContent value="goals" className="space-y-4">
            {sheet.status === "returned" && sheet.manager_comments && (
              <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
                <CardHeader>
                  <CardTitle className="text-base">Returned by your manager</CardTitle>
                  <CardDescription className="text-foreground/80 whitespace-pre-wrap">{sheet.manager_comments}</CardDescription>
                </CardHeader>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reporting manager</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={sheet.manager_id ?? ""} onValueChange={setManager} disabled={!editable}>
                  <SelectTrigger className="max-w-md"><SelectValue placeholder="Select your manager" /></SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email} — {m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Goals ({goals.length}/8)</CardTitle>
                  <CardDescription>Total weightage: <span className={totalWeight === 100 ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>{totalWeight}%</span> — must equal 100%</CardDescription>
                </div>
                {editable && <Button size="sm" variant="outline" onClick={addGoal}><Plus className="size-4" />Add goal</Button>}
              </CardHeader>
              <CardContent>
                {goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No goals yet. Click "Add goal".</p>
                ) : (
                  <div className="space-y-4">
                    {goals.map((g, idx) => (
                      <div key={g.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-muted-foreground">Goal {idx + 1}</div>
                          {editable && (
                            <Button size="sm" variant="ghost" onClick={() => removeGoal(g.id)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Thrust Area</Label>
                            <Input value={g.thrust_area} onChange={(e) => updateGoal(g.id, { thrust_area: e.target.value })} disabled={!editable} placeholder="e.g. Customer Success" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Title</Label>
                            <Input value={g.title} onChange={(e) => updateGoal(g.id, { title: e.target.value })} disabled={!editable} placeholder="e.g. Reduce response time" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Description</Label>
                          <Textarea rows={2} value={g.description} onChange={(e) => updateGoal(g.id, { description: e.target.value })} disabled={!editable} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="space-y-1.5">
                            <Label>UoM</Label>
                            <Input value={g.uom} onChange={(e) => updateGoal(g.id, { uom: e.target.value })} disabled={!editable} placeholder="hours, %, #, ₹" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>UoM Type</Label>
                            <Select value={g.uom_type} onValueChange={(v) => updateGoal(g.id, { uom_type: v as UomType })} disabled={!editable}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="higher_better">Higher is better</SelectItem>
                                <SelectItem value="lower_better">Lower is better</SelectItem>
                                <SelectItem value="binary">Binary (Done/Not)</SelectItem>
                                <SelectItem value="milestone">Milestone</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Target</Label>
                            <Input type="number" value={g.target} onChange={(e) => updateGoal(g.id, { target: Number(e.target.value) })} disabled={!editable} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Weightage (%)</Label>
                            <Input type="number" min={0} max={100} value={g.weightage} onChange={(e) => updateGoal(g.id, { weightage: Number(e.target.value) })} disabled={!editable} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {editable && (
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={saveDraft} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save draft
                </Button>
                <Button onClick={submitForApproval} disabled={saving}>
                  <Send className="size-4" />Submit for approval
                </Button>
              </div>
            )}
            {sheet.status === "approved" && (
              <Card className="border-green-500/40 bg-green-50/40 dark:bg-green-950/20">
                <CardContent className="pt-6 flex items-center gap-2 text-sm">
                  <Lock className="size-4" /> Sheet approved and locked. Use the Check-ins tab to log actuals each quarter.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="checkins">
            {sheet.status !== "approved" && sheet.status !== "submitted" ? (
              <Card><CardContent className="py-6 text-sm text-muted-foreground">Check-ins open after your manager approves the goal sheet.</CardContent></Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quarterly progress</CardTitle>
                  <CardDescription>Enter actual values per quarter. Score is auto-computed.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Goal</TableHead>
                        <TableHead>Target</TableHead>
                        {QUARTERS.map((q) => <TableHead key={q}>{CURRENT_QUARTER_WINDOWS[q].label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {goals.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="max-w-[240px]">
                            <div className="font-medium">{g.title}</div>
                            <div className="text-xs text-muted-foreground">{g.thrust_area} · {g.weightage}%</div>
                          </TableCell>
                          <TableCell className="text-sm">{g.target} {g.uom}</TableCell>
                          {QUARTERS.map((q) => {
                            const ci = checkins.find((c) => c.goal_id === g.id && c.quarter === q);
                            return (
                              <TableCell key={q}>
                                <Input
                                  type="number" className="h-8 w-24"
                                  defaultValue={ci?.actual_value ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== (ci?.actual_value ?? null)) void upsertCheckin(g.id, q, { actual_value: v });
                                  }}
                                />
                                {ci?.score != null && <div className="text-xs mt-1 text-muted-foreground">Score: {ci.score.toFixed(0)}%</div>}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SheetStatus }) {
  const variant: Record<SheetStatus, "default" | "secondary" | "outline" | "destructive"> = {
    draft: "outline", submitted: "secondary", approved: "default", returned: "destructive", locked: "default",
  };
  return <Badge variant={variant[status]} className="capitalize">{status}</Badge>;
}
