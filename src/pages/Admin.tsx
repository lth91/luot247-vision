import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { formatVietnamDateShort } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email("Email không hợp lệ").max(255),
});

interface UserWithRole {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionChecked(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminRole = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.role === "admin") {
        setUserRole("admin");
        fetchUsers();
      } else {
        setUserRole(null);
      }
    } catch (error) {
      console.error("Error checking admin role:", error);
      setUserRole(null);
    } finally {
      setRoleChecked(true);
    }
  }, [session?.user]);

  useEffect(() => {
    if (session?.user) {
      checkAdminRole();
    } else {
      setUserRole(null);
      setRoleChecked(true);
    }
  }, [session, checkAdminRole]);

  useEffect(() => {
    // Only check after both session and role have been checked
    if (!sessionChecked || !roleChecked) return;
    
    // Check if user is admin (either by role or by email)
    const isAdminByRole = session?.user && userRole === "admin";
    const isAdminByEmail = session?.user?.email === 'longth91@gmail.com';
    const isAdmin = isAdminByRole || isAdminByEmail;
    
    if (session?.user && isAdmin) {
      setIsLoading(false);
    } else if (session?.user && !isAdmin) {
      toast.error("Bạn không có quyền truy cập trang này");
      navigate("/");
    } else if (!session) {
      navigate("/auth");
    }
  }, [session, userRole, sessionChecked, roleChecked, navigate]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithRoles: UserWithRole[] = [];

      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id)
          .maybeSingle();

        usersWithRoles.push({
          id: profile.id,
          email: profile.email,
          role: roleData?.role || "user",
          created_at: profile.created_at,
        });
      }

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Không thể tải danh sách người dùng");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      createUserSchema.parse({ email: newUserEmail });

      // Send magic link to create account
      const { error } = await supabase.auth.signInWithOtp({
        email: newUserEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast.success(`Link tạo tài khoản đã được gửi đến ${newUserEmail}`);
      setNewUserEmail("");
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error("Error creating user:", error);
        toast.error("Không thể tạo tài khoản");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "user" | "moderator") => {
    try {
      // Check if user already has this role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role: newRole }]);

        if (error) throw error;
      }

      toast.success("Đã cập nhật quyền");
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Không thể cập nhật quyền");
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "moderator":
        return "default";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Đang tải...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (userRole !== "admin" && session?.user?.email !== 'longth91@gmail.com') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <div className="container py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Quản trị hệ thống</h1>
          <p className="text-muted-foreground">
            Tạo tài khoản và phân quyền người dùng
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tạo tài khoản mới</CardTitle>
            <CardDescription>
              Gửi link tạo tài khoản đến email người dùng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="user@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Đang gửi..." : "Gửi link tạo tài khoản"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách người dùng</CardTitle>
            <CardDescription>
              Quản lý quyền hạn của người dùng trong hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Quyền</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role === "admin" && "Quản trị viên"}
                        {user.role === "moderator" && "Điều hành viên"}
                        {user.role === "user" && "Người dùng"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatVietnamDateShort(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user.id, value as "admin" | "user" | "moderator")}
                        disabled={user.id === session?.user?.id}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Người dùng</SelectItem>
                          <SelectItem value="moderator">Điều hành viên</SelectItem>
                          <SelectItem value="admin">Quản trị viên</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
