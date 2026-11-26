import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getClientInfo, logAuthEvent, getUserDisplayName } from '@/lib/server/auth-audit'

// --- Reproduced from @supabase/ssr v0.12.3 (cookie encoding) ---

const BASE64_PREFIX = 'base64-'
const MAX_CHUNK_SIZE = 3180

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
  chunkSize = 3180,
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

function decodeChunkedCookieValue(value: string): string | null {
  if (!value.startsWith('base64-')) {
    return value
  }
  let decoded: string
  try {
    decoded = stringFromBase64URL(value.substring(8))
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

// --- Login API Route ---

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    const remember = formData.get('remember') === 'on'

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    console.info('[api/auth/login] login attempt started')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[api/auth/login] Supabase URL or API key not configured')
      return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 500 })
    }

    // Use @supabase/supabase-js directly
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: true,
        },
      })

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      // Log failed login attempt
      const clientInfo = getClientInfo(request)
      await logAuthEvent({
        action: 'login_failed_invalid_credentials',
        entity_type: 'auth',
        entity_id: null,
        performed_by: email,
        details: `Failed login attempt for email: ${email}`,
        ip_address: clientInfo.ip_address,
        user_agent: clientInfo.user_agent,
      })

      console.error('[api/auth/login] signInWithPassword failed:', error?.message ?? 'no user returned')
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    console.info('[api/auth/login] signInWithPassword succeeded for user:', data.user.id)

    const session = data.session
    if (!session) {
      console.error('[api/auth/login] signInWithPassword returned no session')
      return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 401 })
    }

    console.info('[api/auth/login] server-side session confirmed for user:', data.user.id)

    // Create JSON response with redirect URL - THIS IS THE RESPONSE WE WILL RETURN
    const response = NextResponse.json({ redirectUrl: '/dashboard' })

    // Explicitly persist the session cookie using @supabase/ssr's encoding.
    const projectRef = supabaseUrl
      .replace(/^https:\/\//, '')
      .replace(/\.supabase\.co$/, '')
    const cookieName = `sb-${projectRef}-auth-token`

    // Encode: base64- prefix + base64url-encoded JSON
    const encoded = 'base64-' + stringToBase64URL(JSON.stringify(session))

    // Create chunks (handles chunking at 3180 bytes)
    const setCookies = createChunks(cookieName, encoded)

    // Cookie options matching @supabase/ssr defaults
    const setCookieOptions = {
      path: '/',
      sameSite: 'lax' as const,
      httpOnly: false,
      maxAge: 400 * 24 * 60 * 60,
    }

    // Remove stale chunks first
    const all = request.cookies.getAll()
    const cookieNames = all.map((c) => c.name)
    const removeCookies = cookieNames.filter((name) => isChunkLike(name, cookieName))

    for (const name of removeCookies) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }

    // Write new chunks
    for (const { name, value: chunkValue } of setCookies) {
      response.cookies.set(name, chunkValue, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        maxAge: 400 * 24 * 60 * 60,
      })
      console.info('[api/auth/login] session cookie chunk written:', name)
    }

    console.info('[api/auth/login] server-side session confirmed for user:', data.user.id)

    // Resolve the authoritative application role from the user_roles table
    // (the same source used by /api/auth/me and getCurrentUser). Do NOT rely on
    // auth metadata or the email address, and do not assume a fallback role.
    let appRole: string | null = null
    let missingRole = false

    if (supabaseAdmin) {
      const { data: userRole, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (roleError) {
        console.error('[api/auth/login] user_roles lookup failed:', {
          userId: data.user.id,
          message: roleError.message,
        })
      } else if (userRole?.role) {
        appRole = userRole.role
      } else {
        missingRole = true
        console.warn('[api/auth/login] no application role found for authenticated user:', data.user.id)
      }
    } else {
      missingRole = true
      console.error('[api/auth/login] service role not configured; cannot resolve application role')
    }

    // Log successful login with the actual application role.
    const clientInfo = getClientInfo(request)
    const userDisplayName = getUserDisplayName({
      email: data.user.email,
      full_name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
    })

    await logAuthEvent({
      action: 'login_success',
      entity_type: 'auth',
      entity_id: data.user.id,
      performed_by: userDisplayName,
      details: `Successful login for ${userDisplayName} (${data.user.email}) with role ${appRole ?? 'Unknown'}`,
      role: appRole,
      metadata: missingRole ? { missingRole: true } : undefined,
      ip_address: clientInfo.ip_address,
      user_agent: clientInfo.user_agent,
    })

    // Return the response with cookies attached
    return response

  } catch (err) {
    console.error('[api/auth/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}