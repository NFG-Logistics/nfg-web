"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Loader2, Shield, UserCog, Truck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { User as UserType, UserRole } from "@/types";

const ROLE_CONFIG: Record<UserRole, { label: string; icon: typeof Shield; variant: "default" | "secondary" | "info" | "warning" | "success" }> = {
  admin: { label: "Admin", icon: Shield, variant: "default" },
  dispatcher: { label: "Dispatcher", icon: UserCog, variant: "info" },
  driver: { label: "Driver", icon: Truck, variant: "warning" },
};

export default function UsersPage() {
  const supabase = createClient();
  const { user: currentUser, loading: userLoading } = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("driver");

  useEffect(() => {
    if (!userLoading && currentUser?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
  }, [currentUser, userLoading]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from("users").select("*").order("full_name");
      if (error) console.error("Failed to fetch users:", error);
      setUsers(data || []);
    } catch (err) {
      console.error("Users fetch exception:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser?.role === "admin") fetchUsers(); }, [currentUser]);

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    if (editUser) {
      // Update existing user
      const { error } = await supabase
        .from("users")
        .update({
          full_name: fd.get("full_name") as string,
          email: fd.get("email") as string,
          phone: fd.get("phone") as string || null,
          role: selectedRole,
          is_active: fd.get("is_active") === "true",
        })
        .eq("id", editUser.id);

      if (error) { toast.error(error.message); } else { toast.success("User updated"); }
    } else {
      // Create new user via Supabase Auth signUp, then add to users table
      const email = fd.get("email") as string;
      const password = fd.get("password") as string;
      const fullName = fd.get("full_name") as string;
      const phone = fd.get("phone") as string || null;

      // Use signUp (works with anon key, unlike admin.createUser which needs service role)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (authError) {
        toast.error(authError.message);
        setSubmitting(false);
        return;
      }

      if (!authData.user) {
        toast.error("Failed to create auth account");
        setSubmitting(false);
        return;
      }

      // Insert profile row in users table
      const { error } = await supabase.from("users").insert({
        id: authData.user.id,
        company_id: currentUser?.company_id,
        full_name: fullName,
        email,
        phone,
        role: selectedRole,
        is_active: true,
      });

      if (error) { toast.error(error.message); } else { toast.success("User created successfully"); }
    }

    setDialogOpen(false);
    setEditUser(null);
    setSubmitting(false);
    fetchUsers();
  };

  const handleToggleActive = async (u: UserType) => {
    const { error } = await supabase.from("users").update({ is_active: !u.is_active }).eq("id", u.id);
    if (error) toast.error(error.message); else { toast.success(`User ${u.is_active ? "deactivated" : "activated"}`); fetchUsers(); }
  };

  const handleDelete = async (u: UserType) => {
    if (u.id === currentUser?.id) { toast.error("Cannot delete yourself"); return; }
    if (!confirm(`Delete user ${u.full_name}?`)) return;
    const { error } = await supabase.from("users").delete().eq("id", u.id);
    if (error) toast.error(error.message); else { toast.success("User deleted"); fetchUsers(); }
  };

  const openEdit = (u: UserType) => { setEditUser(u); setSelectedRole(u.role); setDialogOpen(true); };
  const openCreate = () => { setEditUser(null); setSelectedRole("driver"); setDialogOpen(true); };

  if (userLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const counts = { admin: users.filter((u) => u.role === "admin").length, dispatcher: users.filter((u) => u.role === "dispatcher").length, driver: users.filter((u) => u.role === "driver").length };

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description={`${users.length} users · ${counts.admin} admins · ${counts.dispatcher} dispatchers · ${counts.driver} drivers`}>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add User</Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="dispatcher">Dispatcher</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No users found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const initials = u.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                  const roleCfg = ROLE_CONFIG[u.role];
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || "—"}</TableCell>
                      <TableCell><Badge variant={roleCfg.variant}>{roleCfg.label}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? "success" : "secondary"} className="cursor-pointer" onClick={() => handleToggleActive(u)}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(u.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                          {u.id !== currentUser?.id && (
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(u)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Create New User"}</DialogTitle>
            <DialogDescription>{editUser ? "Update user profile and role." : "Add a new user to the system."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Full Name *</Label><Input name="full_name" defaultValue={editUser?.full_name || ""} required /></div>
              <div className="space-y-2"><Label>Email *</Label><Input name="email" type="email" defaultValue={editUser?.email || ""} required /></div>
              {!editUser && <div className="space-y-2"><Label>Password *</Label><Input name="password" type="password" required minLength={6} /></div>}
              <div className="space-y-2"><Label>Phone</Label><Input name="phone" defaultValue={editUser?.phone || ""} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editUser && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select name="is_active" defaultValue={editUser.is_active ? "true" : "false"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editUser ? "Update" : "Create"} User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
