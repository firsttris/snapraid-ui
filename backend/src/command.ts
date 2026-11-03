// Runs a program to its end and collects its output: stdin inherited, stdout and stderr piped
// unless ignored; a missing program fails with ENOENT
export interface CommandResult {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

type Output = "pipe" | "ignore";

const collect = async (stream: ReadableStream<Uint8Array> | number | undefined): Promise<Uint8Array> =>
  stream instanceof ReadableStream ? new Uint8Array(await new Response(stream).arrayBuffer()) : new Uint8Array();

export const runCommand = async (
  cmd: string[],
  options: { stdout?: Output; stderr?: Output } = {},
): Promise<CommandResult> => {
  const child = Bun.spawn(cmd, { stdin: "inherit", stdout: options.stdout ?? "pipe", stderr: options.stderr ?? "pipe" });
  const [stdout, stderr, code] = await Promise.all([collect(child.stdout), collect(child.stderr), child.exited]);
  return { code, stdout, stderr };
};
