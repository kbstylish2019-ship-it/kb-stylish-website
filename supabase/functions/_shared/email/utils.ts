// ============================================================================
// EMAIL UTILITIES
// Purpose: Helper functions for email system (sanitization, formatting)
// ============================================================================

/**
 * Sanitize email input to prevent header injection attacks
 * Removes newlines, control characters, and limits length
 */
export function sanitizeEmailInput(input: string | null | undefined): string {
  if (!input) return '';
  
  return String(input)
    .replace(/[\r\n]/g, '') // Remove newlines (prevents header injection)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .trim()
    .slice(0, 500); // Limit length
}

/**
 * Sanitize HTML content
 * Removes dangerous tags and attributes
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers (onclick, onload, etc.)
    .replace(/javascript:/gi, ''); // Remove javascript: protocol
}

/**
 * Format currency (NPR)
 */
export function formatCurrency(cents: number): string {
  const rupees = cents / 100;
  return `NPR ${rupees.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format date for Nepal timezone
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-NP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kathmandu'
  });
}

/**
 * Format time for Nepal timezone
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-NP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kathmandu'
  });
}

/**
 * Get email footer HTML
 */
export function getEmailFooter(recipientUserId?: string): string {
  const unsubscribeUrl = recipientUserId 
    ? `https://kbstylish.com.np/account/email-preferences?user_id=${recipientUserId}`
    : 'https://kbstylish.com.np/account/email-preferences';
    
  return `
    <div style="padding: 20px; text-align: center; color: #666; font-size: 12px; margin-top: 32px;">
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="margin: 8px 0;">© 2025 KB Stylish. All rights reserved.</p>
      <p style="margin: 8px 0;">Kathmandu, Nepal</p>
      <p style="margin-top: 16px; margin-bottom: 8px;">
        <a href="${unsubscribeUrl}" 
           style="color: #666; text-decoration: underline;">
          Manage email preferences
        </a>
      </p>
      <p style="margin: 8px 0; font-size: 11px; color: #999;">
        This is a transactional email. You are receiving this because you have an account with KB Stylish.
      </p>
    </div>
  `;
}

/**
 * Get base email styles
 */
export function getEmailStyles(): string {
  return `
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background-color: #f6f9fc;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 8px;
      }
      .header {
        padding: 32px;
        text-align: center;
        background: #000000;
        border-radius: 8px 8px 0 0;
      }
      .logo {
        color: #D4AF37;
        font-size: 32px;
        font-weight: bold;
        margin: 0;
      }
      .content {
        padding: 32px;
      }
      h1 {
        color: #111111;
        font-size: 24px;
        font-weight: bold;
        margin: 0 0 16px 0;
      }
      h2 {
        color: #111111;
        font-size: 18px;
        font-weight: bold;
        margin: 24px 0 12px 0;
      }
      p {
        color: #333333;
        font-size: 16px;
        line-height: 1.5;
        margin: 0 0 12px 0;
      }
      .button {
        display: inline-block;
        padding: 12px 32px;
        background: #D4AF37;
        color: #000000;
        text-decoration: none;
        border-radius: 6px;
        font-weight: bold;
        font-size: 16px;
        margin: 16px 0;
      }
      .details-box {
        background: #f9fafb;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      .label {
        font-size: 12px;
        color: #666666;
        text-transform: uppercase;
        font-weight: bold;
        margin: 0 0 4px 0;
      }
      .value {
        font-size: 16px;
        color: #111111;
        margin: 0 0 12px 0;
      }
      .item {
        border-bottom: 1px solid #e5e7eb;
        padding: 12px 0;
      }
      .item:last-child {
        border-bottom: none;
      }
      .total {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 2px solid #111111;
      }
      
      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        .container {
          background: #1a1a1a !important;
        }
        h1, h2, p, .value {
          color: #ffffff !important;
        }
        .details-box {
          background: #2a2a2a !important;
        }
      }
      
      /* Mobile responsive */
      @media only screen and (max-width: 600px) {
        .content {
          padding: 20px !important;
        }
        h1 {
          font-size: 20px !important;
        }
        .button {
          display: block !important;
          text-align: center !important;
        }
      }
    </style>
  `;
}

/**
 * Get email header HTML
 */
export function getEmailHeader(): string {
  return `
    <div class="header">
      <h1 class="logo">KB Stylish</h1>
    </div>
  `;
}

/**
 * Wrap content in base email template
 */
export function wrapEmailTemplate(content: string, recipientUserId?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <title>KB Stylish</title>
      ${getEmailStyles()}
    </head>
    <body>
      <div class="container">
        ${getEmailHeader()}
        <div class="content">
          ${content}
        </div>
        ${getEmailFooter(recipientUserId)}
      </div>
    </body>
    </html>
  `;
}
