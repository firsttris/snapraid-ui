import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArchiveRestore,
  Check,
  ChevronsUpDown,
  HardDrive,
  Layers,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { useConfig, useLogout, useSession } from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { ARRAY_NAV_ITEM, NAV_ITEMS } from '../lib/nav'
import { type MotionPreference, useMotion } from '../lib/theme'
import { cn } from '../lib/utils'
import { APP_VERSION, releaseUrl } from '../lib/version'
import * as m from '../paraglide/messages'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

const navLinkClass =
  'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,transform] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-foreground before:opacity-0 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:before:opacity-100 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0'

const MOTION_OPTIONS: Array<{
  value: MotionPreference
  label: () => string
  hint: () => string
}> = [
  { value: 'off', label: m.motion_off, hint: m.motion_hint_off },
  { value: 'subtle', label: m.motion_subtle, hint: m.motion_hint_subtle },
  { value: 'strong', label: m.motion_strong, hint: m.motion_hint_strong },
]

const GroupLabel = ({ children }: { children: string }) => (
  <div className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">
    {children}
  </div>
)

// Picks the SnapRAID config all pages work on
const ConfigSwitcher = ({ onNavigate }: { onNavigate: () => void }) => {
  const { data: config } = useConfig()
  const { selectedConfig, setSelectedConfig } = useSelectedConfig()
  const { openConfigDialog } = useAppShell()
  const navigate = useNavigate()
  const job = useJob()
  const enabledConfigs = config?.snapraidConfigs.filter((c) => c.enabled) ?? []
  const selected = enabledConfigs.find((c) => c.path === selectedConfig)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={!config}
          className="flex w-full items-center gap-2 rounded-lg border bg-card p-2.5 text-left shadow-xs outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] text-muted-foreground">
              {m.config_selector_title()}
            </span>
            <span className="truncate text-sm font-semibold">
              {selected?.name ?? m.sidebar_no_config()}
            </span>
            {selected && (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {selected.path}
              </span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
      >
        <DropdownMenuLabel>{m.config_selector_title()}</DropdownMenuLabel>
        {enabledConfigs.map((cfg) => (
          <DropdownMenuItem
            key={cfg.path}
            disabled={job.isRunning}
            onSelect={() => setSelectedConfig(cfg.path)}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{cfg.name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {cfg.path}
              </span>
            </span>
            {cfg.path === selectedConfig && <Check />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!selected}
          onSelect={() => {
            onNavigate()
            navigate({ to: '/array' })
          }}
        >
          <ARRAY_NAV_ITEM.icon />
          {ARRAY_NAV_ITEM.label()}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onNavigate()
            openConfigDialog('manager')
          }}
        >
          <Layers />
          {m.config_manager_title()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const MotionSetting = () => {
  const { motion, setMotion } = useMotion()
  const current = MOTION_OPTIONS.find((option) => option.value === motion)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5" />
        {m.motion_label()}
      </div>
      <ToggleGroup
        type="single"
        value={motion}
        onValueChange={(value) => {
          if (value) setMotion(value as MotionPreference)
        }}
        aria-label={m.motion_label()}
        className="grid w-full grid-cols-3"
      >
        {MOTION_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="px-1 text-xs"
          >
            {option.label()}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="min-h-8 px-2.5 text-xs text-muted-foreground">
        {current?.hint()}
      </p>
    </div>
  )
}

const UserBox = () => {
  const { data: session } = useSession()
  const logout = useLogout()
  if (!session?.enabled) return null
  const name = session.username ?? ''

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border bg-card p-2 shadow-xs"
      title={name ? m.nav_signed_in_as({ username: name }) : undefined}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
        {name.slice(0, 2) || '?'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {m.sidebar_signed_in()}
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label={m.nav_logout()}
          >
            <LogOut />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{m.nav_logout()}</TooltipContent>
      </Tooltip>
    </div>
  )
}

const VersionLink = () => (
  <a
    href={releaseUrl()}
    target="_blank"
    rel="noreferrer"
    title={m.sidebar_release_notes()}
    className="self-start px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
  >
    {m.sidebar_version({ version: APP_VERSION })}
  </a>
)

const SidebarBody = ({ onNavigate }: { onNavigate: () => void }) => {
  const { openConfigDialog } = useAppShell()

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-1.5 pt-1 font-semibold"
      >
        <span className="ui-brand flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HardDrive className="size-4" />
        </span>
        <span className="text-[15px]">{m.app_title()}</span>
      </Link>

      <ConfigSwitcher onNavigate={onNavigate} />

      <nav className="flex flex-col gap-0.5" aria-label={m.navigation()}>
        <GroupLabel>{m.sidebar_group_overview()}</GroupLabel>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            data-slot="nav-link"
            className={navLinkClass}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon />
            {label()}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5">
        <GroupLabel>{m.sidebar_group_array()}</GroupLabel>
        <Link
          to={ARRAY_NAV_ITEM.to}
          onClick={onNavigate}
          data-slot="nav-link"
          className={navLinkClass}
        >
          <ARRAY_NAV_ITEM.icon />
          {ARRAY_NAV_ITEM.label()}
        </Link>
        <button
          type="button"
          data-slot="nav-link"
          className={cn(navLinkClass, 'text-left')}
          onClick={() => {
            onNavigate()
            openConfigDialog('manager')
          }}
        >
          <Layers />
          {m.config_manager_title()}
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <button
          type="button"
          data-slot="nav-link"
          className={cn(navLinkClass, 'text-left')}
          onClick={() => {
            onNavigate()
            openConfigDialog('backup')
          }}
        >
          <ArchiveRestore />
          {m.backup_title()}
        </button>
        <MotionSetting />
        <UserBox />
        <VersionLink />
      </div>
    </div>
  )
}

/**
 * Navigation, config switcher and personal settings; a sheet on small screens
 */
export const AppSidebar = () => {
  const { sidebarOpen, mobileNavOpen, setMobileNavOpen } = useAppShell()

  return (
    <>
      {sidebarOpen && (
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:block">
          <SidebarBody onNavigate={() => {}} />
        </aside>
      )}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">{m.navigation()}</SheetTitle>
          <SheetDescription className="sr-only">
            {m.app_title()}
          </SheetDescription>
          <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
