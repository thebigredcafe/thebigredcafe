'use server'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const isManager = profile?.role === 'manager'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <p className="text-base font-semibold text-gray-900">Café Roster</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{profile?.full_name}</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {isManager ? (
            <>
              <NavLink href="/manager">Roster Builder</NavLink>
              <NavLink href="/manager/staff">Staff</NavLink>
              <NavLink href="/manager/teams">Sport Teams</NavLink>
              <NavLink href="/manager/settings">Settings</NavLink>
            </>
          ) : (
            <>
              <NavLink href="/dashboard">My Shifts</NavLink>
              <NavLink href="/dashboard/availability">My Availability</NavLink>
              <NavLink href="/dashboard/unavailability">Time Off</NavLink>
              <NavLink href="/dashboard/changes">Future Changes</NavLink>
              <NavLink href="/dashboard/profile">My Profile</NavLink>
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {children}
    </Link>
  )
}
