import { redirect } from 'next/navigation'

export default function OrganiserSignupRedirect() {
  redirect('/signup?role=organiser')
}
