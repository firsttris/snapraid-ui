import * as m from '../paraglide/messages'

interface ValidationResultAlertProps {
  validationResult: { valid: boolean; output: string }
}

export const ValidationResultAlert = ({ validationResult }: ValidationResultAlertProps) => {
  return (
    <div className={`mb-4 p-4 rounded-lg border ${validationResult.valid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
      <div className="flex items-start gap-3">
        {validationResult.valid ? (
          <svg className="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
        <div className="flex-1">
          <div className={`font-semibold ${validationResult.valid ? 'text-green-800' : 'text-yellow-800'}`}>
            {validationResult.valid ? m.config_editor_validation_valid() : m.config_editor_validation_issues()}
          </div>
          {!validationResult.valid && validationResult.output && (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white/50 p-2 rounded mt-2">
              {validationResult.output}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
