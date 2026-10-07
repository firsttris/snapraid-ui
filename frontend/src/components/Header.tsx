import { Link, useLocation } from '@tanstack/react-router'
import {
  ChevronRight,
  Languages,
  Loader2,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Sun,
} from 'lucide-react'
import { useConfig } from '../hooks/queries'
import { isSidebarDocked, useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { getCommandLabel } from '../lib/commands'
import { navItemOf } from '../lib/nav'
import { type ThemePreference, useTheme } from '../lib/theme'
import * as m from '../paraglide/messages'
import { getLocale, locales, setLocale } from '../paraglide/runtime'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Kbd } from './ui/kbd'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

const THEME_LABELS = {
  light: m.theme_light,
  dark: m.theme_dark,
  system: m.theme_system,
} as const

// Running job with its progress, visible on every page and leading back to the dashboard
const JobChip = () => {
  const { currentCommand, currentJob, progress, isAborting } = useJob()
  const label = m.nav_job_running({
    command: getCommandLabel(currentCommand || currentJob?.command || ''),
  })
  const title = isAborting ? m.commands_aborting() : label

  return (
    <Link
      to="/"
      className="ui-job-chip relative flex h-8 items-center gap-2 overflow-hidden rounded-full bg-blue-50 px-3 text-xs font-medium text-blue-700 transition-shadow hover:bg-blue-100"
      title={title}
      aria-label={title}
    >
      {progress && (
        <span
          className="ui-stripes absolute inset-y-0 left-0 bg-blue-200/70 transition-[width] duration-500"
          style={{ width: `${Math.min(progress.percent, 100)}%` }}
        />
      )}
      <Loader2 size={14} className="relative animate-spin" />
      <span className="relative hidden sm:inline">
        {isAborting ? m.nav_job_aborting() : label}
      </span>
      {progress && !isAborting && (
        <span className="relative tabular-nums">{progress.percent} %</span>
      )}
    </Link>
  )
}

const ThemeMenu = () => {
  const theme = useTheme()
  const Icon = THEME_ICONS[theme.preference]
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={m.theme_label()}>
              <Icon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{m.theme_label()}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{m.theme_label()}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme.preference}
          onValueChange={(value) => theme.setTheme(value as ThemePreference)}
        >
          {(['light', 'dark', 'system'] as const).map((value) => {
            const ItemIcon = THEME_ICONS[value]
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon className="text-muted-foreground" />
                {THEME_LABELS[value]()}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const LanguageMenu = () => {
  const currentLocale = getLocale()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="px-2.5"
              aria-label={m.common_switch_language()}
            >
              <Languages />
              <span className="text-xs">{currentLocale.toUpperCase()}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{m.common_switch_language()}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={currentLocale}
          onValueChange={(value) => setLocale(value as typeof currentLocale)}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {new Intl.DisplayNames([locale], { type: 'language' }).of(
                locale,
              ) ?? locale}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Top bar of every page: sidebar toggle, where you are, command palette and quick settings
 */
export const Header = () => {
  const { toggleSidebar, setMobileNavOpen, setPaletteOpen } = useAppShell()
  const { pathname } = useLocation()
  const job = useJob()
  const { data: config } = useConfig()
  const { selectedConfig } = useSelectedConfig()
  const configName = config?.snapraidConfigs.find(
    (c) => c.path === selectedConfig,
  )?.name
  const page = navItemOf(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.sidebar_toggle()}
            onClick={() => {
              if (isSidebarDocked()) toggleSidebar()
              else setMobileNavOpen(true)
            }}
          >
            <PanelLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {m.sidebar_toggle()} <Kbd className="ml-1">⌘B</Kbd>
        </TooltipContent>
      </Tooltip>
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      >
        {configName && (
          <>
            <span className="hidden truncate sm:inline">{configName}</span>
            <ChevronRight className="hidden size-3.5 shrink-0 sm:inline" />
          </>
        )}
        <span className="truncate font-medium text-foreground">
          {page?.label() ?? m.app_title()}
        </span>
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="secondary"
          onClick={() => setPaletteOpen(true)}
          className="hidden w-60 justify-start bg-muted/70 font-normal text-muted-foreground shadow-none lg:inline-flex"
        >
          <Search />
          {m.palette_open()}
          <Kbd className="ml-auto">⌘K</Kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPaletteOpen(true)}
          className="lg:hidden"
          aria-label={m.palette_open()}
        >
          <Search />
        </Button>
        {job.isRunning && <JobChip />}
        <ThemeMenu />
        <LanguageMenu />
      </div>
    </header>
  )
}
