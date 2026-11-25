'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// --- Reproduced from @supabase/ssr v0.12.3 (not publicly exported) ---

const BASE64_PREFIX = 'base64-'
const MAX_CHUNK_SIZE = 3180

const DEFAULT_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
}

// Base64URL encoding (from @supabase/ssr utils/base64url.js)
const TO_BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
const FROM_BASE64URL = (() => {
  const charMap: number[] = []
  for (let i = 0; i < 128; i += 1) charMap[i] = -1
  const ignore = ' \t\n\r='.split('')
  for (const c of ignore) charMap[c.charCodeAt(0)] = -2
  for (let i = 0; i < TO_BASE64URL.length; i += 1) {
    charMap[TO_BASE64URL[i].charCodeAt(0)] = i
  }
  return charMap
})()

function stringToUTF8(str: string, emitter: (byte: number) => void): void {
  for (let i = 0; i < str.length; i += 1) {
    let codepoint = str.charCodeAt(i)
    if (codepoint > 0xd7ff && codepoint <= 0xdbff) {
      const highSurrogate = ((codepoint - 0xd800) * 0x400) & 0xffff
      const lowSurrogate = (str.charCodeAt(i + 1) - 0xdc00) & 0xffff
      codepoint = (lowSurrogate | highSurrogate) + 0x10000
      i += 1
    }
    if (codepoint <= 0x7f) {
      emitter(codepoint)
    } else if (codepoint <= 0x7ff) {
      emitter(0xc0 | (codepoint >> 6))
      emitter(0x80 | (codepoint & 0x3f))
    } else if (codepoint <= 0xffff) {
      emitter(0xe0 | (codepoint >> 12))
      emitter(0x80 | ((codepoint >> 6) & 0x3f))
      emitter(0x80 | ((codepoint >> 6) & 0x3f))
    } else if (codepoint <= 0x10ffff) {
      emitter(0xf0 | (codepoint >> 18))
      emitter(0x80 | ((codepoint >> 12) & 0x3f))
      emitter(0x80 | ((codepoint >> 6) & 0x3f))
      emitter(0x80 | (codepoint & 0x3f))
    }
  }
}

function stringToBase64URL(str: string): string {
  const base64: string[] = []
  let queue = 0
  let queuedBits = 0
  const emitter = (byte: number) => {
    queue = (queue << 8) | byte
    queuedBits += 8
    while (queuedBits >= 6) {
      const pos = (queue >> (queuedBits - 6)) & 63
      base64.push(TO_BASE64URL[pos])
      queuedBits -= 6
    }
  }
  stringToUTF8(str, emitter)
  if (queuedBits > 0) {
    queue = queue << (6 - queuedBits)
    queuedBits = 6
    while (queuedBits >= 6) {
      const pos = (queue >> (queuedBits - 6)) & 63
      base64.push(TO_BASE64URL[pos])
      queuedBits -= 6
    }
  }
  return base64.join('')
}

function stringFromUTF8(byte: number, state: { utf8seq: number; codepoint: number }, emit: (codepoint: number) => void): void {
  if (state.utf8seq === 0) {
    if (byte <= 0x7f) {
      emit(byte)
      return
    }
    for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
      if (((byte >> (7 - leadingBit)) & 1) === 0) {
        state.utf8seq = leadingBit
        break
      }
    }
    if (state.utf8seq === 2) {
      state.codepoint = byte & 31
    } else if (state.utf8seq === 3) {
      state.codepoint = byte & 15
    } else if (state.utf8seq === 4) {
      state.codepoint = byte & 7
    } else {
      throw new Error('Invalid UTF-8 sequence')
    }
    state.utf8seq -= 1
  } else if (state.utf8seq > 0) {
    if (byte <= 0x7f) {
      throw new Error('Invalid UTF-8 sequence')
    }
    state.codepoint = (state.codepoint << 6) | (byte & 63)
    state.utf8seq -= 1
    if (state.utf8seq === 0) {
      emit(state.codepoint)
    }
  }
}

function stringFromBase64URL(str: string): string {
  const conv: string[] = []
  const emit = (codepoint: number) => { conv.push(String.fromCodePoint(codepoint)) }
  const state = { utf8seq: 0, codepoint: 0 }
  let queue = 0
  let queuedBits = 0
  for (let i = 0; i < str.length; i += 1) {
    const codepoint = str.charCodeAt(i)
    const bits = FROM_BASE64URL[codepoint]
    if (bits > -1) {
      queue = (queue << 6) | bits
      queuedBits += 6
      while (queuedBits >= 8) {
        stringFromUTF8((queue >> (queuedBits - 8)) & 0xff, state, emit)
        queuedBits -= 8
      }
    } else if (bits === -2) {
      continue
    } else {
      throw new Error(`Invalid Base64-URL character "${str.at(i)}" at position ${i}`)
    }
  }
  return conv.join('')
}

// Chunking (from @supabase/ssr utils/chunker.js)
const CHUNK_LIKE_REGEX = /^(.*)[.](0|[1-9][0-9]*)$/

function isChunkLike(cookieName: string, key: string): boolean {
  if (cookieName === key) return true
  const chunkLike = cookieName.match(CHUNK_LIKE_REGEX)
  if (chunkLike && chunkLike[1] === key) return true
  return false
}

