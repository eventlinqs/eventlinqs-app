export type UserRole = 'attendee' | 'organiser' | 'admin' | 'super_admin'
export type OrgStatus = 'pending' | 'active' | 'suspended' | 'deactivated'
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  role: UserRole
  is_verified: boolean
  onboarding_completed: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Organisation {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  website: string | null
  email: string | null
  phone: string | null
  status: OrgStatus
  owner_id: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrganisationMember {
  id: string
  organisation_id: string
  user_id: string
  role: OrgMemberRole
  invited_by: string | null
  joined_at: string
  updated_at: string
}
