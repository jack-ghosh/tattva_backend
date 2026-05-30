import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { users } from './schema'

export async function requireAdmin(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId))
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { userId }
}