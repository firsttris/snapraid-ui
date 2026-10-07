declare const __APP_VERSION__: string | undefined

/** The running version (package.json, built in by Vite); "dev" where Vite did not build it (unit tests) */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** The GitHub release of this version */
export const releaseUrl = (version = APP_VERSION) =>
  `https://github.com/firsttris/snapraid-ui/releases/tag/v${version}`
