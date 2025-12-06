import { useEffect, useRef } from 'react'

interface OutputConsoleProps {
  output: string
}

export function OutputConsole({ output }: OutputConsoleProps) {
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Output</h2>
      <div
        ref={outputRef}
        className="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto whitespace-pre-wrap"
      >
        {output || 'No output yet. Run a command to see results.'}
      </div>
    </div>
  )
}
