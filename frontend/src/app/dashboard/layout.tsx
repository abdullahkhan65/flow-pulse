'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api, User, clearToken } from '@/lib/api';
import { LayoutDashboard, Users, Settings, LogOut, ChevronDown, Bell } from 'lucide-react';

function NavItem({ href, icon: Icon, label, active }: {
  href: string;
  icon: any;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-50 text-brand-600'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="w-4 h-4" />
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
    api.getMe()
      .then(setUser)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    clearToken();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isManager = user && ['owner', 'admin', 'manager'].includes(user.role);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">FP</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">FlowPulse</span>
          </div>
          {user && (
            <div className="mt-3 text-xs text-gray-500 truncate">{user.organization_name}</div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Team Dashboard" active={pathname === '/dashboard'} />
          {isManager && (
            <NavItem href="/dashboard/members" icon={Users} label="Team Members" active={pathname === '/dashboard/members'} />
          )}
          <NavItem href="/dashboard/my-scores" icon={Bell} label="My Scores" active={pathname === '/dashboard/my-scores'} />
          <NavItem href="/dashboard/settings" icon={Settings} label="Settings" active={pathname === '/dashboard/settings'} />
        </nav>

        <div className="p-3 border-t border-gray-100">
          {user && (
            <div className="flex items-center gap-2 px-3 py-2">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                  <span className="text-brand-600 text-xs font-medium">{user.name?.[0]}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">{user.name}</div>
                <div className="text-xs text-gray-500 capitalize">{user.role}</div>
              </div>
              <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
