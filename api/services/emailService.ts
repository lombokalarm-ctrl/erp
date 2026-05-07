import nodemailer from 'nodemailer'
import { getEnv } from '../lib/env.js'

function createTransporter() {
  const host = getEnv('SMTP_HOST', '')
  const portRaw = getEnv('SMTP_PORT', '587')
  const user = getEnv('SMTP_USER', '')
  const pass = getEnv('SMTP_PASS', '')
  const secureRaw = getEnv('SMTP_SECURE', 'false').toLowerCase()

  if (!host || !user || !pass) {
    throw new Error('SMTP belum dikonfigurasi')
  }

  const port = Number(portRaw)
  const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes'

  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: {
      user,
      pass,
    },
  })
}

export async function sendPasswordResetEmail(input: {
  to: string
  fullName: string
  resetLink: string
}) {
  const transporter = createTransporter()
  const from = getEnv('SMTP_FROM', getEnv('SMTP_USER', ''))
  const appName = getEnv('APP_NAME', 'ERP Distributor F&B')

  const subject = `[${appName}] Reset Password`
  const text = [
    `Halo ${input.fullName},`,
    '',
    'Kami menerima permintaan reset password untuk akun Anda.',
    'Klik link berikut untuk membuat password baru:',
    input.resetLink,
    '',
    'Link ini hanya berlaku sementara dan hanya bisa dipakai satu kali.',
    'Jika Anda tidak meminta reset password, abaikan email ini.',
  ].join('\n')

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5">
      <p>Halo <strong>${escapeHtml(input.fullName)}</strong>,</p>
      <p>Kami menerima permintaan reset password untuk akun Anda.</p>
      <p>
        Klik link berikut untuk membuat password baru:<br />
        <a href="${escapeHtml(input.resetLink)}">${escapeHtml(input.resetLink)}</a>
      </p>
      <p>Link ini hanya berlaku sementara dan hanya bisa dipakai satu kali.</p>
      <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
    </div>
  `

  await transporter.sendMail({
    from,
    to: input.to,
    subject,
    text,
    html,
  })
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
