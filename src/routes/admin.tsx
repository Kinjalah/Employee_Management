import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { toCSV, downloadCSV } from "@/lib/csv";
import { getActiveQuarter } from "@/lib/scoring";

export const Route = createFileRoute("/admin")({ component: AdminPage });

interface Profile { id: string; full_name: string; email: string; department: string | null; }
interface Role { id: string; user_id: string; role: "admin" | "manager" | "employee"; }
interface Sheet { id: string; employee_id: string; cycle_year: number; status: string; submitted_at: string | null; approved_at: string | null; manager_id?: string | null; }
interface Goal { id: string; sheet_id: string; title: string; thrust_area: string; uom: string; target: number; weightage: number; }
interface CheckIn { id: string; goal_id: string; quarter: string; actual_value: number | null; score: number | null; }
interface Audit { id: string; actor_id: string | null; entity: string; entity_id: string | null; action: string; created_at: string; }

function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedThrust, setSharedThrust] = useState("");
  const [sharedTitle, setSharedTitle] = useState("");
  const [sharedDesc, setSharedDesc] = useState("");
  const [sharedUom, setSharedUom] = useState("");
  const [sharedUomType, setSharedUomType] = useState("higher_better");
  const [sharedTarget, setSharedTarget] = useState<number | null>(null);
  const [sharedWeight, setSharedWeight] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [filterCycle, setFilterCycle] = useState<number | null>(null);
  const [filterManager, setFilterManager] = useState<string | null>(null);
  const [completionPercent, setCompletionPercent] = useState<number>(0);
  const [incompleteSheets, setIncompleteSheets] = useState<Sheet[]>([]);
  const [showOnboard, setShowOnboard] = useState<boolean>(() => typeof window !== 'undefined' ? localStorage.getItem('onboard_admin_shown') !== '1' : true);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userPage, setUserPage] = useState<number>(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
    else if (!authLoading && user && !isAdmin) { toast.error("Admin only"); navigate({ to: "/" }); }
  }, [authLoading, user, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: s }, { data: g }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("*"),
      supabase.from("goal_sheets").select("*"),
      supabase.from("goals").select("*"),
      supabase.from("check_ins").select("*"),
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setProfiles((p ?? []) as Profile[]);
    setRoles((r ?? []) as Role[]);
    setSheets((s ?? []) as Sheet[]);
    setGoals((g ?? []) as Goal[]);
    setCheckins((c ?? []) as CheckIn[]);
    setAudit((a ?? []) as Audit[]);
    setLoading(false);
    // compute completion for active quarter
    const active = getActiveQuarter();
    if (active) {
      // apply admin filters when computing completion
      const filteredSheets = (s ?? []).filter((sh: any) => (filterCycle ? sh.cycle_year === filterCycle : true) && (filterManager ? sh.manager_id === filterManager : true));
      const sheetIds = filteredSheets.map((x: any) => x.id);
      const goalsBySheet = (g ?? []).reduce((acc: Record<string, any[]>, cur: any) => { acc[cur.sheet_id] = acc[cur.sheet_id] ?? []; acc[cur.sheet_id].push(cur); return acc; }, {} as Record<string, any[]>);
      let completed = 0;
      const incomplete: Sheet[] = [];
      for (const sid of sheetIds) {
        const sheetGoals = goalsBySheet[sid] ?? [];
        if (sheetGoals.length === 0) continue;
        const allHave = sheetGoals.every((gg) => (c ?? []).some((ci: any) => ci.goal_id === gg.id && ci.quarter === active && ci.actual_value != null));
        if (allHave) completed++;
        else {
          const sh = filteredSheets.find((fs: any) => fs.id === sid);
          if (sh) incomplete.push(sh as Sheet);
        }
      }
      setCompletionPercent(Math.round((completed / Math.max(1, sheetIds.length)) * 100));
      setIncompleteSheets(incomplete);
    }
  };

  useEffect(() => { if (user && isAdmin) void load(); /* eslint-disable-next-line */ }, [user?.id, isAdmin, filterCycle, filterManager]);

  const grantRole = async (uid: string, role: "admin" | "manager") => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) return toast.error(error.message);
    toast.success(`Granted ${role}`);
    void load();
  };
  const revokeRole = async (uid: string, role: "admin" | "manager") => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) return toast.error(error.message);
    toast.success(`Revoked ${role}`);
    void load();
  };

  const makeMeAdmin = async () => {
    if (!user) return toast.error('Sign in first');
    try {
      const { error } = await supabase.from('user_roles').insert({ user_id: user.id, role: 'admin' });
      if (error) throw error;
      toast.success('You are now an admin (dev)');
      void load();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const seedDemoProfiles = async () => {
    if (!confirm('Seed demo profiles and roles (dev-only)? This will insert demo rows). Continue?')) return;
    try {
      const demo = [
        { id: crypto.randomUUID(), email: 'admin.demo@example.com', full_name: 'Demo Admin', department: 'People Ops', designation: 'Head', manager_id: null },
        { id: crypto.randomUUID(), email: 'mgr.demo@example.com', full_name: 'Demo Manager', department: 'Engineering', designation: 'Manager', manager_id: null },
        { id: crypto.randomUUID(), email: 'emp.demo@example.com', full_name: 'Demo Employee', department: 'Engineering', designation: 'Engineer', manager_id: null },
      ];
      // upsert profiles by email
      const { error: e1 } = await supabase.from('profiles').upsert(demo, { onConflict: 'email' });
      if (e1) throw e1;
      // map roles: first is admin, second is manager
      const { data: ps } = await supabase.from('profiles').select('id,email').in('email', demo.map(d => d.email));
      const byEmail = Object.fromEntries((ps ?? []).map((p: any) => [p.email, p.id]));
      const rolesPayload = [
        { user_id: byEmail['admin.demo@example.com'], role: 'admin' },
        { user_id: byEmail['mgr.demo@example.com'], role: 'manager' },
      ];
      const { error: e2 } = await supabase.from('user_roles').upsert(rolesPayload, { onConflict: ['user_id','role'] });
      if (e2) throw e2;
      // assign employee manager
      const { error: e3 } = await supabase.from('profiles').update({ manager_id: byEmail['mgr.demo@example.com'] }).eq('email', 'emp.demo@example.com');
      if (e3) throw e3;
      toast.success('Demo profiles seeded (profiles + roles). Note: Auth users are not created — use Supabase Auth dashboard to create credentials if needed.');
      void load();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const userRoles = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);

  const setManagerFor = async (uid: string, managerId: string | null) => {
    try {
      const { error } = await supabase.from('profiles').update({ manager_id: managerId }).eq('id', uid);
      if (error) throw error;
      toast.success('Manager updated');
      void load();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const exportSheets = () => {
    const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));
    const rows: Record<string, unknown>[] = [];
    sheets.forEach((s) => {
      const emp = profById[s.employee_id];
      const sheetGoals = goals.filter((g) => g.sheet_id === s.id);
      sheetGoals.forEach((g) => {
        const cis = checkins.filter((c) => c.goal_id === g.id);
        const q: Record<string, number | string> = {};
        cis.forEach((c) => {
          q[`${c.quarter}_actual`] = c.actual_value ?? "";
          q[`${c.quarter}_score`] = c.score?.toFixed(1) ?? "";
        });
        rows.push({
          employee: emp?.full_name, email: emp?.email, department: emp?.department,
          cycle: s.cycle_year, status: s.status,
          thrust_area: g.thrust_area, goal: g.title, uom: g.uom,
          target: g.target, weightage: g.weightage,
          ...q,
        });
      });
    });
    if (rows.length === 0) return toast.error("Nothing to export");
    downloadCSV(`goal-sheets-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    void goalById;
  };

  const adminUnlockSheet = async (sheetId: string) => {
    if (!user) return toast.error('Sign in first');
    try {
      const { error } = await supabase.rpc('unlock_goal_sheet', { _sheet_id: sheetId, _actor_id: user.id });
      if (error) throw error;
      toast.success('Sheet unlocked and set to draft');
      void load();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const exportFullReport = async () => {
    try {
      const params: Record<string, unknown> = { _cycle: filterCycle ?? null, _manager_id: filterManager ?? null };
      const { data, error } = await supabase.rpc('report_goal_sheets_filtered', params);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) return toast.error('No data');
      downloadCSV(`full-goal-report-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows.map((r: any) => ({
        employee: r.employee_name,
        email: r.email,
        department: r.department,
        cycle: r.cycle_year,
        status: r.sheet_status,
        thrust_area: r.thrust_area,
        goal: r.goal_title,
        uom: r.uom,
        target: r.target,
        weightage: r.weightage,
        quarter: r.quarter,
        actual: r.actual_value,
        score: r.score,
        employee_note: r.employee_note,
        manager_note: r.manager_note,
      }))));
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const exportIncomplete = () => {
    if (!incompleteSheets || incompleteSheets.length === 0) return toast.error('No incomplete sheets');
    const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const rows: Record<string, unknown>[] = [];
    const active = getActiveQuarter();
    incompleteSheets.forEach((s) => {
      const emp = profById[s.employee_id];
      const sheetGoals = goals.filter((g) => g.sheet_id === s.id);
      const missing = sheetGoals.filter((g) => !(checkins.some((ci) => ci.goal_id === g.id && ci.quarter === active && ci.actual_value != null)));
      rows.push({ employee: emp?.full_name, email: emp?.email, department: emp?.department, cycle: s.cycle_year, missing_count: missing.length, missing_goals: missing.map((m) => m.title).join(' | ') });
    });
    downloadCSV(`incomplete-sheets-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
  };

  const toggleSelect = (id: string) => setSelectedIds((s) => ({ ...s, [id]: !s[id] }));

  const publishSharedGoal = async () => {
    const targets = Object.keys(selectedIds).filter((k) => selectedIds[k]);
    if (targets.length === 0) return toast.error("Select at least one recipient");
    if (!sharedTitle.trim() || !sharedThrust.trim() || !sharedUom.trim() || !sharedTarget) return toast.error("Complete goal details");
    try {
      let masterGoalId: string | null = null;
      for (const uid of targets) {
        const { data: s } = await supabase.from("goal_sheets").select("*").eq("employee_id", uid).eq("cycle_year", new Date().getFullYear()).maybeSingle();
        let sheetId = s?.id;
        if (!sheetId) {
          const { data: newS, error: se } = await supabase.from("goal_sheets").insert({ employee_id: uid, cycle_year: new Date().getFullYear(), status: 'draft' }).select().single();
          if (se) throw se;
          sheetId = newS.id;
        }
        const payload: any = {
          sheet_id: sheetId,
          thrust_area: sharedThrust,
          title: sharedTitle,
          description: sharedDesc,
          uom: sharedUom,
          uom_type: sharedUomType,
          target: sharedTarget,
          weightage: sharedWeight || 0,
          is_shared: true,
        };
        if (!masterGoalId) {
          const { data: g, error: ge } = await supabase.from("goals").insert(payload).select().single();
          if (ge) throw ge;
          masterGoalId = (g as any).id;
        } else {
          payload.source_goal_id = masterGoalId;
          const { error: ge } = await supabase.from("goals").insert(payload);
          if (ge) throw ge;
        }
      }
      await supabase.from("audit_log").insert({ actor_id: user!.id, entity: "shared_goal", action: "publish", payload: { title: sharedTitle, recipients: Object.keys(selectedIds).filter((k) => selectedIds[k]) } });
      toast.success("Shared goal published");
      setSharedOpen(false);
      void load();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  if (authLoading || loading) return <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>;

  const submittedCount = sheets.filter((s) => s.status === "submitted").length;
  const approvedCount = sheets.filter((s) => s.status === "approved").length;
  const draftCount = sheets.filter((s) => s.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Admin Console</h1>
          <p className="text-muted-foreground text-sm">Org-wide goals, roles, and audit trail.</p>
        </div>
        {showOnboard && (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? (
          <div className="ml-4 p-3 rounded border bg-muted text-sm max-w-md">
            <div className="font-medium">Local setup tips</div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              <li>Sign up via Supabase Auth to create a profile (or run seed below).</li>
              <li>Use "Make me admin (dev)" to add admin role to your user on localhost.</li>
              <li>Use "Seed demo data" to populate example profiles and roles (dev-only).</li>
            </ul>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="ghost" onClick={() => { setShowOnboard(false); localStorage.setItem('onboard_admin_shown', '1'); }}>Dismiss</Button>
              <Button size="sm" variant="outline" onClick={seedDemoProfiles}>Seed demo data</Button>
            </div>
          </div>
        ) : null}
        <div className="flex gap-2 items-center">
          <select className="input" value={filterCycle ?? ""} onChange={(e) => setFilterCycle(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">All cycles</option>
            {Array.from(new Set(sheets.map((s) => s.cycle_year))).map((y) => (
              <option key={y} value={String(y)}>FY {y}</option>
            ))}
          </select>
          <select className="input" value={filterManager ?? ""} onChange={(e) => setFilterManager(e.target.value === "" ? null : e.target.value)}>
            <option value="">All managers</option>
            {profiles.filter((p) => roles.some((r) => r.user_id === p.id && r.role === 'manager')).map((m) => (
              <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
            ))}
          </select>
          <Button onClick={exportSheets}><Download className="size-4" />Export CSV</Button>
          <Button onClick={exportFullReport} variant="outline"><Download className="size-4" />Export full report</Button>
          <Button onClick={exportIncomplete} variant="outline"><Download className="size-4" />Export incomplete</Button>
          <Button onClick={() => setSharedOpen(true)} variant="outline"><ShieldPlus className="size-4" />Publish shared goal</Button>
          {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && user && !isAdmin ? (
            <Button size="sm" variant="ghost" onClick={makeMeAdmin}>Make me admin (dev)</Button>
          ) : null}
          {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
            <Button size="sm" variant="ghost" onClick={seedDemoProfiles}>Seed demo data</Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Employees" value={profiles.length} />
        <StatCard label="Draft sheets" value={draftCount} />
        <StatCard label="Awaiting approval" value={submittedCount} />
        <StatCard label="Approved" value={approvedCount} />
        <StatCard label="Quarter completion %" value={completionPercent} />
      </div>

      <Tabs defaultValue="sheets">
        <TabsList>
          <TabsTrigger value="sheets">Goal Sheets</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="sheets">
          <Card>
            <CardHeader><CardTitle className="text-base">All goal sheets</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <div className="flex items-center gap-2 mb-3">
                <input placeholder="Search users by name or email" className="input" value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(0); }} />
                <div className="text-sm text-muted-foreground">Showing {profiles.length} users</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Goals</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheets.map((s) => {
                    const emp = profiles.find((p) => p.id === s.employee_id);
                    const count = goals.filter((g) => g.sheet_id === s.id).length;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{emp?.full_name}</div>
                          <div className="text-xs text-muted-foreground">{emp?.email}</div>
                        </TableCell>
                        <TableCell className="text-sm">{emp?.department || "—"}</TableCell>
                        <TableCell className="text-sm">FY {s.cycle_year}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                        <TableCell className="text-sm">{count}</TableCell>
                        <TableCell className="text-sm">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          {s.status === 'locked' && isAdmin ? (
                            <Button size="sm" variant="destructive" onClick={() => adminUnlockSheet(s.id)}>Unlock</Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
                <CardHeader>
                  <CardTitle className="text-base">Users</CardTitle>
                  <CardDescription>Grant Manager or Admin roles. Everyone is an Employee by default. Use the Manager dropdown to assign reporting managers. If you don't see users, ensure Supabase Auth has created `profiles` (see README seed instructions). For local testing you can use the "Make me admin (dev)" button in the header.</CardDescription>
                </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const q = userSearch.trim().toLowerCase();
                    const filtered = profiles.filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
                    const pageSize = 10;
                    const pageCount = Math.ceil(filtered.length / pageSize) || 1;
                    const page = Math.min(Math.max(0, userPage), pageCount - 1);
                    const pageItems = filtered.slice(page * pageSize, page * pageSize + pageSize);
                    return pageItems.map((p) => {
                    const rs = userRoles(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="text-sm">{p.email}</TableCell>
                        <TableCell className="text-sm">
                          <select className="input" value={(p as any).manager_id ?? ""} onChange={(e) => setManagerFor(p.id, e.target.value === "" ? null : e.target.value)}>
                            <option value="">— none —</option>
                            {profiles.map((m) => (
                              <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="space-x-1">
                          {rs.length === 0 ? <Badge variant="outline">employee</Badge> : rs.map((r) => (
                            <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
                          ))}
                        </TableCell>
                        <TableCell className="space-x-2">
                          {!rs.includes("manager") ? (
                            <Button size="sm" variant="outline" onClick={() => grantRole(p.id, "manager")}><ShieldPlus className="size-3" />Manager</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => revokeRole(p.id, "manager")}><ShieldOff className="size-3" />Revoke Mgr</Button>
                          )}
                          {!rs.includes("admin") ? (
                            <Button size="sm" variant="outline" onClick={() => grantRole(p.id, "admin")}><ShieldCheck className="size-3" />Admin</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => revokeRole(p.id, "admin")}><ShieldOff className="size-3" />Revoke Adm</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                    });
                  })()}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-3">
                <div className="text-sm">Page {userPage + 1} of {Math.max(1, Math.ceil(Math.max(1, profiles.filter((p) => { const q=userSearch.trim().toLowerCase(); return !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q); }).length)/10))}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setUserPage((p) => Math.max(0, p - 1))}>Prev</Button>
                  <Button size="sm" variant="outline" onClick={() => setUserPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader><CardTitle className="text-base">Audit log (latest 200)</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.map((a) => {
                    const actor = profiles.find((p) => p.id === a.actor_id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{new Date(a.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{actor?.full_name || a.actor_id?.slice(0, 8) || "system"}</TableCell>
                        <TableCell className="text-sm">{a.entity}</TableCell>
                        <TableCell className="text-sm capitalize">{a.action}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {audit.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No events yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={sharedOpen} onOpenChange={(o) => setSharedOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Publish shared goal</DialogTitle>
            <DialogDescription>Push a departmental KPI to multiple employees. Recipients can only adjust weightage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label>Thrust area</Label>
                <input className="input w-full" value={sharedThrust} onChange={(e) => setSharedThrust(e.target.value)} />
              </div>
              <div>
                <Label>Title</Label>
                <input className="input w-full" value={sharedTitle} onChange={(e) => setSharedTitle(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <textarea className="textarea w-full" value={sharedDesc} onChange={(e) => setSharedDesc(e.target.value)} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <Label>UoM</Label>
                <input className="input w-full" value={sharedUom} onChange={(e) => setSharedUom(e.target.value)} />
              </div>
              <div>
                <Label>UoM type</Label>
                <select className="input w-full" value={sharedUomType} onChange={(e) => setSharedUomType(e.target.value)}>
                  <option value="higher_better">Higher is better</option>
                  <option value="lower_better">Lower is better</option>
                  <option value="binary">Binary</option>
                  <option value="milestone">Milestone</option>
                </select>
              </div>
              <div>
                <Label>Target</Label>
                <input className="input w-full" type="number" value={sharedTarget ?? ""} onChange={(e) => setSharedTarget(e.target.value === "" ? null : Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Default weightage (%)</Label>
              <input className="input w-24" type="number" value={sharedWeight} onChange={(e) => setSharedWeight(Number(e.target.value))} />
            </div>

            <div>
              <Label>Recipients</Label>
              <div className="grid gap-2 max-h-56 overflow-auto">
                {profiles.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={!!selectedIds[p.id]} onChange={() => toggleSelect(p.id)} />
                    <span className="text-sm">{p.full_name} — {p.email}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSharedOpen(false)}>Cancel</Button>
              <Button onClick={publishSharedGoal}>Publish</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}
