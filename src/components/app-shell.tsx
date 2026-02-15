"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { APP_BRAND } from "@/lib/branding";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const portal = searchParams.get("portal");
  const view = searchParams.get("view");

  const navItems = [
    { href: "/vendor/applications", label: "Vendor Portal" },
    { href: "/admin/applications", label: "Admin Review" },
    { href: "/vendors", label: "Vendors" }
  ];

  function isActiveNav(href: string) {
    if (href === "/vendor/applications") {
      return (
        pathname?.startsWith("/vendor/applications") ||
        (pathname === "/applications" && portal === "vendor") ||
        (pathname?.startsWith("/applications/") && view === "vendor") ||
        (pathname?.startsWith("/applications") && portal !== "admin" && view !== "admin")
      );
    }

    if (href === "/admin/applications") {
      return (
        pathname?.startsWith("/admin/applications") ||
        (pathname === "/applications" && portal === "admin") ||
        (pathname?.startsWith("/applications/") && view === "admin")
      );
    }

    return pathname?.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="shell-header">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/vendor/applications" className="shell-brand">
              <span className="brand-chip">VC</span>
              <span className="text-base font-semibold tracking-tight">{APP_BRAND.fullName}</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {navItems.map((item) => {
                const active = isActiveNav(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`nav-pill ${active ? "nav-pill-active" : ""}`}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="container py-8 fade-slide-up">{children}</main>
    </div>
  );
}
