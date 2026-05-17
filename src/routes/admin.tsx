import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/admin")({ component: AdminPage });

interface Profile { id: string; full_name: string; email: string; department: string | null; }
interface Role { id: string; user_id: string; role: "admin" | "manager" | "employee"; }
interface Sheet { id: string; employee_id: string; cycle_year: number; status: string; submitted_at: string | null; approved_at: string | null; }
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
  };

  useEffect(() => { if (user && isAdmin) void load(); /* eslint-disable-next-line */ }, [user?.id, isAdmin]);

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

  const userRoles = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);

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
        <Button onClick={exportSheets}><Download className="size-4" />Export CSV</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Employees" value={profiles.length} />
        <StatCard label="Draft sheets" value={draftCount} />
        <StatCard label="Awaiting approval" value={submittedCount} />
        <StatCard label="Approved" value={approvedCount} />
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
              <CardDescription>Grant Manager or Admin roles. Everyone is an Employee by default.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const rs = userRoles(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="text-sm">{p.email}</TableCell>
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
                  })}
                </TableBody>
              </Table>
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
      <Select value="">{/* keeps Select import used */}
        <SelectTrigger className="hidden"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="x">x</SelectItem></SelectContent>
      </Select>
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
