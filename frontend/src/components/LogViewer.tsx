import * as m from '../paraglide/messages'

interface LogViewerProps {
  selectedLog: string | null
  logContent: string
  isLoading: boolean
  onDownload: (filename: string) => void
}

export const LogViewer = ({ selectedLog, logContent, isLoading, onDownload }: LogViewerProps) => {
  return (
    <div className="bg-white shadow-lg rounded-xl border border-gray-100">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedLog || m.log_viewer_select_log()}
          </h2>
          {selectedLog && (
            <button
              onClick={() => onDownload(selectedLog)}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {m.log_viewer_download()}
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="text-center text-gray-500">{m.common_loading()}</div>
        ) : selectedLog ? (
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[calc(100vh-300px)] text-sm font-mono whitespace-pre-wrap">
            {logContent}
          </pre>
        ) : (
          <div className="text-center text-gray-400 py-20">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg">{m.log_viewer_select_log()}</p>
          </div>
        )}
      </div>
    </div>
  )
}