function createChunks(
  key: string,
  value: string,
  chunkSize = MAX_CHUNK_SIZE,
): { name: string; value: string }[] {
  const encodedValue = encodeURIComponent(value)
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }]
  }
  const chunks: string[] = []
  let remaining = encodedValue
  while (remaining.length > 0) {
    let encodedChunkHead = remaining.slice(0, chunkSize)
    const lastEscapePos = encodedChunkHead.lastIndexOf('%')
    if (lastEscapePos > chunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos)
    }
    let valueHead = ''
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead)
        break
      } catch {
        if (encodedChunkHead.at(-3) === '%' && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3)
        } else {
          throw encodedChunkHead
        }
      }
    }
    chunks.push(valueHead)
    remaining = remaining.slice(valueHead.length)
  }
  return chunks.map((chunkValue, i) => ({ name: `${key}.${i}`, value: chunkValue }))
}

async function combineChunks(
  key: string,
  retrieveChunk: (name: string) => Promise<string | null>,
): Promise<string | null> {
  const value = await retrieveChunk(key)
  if (value) return value
  const values: string[] = []
  for (let i = 0; ; i += 1) {
    const chunk = await retrieveChunk(`${key}.${i}`)
    if (!chunk) break
    values.push(chunk)
  }
  if (values.length > 0) return values.join('')
  return null
}

function decodeChunkedCookieValue(value: string): string | null {
  if (!value.startsWith(BASE64_PREFIX)) {
    return value
  }
  let decoded: string
  try {
    decoded = stringFromBase64URL(value.substring(BASE64_PREFIX.length))
  } catch {
    return null
  }
  try {
    JSON.parse(decoded)
  } catch {
    return null
  }
  return decoded
}

// --- Login action with redirect for reliable cookie persistence ---

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const remember = formData.get('remember') === 'on'

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  console.info('[loginAction] login attempt started')

  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[loginAction] Supabase URL or API key not configured')
    return { error: 'Authentication service is not configured.' }
  }

  // Use the official @supabase/ssr server client
  const supabase = await createServerClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    console.error('[loginAction] signInWithPassword failed:', error?.message ?? 'no user returned')
    return { error: 'Invalid email or password.' }
  }

  console.info('[loginAction] signInWithPassword succeeded for user:', data.user.id)

  const session = data.session
  if (!session) {
    console.error('[loginAction] signInWithPassword returned no session')
    return { error: 'Authentication failed. Please try again.' }
  }
console.info('[loginAction] server-side session confirmed for user:', data.user.id)

  // Explicitly persist the session cookie using @supabase/ssr's encoding.
  // The official SSR client writes cookies asynchronously via onAuthStateChange -> applyServerStorage,
  // which may not complete before the Server Action response is sent. We explicitly
  // write the cookie here to guarantee it reaches the browser.

  // The session cookie key follows @supabase/ssr convention: sb-{projectRef}-auth-token
  // We use the Supabase URL to derive the project ref.
  const projectRef = supabaseUrl
    .replace(/^https:\/\//, '')
    .replace(/\.supabase\.co$/, '')
  const cookieName = `sb-${projectRef}-auth-token`

  // Encode: base64- prefix + base64url-encoded JSON
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(session))

  // Create chunks (handles chunking at 3180 bytes)
  const setCookies = createChunks(cookieName, encoded)

  // Cookie options matching @supabase/ssr DEFAULT_COOKIE_OPTIONS with domain stripped
  const setCookieOptions = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false,
    maxAge: 400 * 24 * 60 * 60,
  }

  // Remove stale chunks first
  const all = cookieStore.getAll()
  const cookieNames = all.map((c) => c.name)
  const removeCookies = cookieNames.filter((name) => isChunkLike(name, cookieName))

  for (const name of removeCookies) {
    cookieStore.set(name, '', { path: '/', maxAge: 0 })
  }

  // Write new chunks
  for (const { name, value: chunkValue } of setCookies) {
    cookieStore.set(name, chunkValue, { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60 })
    console.info('[loginAction] session cookie chunk written:', name)
  }

  console.info('[loginAction] server-side session confirmed for user:', data.user.id)

  if (remember) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    cookieStore.set('remember_device', 'true', {
      path: '/',
      expires: expiresAt,
      sameSite: 'lax',
      httpOnly: false,
    })
    console.info('[loginAction] remember_device cookie written')
  }

  // Role lookup
  let role: string | null = null
  let missingRole = false

  if (supabaseAdmin) {
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle()

    role = userRole?.role ?? null
    missingRole = !userRole
  }

  // Use redirect() instead of returning a value - this forces Next.js to send a proper
  // HTTP redirect response with all Set-Cookie headers properly included.
  if (data.user.user_metadata?.must_change_password) {
    redirect('/change-password')
  }

  if (missingRole) {
    return { error: 'Your account does not have an assigned role.' }
  }

  if (role === 'PA_TO_CI') {
    redirect('/pa-ci')
  } else if (role === 'PA_TO_DIRECTOR') {
    redirect('/pa-director')
  } else if (role === 'Security') {
    redirect('/security')
  } else if (role === 'Host Employee') {
    redirect('/host')
  } else {
    redirect('/dashboard')
  }
}