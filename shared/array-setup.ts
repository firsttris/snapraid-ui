// A new array from the setup wizard: the disks the user picked, checked and turned into a
// snapraid.conf. Shared, so the wizard previews exactly what the backend writes.

export interface SetupDisk {
  name: string; // d1, d2, … as SnapRAID calls the data disk
  path: string; // Mount point, absolute
}

export interface ArraySetup {
  dataDisks: SetupDisk[];
  parityPaths: string[]; // Mount points of the parity disks, level 1 first
}

export type SetupProblem =
  | 'no_data'
  | 'no_parity'
  | 'too_many_parity'
  | 'invalid_name'
  | 'duplicate_name'
  | 'relative_path'
  | 'duplicate_path'
  | 'nested_path';

// SnapRAID supports up to six parity levels
export const PARITY_KEYWORDS = ['parity', '2-parity', '3-parity', '4-parity', '5-parity', '6-parity'];

const DISK_NAME = /^[A-Za-z0-9_-]+$/;

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export const joinPath = (dir: string, file: string) => `${trimSlash(dir)}/${file}`;

const inside = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

/**
 * What keeps the setup from becoming a working array, empty when it is fine
 */
export const setupProblems = (setup: ArraySetup): SetupProblem[] => {
  const problems = new Set<SetupProblem>();
  if (setup.dataDisks.length === 0) problems.add('no_data');
  if (setup.parityPaths.length === 0) problems.add('no_parity');
  if (setup.parityPaths.length > PARITY_KEYWORDS.length) problems.add('too_many_parity');

  const names = setup.dataDisks.map((disk) => disk.name.trim());
  if (names.some((name) => !DISK_NAME.test(name))) problems.add('invalid_name');
  if (new Set(names).size !== names.length) problems.add('duplicate_name');

  const paths = [...setup.dataDisks.map((disk) => disk.path), ...setup.parityPaths].map((path) => trimSlash(path.trim()));
  if (paths.some((path) => !path.startsWith('/'))) problems.add('relative_path');
  if (new Set(paths).size !== paths.length) problems.add('duplicate_path');
  // A disk inside another: the parity file would end up among the data, or data counted twice
  if (paths.some((path, i) => paths.some((other, j) => i !== j && path !== other && inside(path, other)))) {
    problems.add('nested_path');
  }
  return [...problems];
};

/**
 * Where the content files go: the data directory of SnapRAID UI, plus one data disk per parity
 * level, so SnapRAID has the one more copy than parity levels it asks for, on different disks
 */
export const contentPaths = (setup: ArraySetup, dataDir: string, configName: string): string[] => [
  joinPath(dataDir, `${configName}.content`),
  ...setup.dataDisks.slice(0, Math.max(1, setup.parityPaths.length)).map((disk) => joinPath(disk.path, 'snapraid.content')),
];

export const buildSnapraidConf = (setup: ArraySetup, dataDir: string, configName: string): string =>
  [
    '# SnapRAID configuration, created by the SnapRAID UI setup wizard',
    '',
    '# Parity: one file per level, each on its own disk at least as large as the largest data disk',
    ...setup.parityPaths.map((path, level) => `${PARITY_KEYWORDS[level]} ${joinPath(path.trim(), `snapraid.${PARITY_KEYWORDS[level]}`)}`),
    '',
    '# Content files: the list of files and their checksums, one more copy than parity levels',
    ...contentPaths(setup, dataDir, configName).map((path) => `content ${path}`),
    '',
    '# Data disks',
    ...setup.dataDisks.map((disk) => `data ${disk.name.trim()} ${trimSlash(disk.path.trim())}/`),
    '',
    'exclude *.unrecoverable',
    'exclude /tmp/',
    'exclude /lost+found/',
    'exclude .Trash-*/',
    'exclude .recycle/',
    '',
  ].join('\n');

/**
 * Next free data disk name: d1, d2, …
 */
export const nextDiskName = (taken: string[]): string => {
  let index = 1;
  while (taken.includes(`d${index}`)) index++;
  return `d${index}`;
};
