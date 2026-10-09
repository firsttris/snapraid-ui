import { buildSnapraidConf, setupProblems } from '@shared/array-setup'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileCog,
  FolderPlus,
  HardDrive,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { DirectoryBrowser } from '../components/DirectoryBrowser'
import { errorMessage, useFeedback } from '../components/Feedback'
import { PageLayout } from '../components/PageLayout'
import { Select } from '../components/Select'
import { LoadingHint } from '../components/Skeleton'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { queryKeys, useBasePath } from '../hooks/queries'
import { useAppShell } from '../hooks/useAppShell'
import { useJob } from '../hooks/useJob'
import { useSelectedConfig } from '../hooks/useSelectedConfig'
import { setupApi } from '../lib/api/setup'
import { executeCommand } from '../lib/api/snapraid'
import {
  type CapacityWarning,
  capacityWarnings,
  type DiskRole,
  fileNameFor,
  fromMounts,
  toSetup,
  type WizardDisk,
  withRole,
} from '../lib/setup-wizard'
import { formatGB } from '../lib/utils'
import * as m from '../paraglide/messages'

export const Route = createFileRoute('/setup')({
  // From Manage arrays, where adding an existing config is right next to it
  validateSearch: (search: Record<string, unknown>): { start?: 'new' } =>
    search.start === 'new' ? { start: 'new' } : {},
  component: SetupPage,
})

type Step = 'choose' | 'disks' | 'review'

const fieldClass = 'flex flex-col gap-2'

const gb = (bytes: number) => formatGB(bytes / 1e9)

const problemText = (problem: ReturnType<typeof setupProblems>[number]) =>
  ({
    no_data: m.setup_problem_no_data,
    no_parity: m.setup_problem_no_parity,
    too_many_parity: m.setup_problem_too_many_parity,
    invalid_name: m.setup_problem_invalid_name,
    duplicate_name: m.setup_problem_duplicate_name,
    relative_path: m.setup_problem_relative_path,
    duplicate_path: m.setup_problem_duplicate_path,
    nested_path: m.setup_problem_nested_path,
  })[problem]()

const warningText = (warning: CapacityWarning) =>
  warning.kind === 'not_empty'
    ? m.setup_warn_not_empty({ path: warning.path })
    : warning.kind === 'parity_too_small'
      ? m.setup_warn_parity_too_small({
          parity: warning.parity,
          disk: warning.disk,
        })
      : m.setup_warn_parity_smaller({
          parity: warning.parity,
          disk: warning.disk,
        })

function SetupPage() {
  const { start } = Route.useSearch()
  const [step, setStep] = useState<Step>(start === 'new' ? 'disks' : 'choose')
  const [disks, setDisks] = useState<WizardDisk[] | null>(null)
  const [name, setName] = useState('')

  return (
    <PageLayout
      title={m.setup_title()}
      description={<p className="max-w-3xl">{m.setup_intro()}</p>}
    >
      {step === 'choose' && <ChooseStep onNew={() => setStep('disks')} />}
      {step === 'disks' && (
        <DisksStep
          disks={disks}
          setDisks={setDisks}
          name={name}
          setName={setName}
          onBack={() => setStep('choose')}
          onNext={() => setStep('review')}
        />
      )}
      {step === 'review' && disks && (
        <ReviewStep disks={disks} name={name} onBack={() => setStep('disks')} />
      )}
    </PageLayout>
  )
}

function ChooseStep({ onNew }: { onNew: () => void }) {
  const { openConfigDialog } = useAppShell()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card lift className="gap-4 p-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <FileCog className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{m.setup_existing_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.setup_existing_desc()}
          </p>
        </div>
        <div className="mt-auto">
          <Button variant="outline" onClick={() => openConfigDialog('manager')}>
            {m.setup_existing_button()}
          </Button>
        </div>
      </Card>
      <Card lift className="gap-4 p-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{m.setup_new_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.setup_new_desc()}
          </p>
        </div>
        <div className="mt-auto">
          <Button onClick={onNew}>
            {m.setup_new_button()}
            <ArrowRight />
          </Button>
        </div>
      </Card>
    </div>
  )
}

