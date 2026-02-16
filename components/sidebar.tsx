"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Package,
  Users2,
  Truck,
  Container,
  Receipt,
  FileText,
  BarChart3,
  UserCog,
} from "lucide-react";

const navItems = [
  { title: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard, roles: ["admin", "dispatcher"] },
  { title: "Loads",      href: "/loads",       icon: Package,         roles: ["admin", "dispatcher"] },
  { title: "Drivers",    href: "/drivers",     icon: Users2,          roles: ["admin", "dispatcher"] },
  { title: "Trucks",     href: "/trucks",      icon: Truck,           roles: ["admin", "dispatcher"] },
  { title: "Trailers",   href: "/trailers",    icon: Container,       roles: ["admin", "dispatcher"] },
  { title: "Receipts",   href: "/receipts",    icon: Receipt,         roles: ["admin", "dispatcher"] },
  { title: "Documents",  href: "/documents",   icon: FileText,        roles: ["admin", "dispatcher"] },
  { title: "Reports",    href: "/reports",     icon: BarChart3,       roles: ["admin"] },
  { title: "Users",      href: "/users",       icon: UserCog,         roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const visibleItems = navItems.filter(
    (item) => !user?.role || item.roles.includes(user.role)
  );

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Truck className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">NFG</span>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground text-center">
          NFG Logistics v1.0
        </p>
      </div>
    </div>
  );
}
