import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED = [
  'http://localhost:3001',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? ''
  const allowed = ALLOWED.includes(origin)

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,x-user-id',
      },
    })
  }

  const res = NextResponse.next()
  if (allowed) res.headers.set('Access-Control-Allow-Origin', origin)
  return res
}

export const config = { matcher: '/api/:path*' }