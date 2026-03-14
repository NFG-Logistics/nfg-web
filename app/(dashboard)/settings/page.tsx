"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Shield,
  UserCog,
  Truck,
  User,
  Settings as SettingsIcon,
  Bell,
  FileText,
  Wrench,
  Send,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { User as UserType, UserRole } from "@/types";

const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    icon: typeof Shield;
    variant: "default" | "secondary" | "info" | "warning" | "success";
  }
> = {
  admin: { label: "Admin", icon: Shield, variant: "default" },
  dispatcher: { label: "Dispatcher", icon: UserCog, variant: "info" },
  driver: { label: "Driver", icon: Truck, variant: "warning" },
};

// ─── Types for system preferences ──────────────────────────────────────────

interface DispatchSettings {
  require_driver_acceptance: boolean;
  default_load_status: string;
  auto_set_driver_unavailable: boolean;
}

interface NotificationSettings {
  enable_push_notifications: boolean;
  enable_in_app_notifications: boolean;
  dispatch_notification_template: string;
}

interface DocumentSettings {
  require_pod_before_completion: boolean;
  require_receipt_image_upload: boolean;
}

interface FleetSettings {
  enable_maintenance_tracking: boolean;
  require_truck_for_road_service: boolean;
}

const DEFAULT_DISPATCH: DispatchSettings = {
  require_driver_acceptance: true,
  default_load_status: "pending_acceptance",
  auto_set_driver_unavailable: true,
};

const DEFAULT_NOTIFICATION: NotificationSettings = {
  enable_push_notifications: true,
  enable_in_app_notifications: true,
  dispatch_notification_template:
    "You have been assigned a new load. Please review and accept or decline.",
};

const DEFAULT_DOCUMENT: DocumentSettings = {
  require_pod_before_completion: true,
  require_receipt_image_upload: true,
};

