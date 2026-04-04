import Link from "next/link";

/**
 * Shown to driver-role accounts that sign in on the web.
 * Drivers should use the NFG Logistics mobile app; the web app is admin/dispatcher only.
 */
export default function DriverWebNoticePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">NFG Logistics</h1>
      <p className="max-w-md text-muted-foreground">
        Driver accounts use the <strong className="text-foreground">mobile app</strong> only.
        This web dashboard is for administrators and dispatchers.
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        Download the driver app from the App Store or Google Play, or contact your dispatcher
        if you need the install link.
      </p>
      <Link
        href="/api/auth/signout"
        className="mt-4 text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
      >
        Sign out
      </Link>
    </div>
  );
}
