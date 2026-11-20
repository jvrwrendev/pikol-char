import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { format } from 'date-fns'
import { Bell, CalendarDays, ChevronDown, CircleUserRound, FileText, LayoutDashboard, MapPin, Menu, Moon, Settings2, Sun, Timer, Users, WalletCards, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import logo from '@/assets/logo.jpg'
import { useAppState } from '@/app/AppState'
import { useIntervalTick } from '@/hooks/useInterval'
import { Button } from '@/components/ui/Button'

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/courts', label: 'Courts', icon: MapPin },
  { to: '/sessions', label: 'Court Sessions', icon: CalendarDays },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/time-monitoring', label: 'Time Monitoring', icon: Timer },
  { to: '/payments', label: 'Payment Monitoring', icon: WalletCards },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

function Brand() {
  return <div className="brand-lockup">
    <img src={logo} alt="PICK & ROLLERS PIKOL CHAR logo" className="brand-logo" />
    <span className="brand-copy"><strong>PIKOL CHAR</strong><small>COURT OPERATIONS</small></span>
  </div>
}

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return <>
    <div className="sidebar-brand"><Brand />{mobile && <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={onNavigate}><X size={18} /></Button>}</div>
    <div className="nav-label">WORKSPACE</div>
    <nav className="primary-nav" aria-label="Primary navigation">
      {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Payment Monitoring' && <span className="nav-indicator" />}
      </NavLink>)}
    </nav>
    <div className="sidebar-bottom"><div className="local-mark"><span className="local-dot" />Local workspace</div>
      <p>Your records are saved in this browser.</p>
    </div>
  </>
}

export function AppShell() {
  const location = useLocation()
  const { data, persistenceError, saveSettings } = useAppState()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const now = useIntervalTick(60_000)
  const title = items.find((item) => item.to === location.pathname)?.label ?? 'Dashboard'
  const activeSession = data.sessions.find((session) => session.status === 'active')
  const activePlayers = useMemo(() => {
    if (!activeSession) return 0
    const links = data.sessionPlayers.filter((item) => item.sessionId === activeSession.id)
    return links.filter((link) => data.timeLogs.some((log) => log.sessionPlayerId === link.id && !log.timeOut)).length
  }, [activeSession, data.sessionPlayers, data.timeLogs])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const resolvedTheme = (data.settings.theme ?? 'dark') === 'system'
    ? (systemDark ? 'dark' : 'light')
    : (data.settings.theme ?? 'dark')

  const toggleTheme = () => {
    saveSettings({ ...data.settings, theme: resolvedTheme === 'dark' ? 'light' : 'dark' })
  }

  return <div className="app-shell">
    <aside className="app-sidebar"><Sidebar /></aside>
    <div className="app-main">
      <header className="app-header">
        <Button variant="ghost" size="icon" className="mobile-menu-button" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><Menu size={19} /></Button>
        <div className="header-title"><strong>{title}</strong><span>{format(now, 'EEEE, MMM d, yyyy')}</span></div>
        <div className="header-actions">
          <Button variant="ghost" size="icon" aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="icon-button header-notice" aria-label="Open notifications">
              <Bell size={18} />{activePlayers > 0 && <span className="notification-dot" />}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="dropdown-content notification-content">
              <strong>Operations</strong>
              {activeSession ? <p>{activePlayers} player{activePlayers === 1 ? '' : 's'} currently playing on {data.courts.find((court) => court.id === activeSession.courtId)?.name}.</p> : <p>No active court sessions.</p>}
              <DropdownMenu.Separator className="dropdown-separator" />
              <span className="muted-copy">This device only</span>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          <span className="header-divider" />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="profile-trigger"><span className="avatar"><CircleUserRound size={18} /></span><span className="profile-copy"><strong>Administrator</strong><small>Local operator</small></span><ChevronDown size={15} /></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="dropdown-content profile-menu">
              <div className="profile-menu-heading"><strong>Administrator</strong><small>Local workspace</small></div>
              <DropdownMenu.Separator className="dropdown-separator" />
              <DropdownMenu.Item className="dropdown-item" onSelect={() => { window.location.href = '/settings' }}><Settings2 size={15} /> Settings</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>
      <main className="page-host">
        {persistenceError && <div className="storage-warning" role="alert"><strong>Local changes are not being saved.</strong> {persistenceError}</div>}
        <Outlet />
      </main>
    </div>
    {drawerOpen && <div className="mobile-drawer-wrap"><button className="drawer-backdrop" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
      <aside className="mobile-drawer"><Sidebar mobile onNavigate={() => setDrawerOpen(false)} /></aside></div>}
  </div>
}
