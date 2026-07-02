import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getPool } from '../db/pool.js'
import { withTransaction } from '../db/tx.js'
import { ApiError } from '../lib/http.js'
import { createFileRecord } from './fileService.js'
import { writeAuditLog } from './auditService.js'
import type { JwtUser } from '../auth/jwt.js'

type VisitActor = Pick<JwtUser, 'userId' | 'role'>

type VisitPhotoInput = {
  name: string
  previewUrl: string
  capturedAt: string
}

export type CreateVisitInput = {
  customerId: string
  visitStatus: 'OPEN' | 'CLOSED' | 'NOT_FOUND' | 'FOLLOW_UP'
  note?: string
  visitedAt: string
  location: {
    latitude: number
    longitude: number
    accuracy: number | null
    capturedAt: string
  }
  photos: VisitPhotoInput[]
}

type VisitReportQuery = {
  startDate?: string
  endDate?: string
  status?: 'OPEN' | 'CLOSED' | 'NOT_FOUND' | 'FOLLOW_UP'
  q?: string
}

type StoredPhoto = {
  fileId: string
  capturedAt: string
}

const uploadsDir = path.resolve(process.cwd(), 'uploads', 'visits')

function assertFiniteCoordinate(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: `${label} tidak valid`,
    })
  }
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl)
  if (!match) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Format foto kunjungan tidak valid',
    })
  }

  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  const extension =
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const buffer = Buffer.from(match[2], 'base64')

  if (!buffer.length) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Isi foto kunjungan kosong',
    })
  }

  return { buffer, mimeType, extension }
}

async function storeVisitPhoto(photo: VisitPhotoInput): Promise<StoredPhoto> {
  const { buffer, mimeType, extension } = parseDataUrl(photo.previewUrl)
  await fs.mkdir(uploadsDir, { recursive: true })

  const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `visit.${extension}`
  const filename = `${Date.now()}-${randomUUID()}-${safeName}.${extension}`.replace(/\.(jpg|jpeg|png|webp)\.(jpg|jpeg|png|webp)$/i, '.$1')
  const diskPath = path.join(uploadsDir, filename)
  await fs.writeFile(diskPath, buffer)

  const fileId = await createFileRecord({
    originalName: photo.name,
    mimeType,
    sizeBytes: buffer.byteLength,
    storagePath: `/uploads/visits/${filename}`,
  })

  return {
    fileId,
    capturedAt: photo.capturedAt,
  }
}

