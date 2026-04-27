import { readFileSync } from 'node:fs'

const path = process.argv[2] ?? '.next/static/chunks/0.~2ky53fo~10.js'
const content = readFileSync(path, 'utf8')
console.log(`Size: ${content.length} bytes (${(content.length / 1024).toFixed(1)} KB)`)

const markers = [
  'Supabase',
  'createClient',
  'AuthProvider',
  'onAuthStateChange',
  'requestIdleCallback',
  'react-dom',
  'scheduler',
  'next/image',
  '@supabase/ssr',
  '@supabase/auth-js',
  '@supabase/postgrest',
  'getUser',
  'getSession',
  'use client',
  '"use strict"',
  'tanstack',
  'react-query',
  'sentry',
  'plausible',
  'IntersectionObserver',
  'BottomNav',
]

for (const m of markers) {
  const idx = content.indexOf(m)
  if (idx >= 0) {
    let count = 0
    let i = 0
    while ((i = content.indexOf(m, i)) !== -1) { count++; i += m.length }
    console.log(`  ${m}: ${count}`)
  }
}

// crude module-id sniff: look for things that look like webpack module names
const matches = [...content.matchAll(/"([a-zA-Z][\w/.@-]+)":(?:function|\(|\s*\(?function)/g)]
const modules = matches.map(m => m[1]).filter(s => s.length > 8 && s.length < 80)
const counts = new Map()
for (const m of modules) counts.set(m, (counts.get(m) ?? 0) + 1)
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
console.log('\nTop apparent module-id strings:')
for (const [k, v] of sorted) console.log(`  ${v}x  ${k.slice(0, 80)}`)
