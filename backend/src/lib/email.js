import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

/**
 * Send an email using SMTP (preferred) or Resend fallback.
 * SMTP uses Nodemailer and works with Gmail app passwords.
 */
export async function sendEmail({ to, subject, html }) {
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpPort = Number(process.env.SMTP_PORT || 465)
  const smtpFrom = process.env.SMTP_FROM || smtpUser

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })

      const info = await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        html,
      })

      return { success: true, data: { messageId: info.messageId } }
    } catch (err) {
      console.error('[email] SMTP error:', err)
      return { success: false, error: err.message || String(err) }
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.log('--- EMAIL SIMULATION ---')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${html}`)
    console.log('------------------------')
    return { success: true, simulated: true }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: 'Attendance Portal <onboarding@resend.dev>',
      to,
      subject,
      html,
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (err) {
    console.error('[email] Unexpected error:', err)
    return { success: false, error: err.message }
  }
}
