'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Calendar, LayoutDashboard, LogOut, Settings, ShieldCheck, Users } from 'lucide-react';
import { api, clearToken, User, getStoredToken } from '@/lib/api';
import { FlowPulseLogo } from '@/components/brand-logo';

function NavItem({ href, icon: Icon, label, active }: {
  href: string;
  icon: any;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
        active
          ? 'bg-gradient-to-r from-teal-700 to-orange-500 text-white shadow-[0_12px_30px_rgba(15,90,84,0.34)]'
          : 'text-slate-600 hover:bg-white hover:text-slate-900'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/dashboard')}`);
      setLoading(false);
      return;
    }

    api
      .getMe()
      .then(setUser)
      .catch(() => router.replace(`/login?redirect=${encodeURIComponent(pathname || '/dashboard')}`))
      .finally(() => setLoading(false));
  }, [router, pathname]);

  const handleLogout = () => {
    clearToken();
    router.push('/');
  };

  const isManager = user && ['owner', 'admin', 'manager'].includes(user.role);

  // Redirect plain members away from manager-only pages
  useEffect(() => {
    if (user && !isManager && pathname === '/dashboard') {
      router.replace('/dashboard/my-scores');
    }
  }, [user, isManager, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid w-full max-w-[1320px] gap-4 md:grid-cols-[250px_1fr]">
        <aside className="card flex flex-col p-3 md:p-4">
          <div className="mb-4 rounded-2xl border border-white/65 bg-gradient-to-br from-white/90 to-white/70 p-3">
            <FlowPulseLogo />
            <p className="mt-2 truncate text-xs text-slate-500">{user?.organization_name || 'Workspace'}</p>
          </div>

          <nav className="grid gap-1">
            {isManager && <NavItem href="/dashboard" icon={LayoutDashboard} label="Team Dashboard" active={pathname === '/dashboard'} />}
            {isManager && <NavItem href="/dashboard/members" icon={Users} label="Team Members" active={pathname === '/dashboard/members'} />}
            {isManager && <NavItem href="/dashboard/calendar" icon={Calendar} label="Team Calendar" active={pathname === '/dashboard/calendar'} />}
            <NavItem href="/dashboard/my-scores" icon={Bell} label="My Scores" active={pathname === '/dashboard/my-scores'} />
            <NavItem href="/dashboard/settings" icon={Settings} label="Settings" active={pathname === '/dashboard/settings'} />
            {user && ['owner', 'admin'].includes(user.role) && (
              <NavItem href="/dashboard/admin" icon={ShieldCheck} label="Admin Console" active={pathname === '/dashboard/admin'} />
            )}
          </nav>

          <div className="mt-4 border-t border-slate-200/80 pt-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/70 p-2.5">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                  {user?.name?.[0] || 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="truncate text-xs capitalize text-slate-500">{user?.role}</p>
              </div>
              <button onClick={handleLogout} className="btn-secondary p-2" aria-label="Logout">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        <main className="card min-h-[80vh] overflow-hidden bg-gradient-to-b from-white/80 to-white/70 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