const DEFAULT_FLEET: FleetSettings = {
  enable_maintenance_tracking: true,
  require_truck_for_road_service: true,
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const supabase = createClient();
  const { user: currentUser, loading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  // User Management state
  const [users, setUsers] = useState<UserType[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("driver");

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // System Preferences state
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [dispatch, setDispatch] = useState<DispatchSettings>(DEFAULT_DISPATCH);
  const [notification, setNotification] = useState<NotificationSettings>(DEFAULT_NOTIFICATION);
  const [document, setDocument] = useState<DocumentSettings>(DEFAULT_DOCUMENT);
  const [fleet, setFleet] = useState<FleetSettings>(DEFAULT_FLEET);

  // ─── Redirect non-admin from users tab ─────────────────────────────────

  useEffect(() => {
    if (!userLoading && currentUser?.role !== "admin" && activeTab === "users") {
      setActiveTab("profile");
    }
  }, [currentUser, userLoading, activeTab]);

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.full_name);
      setProfileEmail(currentUser.email);
      setProfilePhone(currentUser.phone || "");
    }
  }, [currentUser]);

  // ─── User Management ───────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (currentUser?.role !== "admin") return;
    try {
      const { data, error } = await supabase.from("users").select("*").order("full_name");
      if (error) console.error("Failed to fetch users:", error);
      setUsers(data || []);
    } catch (err) {
      console.error("Users fetch exception:", err);
    } finally {
      setUsersLoading(false);
    }
  }, [currentUser, supabase]);

  useEffect(() => {
    if (currentUser?.role === "admin" && activeTab === "users") {
      fetchUsers();
    }
  }, [currentUser, activeTab, fetchUsers]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleUserSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    if (editUser) {
      const { error } = await supabase
        .from("users")
        .update({
          full_name: fd.get("full_name") as string,
          email: fd.get("email") as string,
          phone: (fd.get("phone") as string) || null,
          role: selectedRole,
          is_active: fd.get("is_active") === "true",
        })
        .eq("id", editUser.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("User updated");
      }
    } else {
      const email = fd.get("email") as string;
      const password = fd.get("password") as string;
      const fullName = fd.get("full_name") as string;
      const phone = (fd.get("phone") as string) || null;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
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

      const { error } = await supabase.from("users").insert({
        id: authData.user.id,
        company_id: currentUser?.company_id,
        full_name: fullName,
        email,
        phone,
        role: selectedRole,
        is_active: true,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("User created successfully");
      }
    }

    setUserDialogOpen(false);
    setEditUser(null);
    setSubmitting(false);
    fetchUsers();
  };

  const handleProfileSave = async () => {
    if (!currentUser) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ full_name: profileName, phone: profilePhone || null })
        .eq("id", currentUser.id);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleToggleActive = async (u: UserType) => {
    const { error } = await supabase.from("users").update({ is_active: !u.is_active }).eq("id", u.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`User ${u.is_active ? "deactivated" : "activated"}`);
      fetchUsers();
    }
  };

  const handleDelete = async (u: UserType) => {
    if (u.id === currentUser?.id) {
      toast.error("Cannot delete yourself");
      return;
    }
    if (!confirm(`Delete user ${u.full_name}?`)) return;
    const { error } = await supabase.from("users").delete().eq("id", u.id);
    if (error) toast.error(error.message);
    else {
      toast.success("User deleted");
      fetchUsers();
    }
  };

  const openEdit = (u: UserType) => {
    setEditUser(u);
    setSelectedRole(u.role);
    setUserDialogOpen(true);
  };
  const openCreate = () => {
    setEditUser(null);
    setSelectedRole("driver");
    setUserDialogOpen(true);
  };

  // ─── System Preferences ────────────────────────────────────────────────

  const fetchPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_preferences")
        .select("key, value");

      if (error) {
        console.error("Failed to fetch preferences:", error);
        return;
      }

      for (const row of data || []) {
        const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        switch (row.key) {
          case "dispatch_settings":
            setDispatch({ ...DEFAULT_DISPATCH, ...val });
            break;
          case "notification_settings":
            setNotification({ ...DEFAULT_NOTIFICATION, ...val });
            break;
          case "document_settings":
            setDocument({ ...DEFAULT_DOCUMENT, ...val });
            break;
          case "fleet_settings":
            setFleet({ ...DEFAULT_FLEET, ...val });
            break;
        }
      }
    } catch (err) {
      console.error("Preferences fetch exception:", err);
    } finally {
      setPrefsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (activeTab === "system") {
      fetchPreferences();
    }
  }, [activeTab, fetchPreferences]);

  const savePreferences = async () => {
    setPrefsSaving(true);
    try {
      const upserts = [
        { key: "dispatch_settings", value: dispatch },
        { key: "notification_settings", value: notification },
        { key: "document_settings", value: document },
        { key: "fleet_settings", value: fleet },
      ];

      for (const row of upserts) {
        const { error } = await supabase
          .from("system_preferences")
          .upsert({ key: row.key, value: row.value }, { onConflict: "key" });

        if (error) throw error;
      }

      toast.success("System preferences saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save preferences");
    } finally {
      setPrefsSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const userCounts = {
    admin: users.filter((u) => u.role === "admin").length,
    dispatcher: users.filter((u) => u.role === "dispatcher").length,
    driver: users.filter((u) => u.role === "driver").length,
  };

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and system preferences" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users">
              <Shield className="mr-2 h-4 w-4" />
              User Management
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="system">
              <SettingsIcon className="mr-2 h-4 w-4" />
              System Preferences
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Profile Tab ─────────────────────────────────────────────── */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                {isAdmin ? "Update your profile information." : "View your profile information."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 pb-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {currentUser?.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{currentUser?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
                  <Badge variant={ROLE_CONFIG[currentUser?.role || "driver"].variant} className="mt-1">
                    {ROLE_CONFIG[currentUser?.role || "driver"].label}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profileEmail} disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              {isAdmin && (
                <div className="flex justify-end pt-4">
                  <Button onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── User Management Tab (Admin only) ─────────────────────── */}
        {isAdmin && (
          <TabsContent value="users">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">User Management</h3>
                  <p className="text-sm text-muted-foreground">
                    {users.length} users · {userCounts.admin} admins · {userCounts.dispatcher}{" "}
                    dispatchers · {userCounts.driver} drivers
                  </p>
                </div>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Add User
                </Button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
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
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
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
                        {filteredUsers.map((u) => {
                          const initials = u.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2);
                          const roleCfg = ROLE_CONFIG[u.role];
                          return (
                            <TableRow key={u.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                      {initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium">{u.full_name}</span>
                                </div>
                              </TableCell>
                              <TableCell>{u.email}</TableCell>
                              <TableCell>{u.phone || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={roleCfg.variant}>{roleCfg.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={u.is_active ? "success" : "secondary"}
                                  className="cursor-pointer"
                                  onClick={() => handleToggleActive(u)}
                                >
                                  {u.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>{format(new Date(u.created_at), "MMM d, yyyy")}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {u.id !== currentUser?.id && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(u)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
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

              {/* Create/Edit User Dialog */}
              <Dialog
                open={userDialogOpen}
                onOpenChange={(o) => {
                  setUserDialogOpen(o);
                  if (!o) setEditUser(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editUser ? "Edit User" : "Create New User"}</DialogTitle>
                    <DialogDescription>
                      {editUser ? "Update user profile and role." : "Add a new user to the system."}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUserSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name *</Label>
                        <Input name="full_name" defaultValue={editUser?.full_name || ""} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Email *</Label>
                        <Input name="email" type="email" defaultValue={editUser?.email || ""} required />
                      </div>
                      {!editUser && (
                        <div className="space-y-2">
                          <Label>Password *</Label>
                          <Input name="password" type="password" required minLength={6} />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input name="phone" defaultValue={editUser?.phone || ""} />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
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
                          <select
                            name="is_active"
                            defaultValue={editUser.is_active ? "true" : "false"}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editUser ? "Update" : "Create"} User
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
        )}

        {/* ─── System Preferences Tab (Admin only) ─────────────────── */}
        {isAdmin && (
          <TabsContent value="system">
            {prefsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Dispatch Settings */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">Dispatch Settings</CardTitle>
                        <CardDescription>Configure how loads are dispatched to drivers</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Require Driver Acceptance</Label>
                        <p className="text-xs text-muted-foreground">
                          Drivers must accept or decline dispatched loads before they become active
                        </p>
                      </div>
                      <Switch
                        checked={dispatch.require_driver_acceptance}
                        onCheckedChange={(v) =>
                          setDispatch((prev) => ({ ...prev, require_driver_acceptance: v }))
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Default Load Status</Label>
                        <p className="text-xs text-muted-foreground">
                          The status assigned to a newly dispatched load
                        </p>
                      </div>
                      <Select
                        value={dispatch.default_load_status}
                        onValueChange={(v) =>
                          setDispatch((prev) => ({ ...prev, default_load_status: v }))
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending_acceptance">Pending Acceptance</SelectItem>
                          <SelectItem value="dispatched">Dispatched</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">
                          Auto Set Driver Unavailable When Dispatched
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically mark the driver as unavailable when assigned a load
                        </p>
                      </div>
                      <Switch
                        checked={dispatch.auto_set_driver_unavailable}
                        onCheckedChange={(v) =>
                          setDispatch((prev) => ({ ...prev, auto_set_driver_unavailable: v }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Notification Settings */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">Notification Settings</CardTitle>
                        <CardDescription>Manage how notifications are sent to users</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Enable Push Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Send push notifications to drivers via Firebase Cloud Messaging
                        </p>
                      </div>
                      <Switch
                        checked={notification.enable_push_notifications}
                        onCheckedChange={(v) =>
                          setNotification((prev) => ({ ...prev, enable_push_notifications: v }))
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Enable In-App Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Show notifications inside the application&apos;s notification center
                        </p>
                      </div>
                      <Switch
                        checked={notification.enable_in_app_notifications}
                        onCheckedChange={(v) =>
                          setNotification((prev) => ({
                            ...prev,
                            enable_in_app_notifications: v,
                          }))
                        }
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Dispatch Notification Template</Label>
                      <p className="text-xs text-muted-foreground">
                        The message body sent to drivers when a new load is dispatched
                      </p>
                      <Textarea
                        value={notification.dispatch_notification_template}
                        onChange={(e) =>
                          setNotification((prev) => ({
                            ...prev,
                            dispatch_notification_template: e.target.value,
                          }))
                        }
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Document Settings */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">Document Settings</CardTitle>
                        <CardDescription>
                          Control document requirements for loads and receipts
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">
                          Require POD Before Load Completion
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Drivers must upload a Proof of Delivery before marking a load as empty
                        </p>
                      </div>
                      <Switch
                        checked={document.require_pod_before_completion}
                        onCheckedChange={(v) =>
                          setDocument((prev) => ({ ...prev, require_pod_before_completion: v }))
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Require Receipt Image Upload</Label>
                        <p className="text-xs text-muted-foreground">
                          Require an image attachment when submitting expense receipts
                        </p>
                      </div>
                      <Switch
                        checked={document.require_receipt_image_upload}
                        onCheckedChange={(v) =>
                          setDocument((prev) => ({ ...prev, require_receipt_image_upload: v }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Fleet Settings */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">Fleet Settings</CardTitle>
                        <CardDescription>
                          Configure fleet management and maintenance options
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Enable Maintenance Tracking</Label>
                        <p className="text-xs text-muted-foreground">
                          Track and manage truck/trailer maintenance schedules and status
                        </p>
                      </div>
                      <Switch
                        checked={fleet.enable_maintenance_tracking}
                        onCheckedChange={(v) =>
                          setFleet((prev) => ({ ...prev, enable_maintenance_tracking: v }))
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">
                          Require Truck for Road Service Receipts
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Road service receipts must specify which truck the service was for
                        </p>
                      </div>
                      <Switch
                        checked={fleet.require_truck_for_road_service}
                        onCheckedChange={(v) =>
                          setFleet((prev) => ({ ...prev, require_truck_for_road_service: v }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button onClick={savePreferences} disabled={prefsSaving} size="lg">
                    {prefsSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save All Preferences
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
