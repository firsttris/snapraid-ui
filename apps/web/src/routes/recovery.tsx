import { createFileRoute, redirect } from '@tanstack/react-router'

// Recover files became the deleted and changed tabs of the changes page
export const Route = createFileRoute('/recovery')({
  beforeLoad: () => {
    throw redirect({ to: '/changes', search: { tab: 'deleted' } })
  },
})
