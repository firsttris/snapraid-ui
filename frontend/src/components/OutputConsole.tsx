import { useEffect, useRef } from 'react'
import * as m from '../paraglide/messages'

interface OutputConsoleProps {
  output: string
}

export const OutputConsole = ({ output }: OutputConsoleProps) => {
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">{m.output_console_title()}</h2>
      <div
        ref={outputRef}
        className="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto whitespace-pre-wrap"
      >
        {output || m.output_console_no_output()}
      </div>
    </div>
  )
}
