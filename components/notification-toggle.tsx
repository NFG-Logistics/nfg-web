"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Header button that lets the user grant the browser notification permission
 * used by `GlobalStatusNotifier` to fire desktop notifications even when the
 * tab is in the background.
 */
export function NotificationToggle() {
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const handleClick = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Browser notifications are not supported in this browser");
      return;
    }
    if (Notification.permission === "granted") {
      toast.message("Desktop notifications already enabled");
      return;
    }
    if (Notification.permission === "denied") {
      toast.error(
        "Notifications are blocked. Enable them in your browser site settings."
      );
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Desktop notifications enabled");
    } else if (result === "denied") {
      toast.error("Notifications denied");
    }
  }, []);

  if (permission === "unsupported") return null;

  const enabled = permission === "granted";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      title={
        enabled
          ? "Desktop notifications enabled"
          : "Enable desktop notifications"
      }
      aria-label={
        enabled
          ? "Desktop notifications enabled"
          : "Enable desktop notifications"
      }
    >
      {enabled ? (
        <Bell className="h-5 w-5 text-emerald-500" />
      ) : (
        <BellOff className="h-5 w-5 text-muted-foreground" />
      )}
    </Button>
  );
}
