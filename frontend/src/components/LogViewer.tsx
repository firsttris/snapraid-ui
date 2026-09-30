import { Download } from 'lucide-react'
import { useLogContent } from '../hooks/queries'
import * as m from '../paraglide/messages'
import { Button } from './Button'

interface LogViewerProps {
  selectedLog: string | null
}

export const LogViewer = ({ selectedLog }: LogViewerProps) => {
  const { data: logContent = '', isLoading } = useLogContent(
    selectedLog ?? undefined,
  )

  const handleDownload = () => {
    if (!selectedLog) return
    const blob = new Blob([logContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedLog
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="bg-white shadow-lg rounded-xl border border-gray-100">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedLog || m.log_viewer_select_log()}
          </h2>
          {selectedLog && (
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              <Download size={14} />
              {m.log_viewer_download()}
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="text-center text-gray-500">{m.common_loading()}</div>
        ) : selectedLog ? (
          <pre className="theme-fixed bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[calc(100vh-300px)] text-sm font-mono whitespace-pre-wrap">
            {logContent}
          </pre>
        ) : (
          <div className="text-center text-gray-400 py-20">
            <svg
              aria-hidden="true"
              className="w-16 h-16 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-lg">{m.log_viewer_select_log()}</p>
          </div>
        )}
      </div>
    </div>
  )
}