function DisksStep({
  disks,
  setDisks,
  name,
  setName,
  onBack,
  onNext,
}: {
  disks: WizardDisk[] | null
  setDisks: (disks: WizardDisk[]) => void
  name: string
  setName: (name: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const [browsing, setBrowsing] = useState(false)
  const mounts = useQuery({
    queryKey: ['setup-mounts'],
    queryFn: setupApi.mounts,
    enabled: disks === null,
  })
  // Detected once, then the user's choices are kept when going back and forth
  useEffect(() => {
    if (disks === null && mounts.data) setDisks(fromMounts(mounts.data))
  }, [disks, mounts.data, setDisks])
  const list = disks ?? []

  const setRole = (path: string, role: DiskRole) =>
    setDisks(withRole(list, path, role))
  const setDiskName = (path: string, diskName: string) =>
    setDisks(
      list.map((disk) =>
        disk.path === path ? { ...disk, name: diskName } : disk,
      ),
    )
  const addFolder = (path: string) => {
    setBrowsing(false)
    if (list.some((disk) => disk.path === path)) return
    setDisks(
      withRole([...list, { path, role: 'none', name: '' }], path, 'data'),
    )
  }

  const setup = toSetup(list)
  const problems = setupProblems(setup)
  const warnings = capacityWarnings(list)

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-4 p-5">
        <div className={`${fieldClass} max-w-md`}>
          <Label htmlFor="setup-name">{m.setup_name()}</Label>
          <Input
            id="setup-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.setup_name_placeholder()}
          />
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{m.setup_disks_title()}</h2>
            <p className="text-sm text-muted-foreground">
              {m.setup_disks_desc()}
            </p>
          </div>
          <Button variant="outline" onClick={() => setBrowsing(true)}>
            <FolderPlus />
            {m.setup_add_folder()}
          </Button>
        </div>
        {mounts.isLoading && (
          <div className="border-t px-5 py-4">
            <LoadingHint>{m.setup_detecting()}</LoadingHint>
          </div>
        )}
        {!mounts.isLoading && list.length === 0 && (
          <p className="border-t px-5 py-4 text-sm text-muted-foreground">
            {m.setup_no_mounts()}
          </p>
        )}
        {list.length > 0 && (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{m.setup_col_disk()}</TableHead>
                  <TableHead className="text-right">
                    {m.setup_col_size()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.setup_col_used()}
                  </TableHead>
                  <TableHead>{m.setup_col_role()}</TableHead>
                  <TableHead>{m.setup_col_name()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((disk) => (
                  <TableRow key={disk.path}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-mono text-[13px]">{disk.path}</p>
                          <p className="text-xs text-muted-foreground">
                            {disk.mount
                              ? `${disk.mount.device} · ${disk.mount.fstype}`
                              : m.setup_folder()}
                            {disk.mount?.empty && (
                              <Badge variant="outline" className="ml-2">
                                {m.setup_empty()}
                              </Badge>
                            )}
                            {(disk.mount?.snapraidFiles.length ?? 0) > 0 && (
                              <Badge variant="info" className="ml-2">
                                {m.setup_has_snapraid()}
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums">
                      {disk.mount ? gb(disk.mount.totalBytes) : '–'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums">
                      {disk.mount ? gb(disk.mount.usedBytes) : '–'}
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Select
                        size="sm"
                        value={disk.role}
                        onChange={(role) =>
                          setRole(disk.path, role as DiskRole)
                        }
                        aria-label={m.setup_role_of({ path: disk.path })}
                        options={[
                          { value: 'none', label: m.setup_role_none() },
                          { value: 'data', label: m.setup_role_data() },
                          { value: 'parity', label: m.setup_role_parity() },
                        ]}
                      />
                    </TableCell>
                    <TableCell className="min-w-28">
                      {disk.role === 'data' && (
                        <Input
                          value={disk.name}
                          onChange={(e) =>
                            setDiskName(disk.path, e.target.value)
                          }
                          aria-label={m.setup_name_of({ path: disk.path })}
                          className="h-8 max-w-28 font-mono"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          {m.setup_disks_hint()}
        </p>
      </Card>

      {(problems.length > 0 || warnings.length > 0) && list.length > 0 && (
        <Alert variant={problems.length > 0 ? 'destructive' : 'warning'}>
          <AlertTriangle />
          <AlertDescription className="text-inherit">
            <ul className="list-disc pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problemText(problem)}</li>
              ))}
              {warnings.map((warning) => (
                <li key={JSON.stringify(warning)}>{warningText(warning)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          {m.setup_back()}
        </Button>
        <Button onClick={onNext} disabled={problems.length > 0 || !name.trim()}>
          {m.setup_next()}
          <ArrowRight />
        </Button>
      </div>

      {browsing && (
        <DirectoryBrowser
          title={m.setup_add_folder()}
          onSelect={addFolder}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  )
}

function ReviewStep({
  disks,
  name,
  onBack,
}: {
  disks: WizardDisk[]
  name: string
  onBack: () => void
}) {
  const { toast } = useFeedback()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const job = useJob()
  const { setSelectedConfig } = useSelectedConfig()
  const { data: basePath } = useBasePath()
  const [firstSync, setFirstSync] = useState(true)
  const [creating, setCreating] = useState(false)
  const fileName = fileNameFor(name)
  const setup = toSetup(disks)
  const conf = buildSnapraidConf(setup, basePath ?? '…', fileName)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const { path } = await setupApi.create(name.trim(), fileName, setup)
      await queryClient.invalidateQueries({ queryKey: queryKeys.config })
      setSelectedConfig(path)
      toast.success(m.setup_created({ name: name.trim() }))
      if (firstSync && !job.isRunning) {
        job.start('sync')
        executeCommand('sync', path).catch((error) =>
          job.fail('sync', errorMessage(error)),
        )
      }
      navigate({ to: '/' })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">{m.setup_review_title()}</h2>
        <p className="text-sm text-muted-foreground">
          {m.setup_review_desc({
            file: `${basePath ?? '…'}/${fileName}.conf`,
          })}
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 px-4 py-3 font-mono text-xs leading-relaxed">
          {conf}
        </pre>
        <Label className="flex items-start gap-3 font-normal">
          <Checkbox
            checked={firstSync}
            onCheckedChange={(value) => setFirstSync(value === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{m.setup_first_sync()}</span>
            <span className="block text-sm text-muted-foreground">
              {m.setup_first_sync_hint()}
            </span>
          </span>
        </Label>
      </Card>
      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={creating}>
          <ArrowLeft />
          {m.setup_back()}
        </Button>
        <Button onClick={handleCreate} disabled={creating}>
          {m.setup_create()}
        </Button>
      </div>
    </div>
  )
}