async function getCustomerForVisit(customerId: string) {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        c.id,
        c.code,
        c.name,
        c.sales_id as "salesId"
      from customers c
      where c.id = $1
        and c.is_active = true
      limit 1
    `,
    [customerId],
  )
  return (res.rows[0] as { id: string; code: string; name: string; salesId: string | null } | undefined) ?? null
}

async function getUserDisplayName(userId: string) {
  const pool = getPool()
  const res = await pool.query('select full_name as "fullName" from users where id = $1 limit 1', [userId])
  return String(res.rows[0]?.fullName ?? '')
}

function buildPublicFileUrl(storagePath: string, baseUrl: string) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath
  if (storagePath.startsWith('/')) return `${baseUrl}${storagePath}`
  return `${baseUrl}/uploads/${path.basename(storagePath)}`
}

export async function createVisit(input: CreateVisitInput, actor: VisitActor) {
  assertFiniteCoordinate(input.location.latitude, 'Latitude')
  assertFiniteCoordinate(input.location.longitude, 'Longitude')

  if (!input.photos.length) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Minimal satu foto kunjungan wajib diunggah',
    })
  }

  const customer = await getCustomerForVisit(input.customerId)
  if (!customer) {
    throw new ApiError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Pelanggan tidak ditemukan',
    })
  }

  if (actor.role === 'Sales' && customer.salesId && customer.salesId !== actor.userId) {
    throw new ApiError({
      code: 'FORBIDDEN',
      status: 403,
      message: 'Anda tidak berhak mencatat kunjungan untuk pelanggan milik sales lain',
    })
  }

  const salesName = await getUserDisplayName(actor.userId)
  const storedPhotos = await Promise.all(input.photos.map((photo) => storeVisitPhoto(photo)))

  const visitId = await withTransaction(async (client) => {
    const visitRes = await client.query(
      `
        insert into sales_visits(
          customer_id,
          visited_by,
          customer_code_snapshot,
          customer_name_snapshot,
          sales_name_snapshot,
          visit_status,
          note,
          visited_at,
          latitude,
          longitude,
          accuracy_meters,
          location_captured_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        returning id
      `,
      [
        customer.id,
        actor.userId,
        customer.code,
        customer.name,
        salesName || null,
        input.visitStatus,
        input.note?.trim() || null,
        input.visitedAt,
        input.location.latitude,
        input.location.longitude,
        input.location.accuracy,
        input.location.capturedAt,
      ],
    )

    const newVisitId = String(visitRes.rows[0].id)

    for (const photo of storedPhotos) {
      await client.query(
        `
          insert into sales_visit_photos(visit_id, file_id, captured_at)
          values ($1, $2, $3)
        `,
        [newVisitId, photo.fileId, photo.capturedAt],
      )
    }

    return newVisitId
  })

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'VISIT_CREATE',
    entity: 'sales_visits',
    entityId: visitId,
    payload: {
      customerId: customer.id,
      customerCode: customer.code,
      visitStatus: input.visitStatus,
      photoCount: storedPhotos.length,
      visitedAt: input.visitedAt,
    },
  })

  return { id: visitId }
}

export async function getSalesVisitReport(query: VisitReportQuery, actor: VisitActor, baseUrl: string) {
  const pool = getPool()
  const where: string[] = []
  const values: unknown[] = []

  if (query.startDate) {
    values.push(`${query.startDate} 00:00:00+00`)
    where.push(`sv.visited_at >= $${values.length}`)
  }

  if (query.endDate) {
    values.push(`${query.endDate} 23:59:59.999+00`)
    where.push(`sv.visited_at <= $${values.length}`)
  }

  if (query.status) {
    values.push(query.status)
    where.push(`sv.visit_status = $${values.length}`)
  }

  if (query.q?.trim()) {
    values.push(`%${query.q.trim()}%`)
    where.push(
      `(coalesce(sv.customer_name_snapshot, c.name) ilike $${values.length} or coalesce(sv.customer_code_snapshot, c.code) ilike $${values.length} or u.full_name ilike $${values.length})`,
    )
  }

  if (actor.role === 'Sales') {
    values.push(actor.userId)
    where.push(`sv.visited_by = $${values.length}`)
  }

  const result = await pool.query(
    `
      select
        sv.id,
        sv.visit_status as "visitStatus",
        sv.note,
        sv.visited_at as "visitedAt",
        sv.latitude::float8 as latitude,
        sv.longitude::float8 as longitude,
        sv.accuracy_meters::float8 as "accuracyMeters",
        sv.location_captured_at as "locationCapturedAt",
        coalesce(sv.customer_code_snapshot, c.code) as "customerCode",
        coalesce(sv.customer_name_snapshot, c.name) as "customerName",
        coalesce(sv.sales_name_snapshot, u.full_name) as "salesName",
        coalesce(
          json_agg(
            json_build_object(
              'id', svp.id,
              'url', f.storage_path,
              'capturedAt', svp.captured_at,
              'originalName', f.original_name
            )
            order by svp.created_at
          ) filter (where svp.id is not null),
          '[]'::json
        ) as photos
      from sales_visits sv
      join users u on u.id = sv.visited_by
      left join customers c on c.id = sv.customer_id
      left join sales_visit_photos svp on svp.visit_id = sv.id
      left join files f on f.id = svp.file_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      group by
        sv.id,
        sv.visit_status,
        sv.note,
        sv.visited_at,
        sv.latitude,
        sv.longitude,
        sv.accuracy_meters,
        sv.location_captured_at,
        sv.customer_code_snapshot,
        sv.customer_name_snapshot,
        sv.sales_name_snapshot,
        c.code,
        c.name,
        u.full_name
      order by sv.visited_at desc
      limit 200
    `,
    values,
  )

  const items = result.rows.map((row) => ({
    ...row,
    photos: Array.isArray(row.photos)
      ? row.photos.map((photo: { id: string; url: string; capturedAt: string; originalName: string }) => ({
          ...photo,
          url: buildPublicFileUrl(photo.url, baseUrl),
        }))
      : [],
  }))

  return items
}
