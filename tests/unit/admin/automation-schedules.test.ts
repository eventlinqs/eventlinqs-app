import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCHEDULES } from '@/lib/admin/automation-schedules'

/*
 * THE DASHBOARD'S SCHEDULES ARE THE PLATFORM'S OWN (the automation dashboard, 15 November 2026): every schedule the
 * dashboard shows is the one vercel.json or the workflow file runs, so a schedule changed in one place and not the other
 * fails the build rather than showing Lawal a next run that never comes.
 */
const root = process.cwd()
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { crons?: Array<{ path: string; schedule: string }> }

describe('the automation dashboard schedules', () => {
  for (const [key, s] of Object.entries(SCHEDULES)) {
    it(`${key}: ${s.path} runs at ${s.cron}`, () => {
      if (s.where === 'vercel') {
        const cron = (vercel.crons ?? []).find((c) => c.path === s.path)
        expect(cron, `${s.path} is not in vercel.json`).toBeDefined()
        expect(cron?.schedule).toBe(s.cron)
      } else {
        const text = readFileSync(join(root, s.path), 'utf8').replace(/\r\n/g, '\n')
        expect(text).toMatch(new RegExp(`cron:\\s*'${s.cron.replace(/[*]/g, '\\*')}'`))
      }
    })
  }
})
