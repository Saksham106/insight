'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useMediaQuery } from '@/lib/use-media-query';

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface MobileNavProps {
  role: 'admin' | 'teacher' | 'student' | 'parent';
  links: NavLink[];
  unreadCount?: number;
}

const roleLinks: Record<MobileNavProps['role'], NavLink[]> = {
  admin: [
    { href: '/admin', label: 'Overview', icon: require('lucide-react').LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: require('lucide-react').Users },
    { href: '/admin/sessions', label: 'Sessions', icon: require('lucide-react').Calendar },
    { href: '/admin/chats', label: 'Chats', icon: require('lucide-react').MessageSquare },
  ],
  teacher: [
    { href: '/teacher', label: 'Overview', icon: require('lucide-react').LayoutDashboard },
    { href: '/teacher/schedule', label: 'Schedule', icon: require('lucide-react').Calendar },
    { href: '/teacher/requests', label: 'Requests', icon: require('lucide-react').CheckCircle },
    { href: '/teacher/students', label: 'Students', icon: require('lucide-react').UserRound },
    { href: '/teacher/chats', label: 'Chats', icon: require('lucide-react').MessageSquare },
  ],
  student: [
    { href: '/student', label: 'Overview', icon: require('lucide-react').LayoutDashboard },
    { href: '/student/schedule', label: 'Schedule', icon: require('lucide-react').Calendar },
    { href: '/student/requests', label: 'Proposals', icon: require('lucide-react').CheckCircle },
    { href: '/student/teachers', label: 'Teachers', icon: require('lucide-react').UserRound },
    { href: '/student/chats', label: 'Chats', icon: require('lucide-react').MessageSquare },
  ],
  parent: [
    { href: '/parent', label: 'Overview', icon: require('lucide-react').LayoutDashboard },
    { href: '/parent/schedule', label: 'Schedule', icon: require('lucide-react').Calendar },
    { href: '/parent/chats', label: 'Chats', icon: require('lucide-react').MessageSquare },
  ],
};

export function MobileNavigation({ role, unreadCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isMobile || !mounted) return null;

  const links = roleLinks[role];

  const tabWidth = `${100 / links.length}%`;

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {links.map((link, index) => {
        const Icon = link.icon;
        const active = pathname === link.href;
        const isChats = link.label === 'Chats';

        const isActive = active;

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              position: 'relative',
              flex: `0 0 ${tabWidth}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '0 8px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-navy)' : 'var(--color-ink-2)',
              transition: 'color 0.15s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
              }}
            >
              <Icon
                size={22}
                style={{
                  color: isActive ? 'var(--color-navy)' : 'var(--color-ink-2)',
                  transition: 'color 0.15s ease',
                }}
              />
              {isChats && unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--color-error)',
                    color: 'white',
                    fontSize: '9px',
                    fontWeight: 700,
                    border: '2px solid var(--color-surface)',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 500,
                marginTop: '2px',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
