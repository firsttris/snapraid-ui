import { CircleCheck, TriangleAlert } from 'lucide-react'
import * as m from '../paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'

interface ValidationResultAlertProps {
  validationResult: { valid: boolean; output: string }
}

export const ValidationResultAlert = ({
  validationResult,
}: ValidationResultAlertProps) => (
  <Alert variant={validationResult.valid ? 'success' : 'warning'}>
    {validationResult.valid ? <CircleCheck /> : <TriangleAlert />}
    <AlertTitle>
      {validationResult.valid
        ? m.config_editor_validation_valid()
        : m.config_editor_validation_issues()}
    </AlertTitle>
    {!validationResult.valid && validationResult.output && (
      <AlertDescription>
        <pre className="mt-1 w-full max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2 font-mono text-xs text-foreground">
          {validationResult.output}
        </pre>
      </AlertDescription>
    )}
  </Alert>
)
