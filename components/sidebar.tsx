"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Home,
  Users2,
  Activity,
  Package,
  FileText,
  Truck,
  BarChart3,
  Settings,
} from "lucide-react";

const navItems = [
  { title: "Dashboard",       href: "/dashboard",       icon: Home,     roles: ["admin", "dispatcher"] },
  { title: "Drivers",         href: "/drivers",         icon: Users2,   roles: ["admin", "dispatcher"] },
  { title: "Status Updates",  href: "/status-updates",  icon: Activity, roles: ["admin", "dispatcher"] },
  { title: "Loads",           href: "/loads",           icon: Package,  roles: ["admin", "dispatcher"] },
  { title: "Trucks & Trailers", href: "/fleet",        icon: Truck,    roles: ["admin", "dispatcher"] },
  { title: "Receipts",        href: "/receipts",        icon: FileText,  roles: ["admin", "dispatcher"] },
  { title: "Reports",         href: "/reports",         icon: BarChart3, roles: ["admin"] },
  { title: "Settings",        href: "/settings",        icon: Settings, roles: ["admin", "dispatcher"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const visibleItems = navItems.filter(
    (item) => !user?.role || item.roles.includes(user.role)
  );

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo - NFG Logistics (add logo.png to nfg-web/public/) */}
      <div className="flex h-16 shrink-0 items-center px-4">
        <Link href="/dashboard" className="flex h-full items-center">
          <img
            src="/logo.png"
            alt="NFG Logistics"
            className="max-h-full max-w-full object-contain"
            width={160}
            height={40}
          />
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
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
