import { CircleX } from 'lucide-react'
import { Alert, AlertDescription } from './ui/alert'

interface ErrorAlertProps {
  error: string
}

export const ErrorAlert = ({ error }: ErrorAlertProps) => (
  <Alert variant="destructive">
    <CircleX />
    <AlertDescription className="break-words">{error}</AlertDescription>
  </Alert>
)
