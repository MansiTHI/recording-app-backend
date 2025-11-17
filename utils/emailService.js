import nodemailer from "nodemailer";
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// ORIGINAL SMTP CONFIGURATION (Your existing code)
const createTransporter = () => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: "usert6487@gmail.com",
        pass: "xgniasrsruozhzpb", // Use App Password here
      },
      tls: {
        rejectUnauthorized: false // Only for development/testing
      }
    });
    
    // Verify connection configuration
    transporter.verify(function(error, success) {
      if (error) {
        console.error('SMTP Connection Error:', error);
      } else {
        console.log('SMTP Server is ready to take our messages');
      }
    });
    
    return transporter;
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
};

// NEW GMAIL API CONFIGURATION (Alternative method)
const createGmailService = async () => {
  try {
    // Load service account credentials
    const credentialsPath = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.cwd(), 'config', 'gmail-credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      console.log('Gmail credentials not found, falling back to SMTP');
      return null;
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    // Create JWT client
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/gmail.send'],
      process.env.GMAIL_IMPERSONATE_EMAIL || credentials.client_email
    );

    // Authorize the client
    await jwtClient.authorize();
    
    // Create Gmail API service
    const gmail = google.gmail({ version: 'v1', auth: jwtClient });
    
    console.log('Gmail API service initialized successfully');
    return gmail;
  } catch (error) {
    console.error('Error creating Gmail service, falling back to SMTP:', error);
    return null;
  }
};

// Helper function to create email message for Gmail API
const createEmailMessage = (to, subject, htmlContent, from = null) => {
  const fromAddress = from || process.env.GMAIL_FROM_EMAIL || process.env.EMAIL_USER || 'noreply@workstreamautomations.com';
  const fromName = process.env.GMAIL_FROM_NAME || 'Workstream Automations';
  
  const message = [
    `From: "${fromName}" <${fromAddress}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    htmlContent
  ].join('\n');

  // Encode message in base64url format
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { raw: encodedMessage };
};

// Send email using Gmail API (with fallback to SMTP)
const sendEmailWithFallback = async (to, subject, htmlContent, mailOptions = {}) => {
  // Try Gmail API first if configured
  if (process.env.GMAIL_CREDENTIALS_PATH || fs.existsSync(path.join(process.cwd(), 'config', 'gmail-credentials.json'))) {
    try {
      console.log('Attempting to send via Gmail API...');
      const gmail = await createGmailService();
      
      if (gmail) {
        const emailMessage = createEmailMessage(to, subject, htmlContent);
        const result = await gmail.users.messages.send({
          userId: 'me',
          requestBody: emailMessage,
        });

        console.log('Email sent successfully via Gmail API:', result.data.id);
        return {
          success: true,
          messageId: result.data.id,
          method: 'Gmail API'
        };
      }
    } catch (error) {
      console.error('Gmail API failed, falling back to SMTP:', error.message);
    }
  }

  // Fallback to SMTP (your original method)
  console.log('Using SMTP fallback...');
  let transporter;
  try {
    transporter = createTransporter();
    await transporter.verify();
    
    const smtpMailOptions = {
      from: `"Workstream Automations" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      ...mailOptions
    };

    const info = await transporter.sendMail(smtpMailOptions);
    console.log('Email sent successfully via SMTP:', info.messageId);
    
    return { 
      success: true,
      messageId: info.messageId,
      response: info.response,
      method: 'SMTP'
    };
  } catch (error) {
    console.error('SMTP also failed:', error);
    return { 
      success: false, 
      error: 'Failed to send email via both Gmail API and SMTP',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
};

// Generate a 6-character alphanumeric verification code (mix of numbers and letters)
export const generateVerificationCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

// Send verification email (RESTORED YOUR ORIGINAL FUNCTION WITH FALLBACK)
export const sendVerificationEmail = async (email, code, name) => {
  try {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email address format');
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Workstream Automations, ${name}!</h2>
        <p style="color: #666; font-size: 16px;">Thank you for registering. Please verify your email address to complete your registration.</p>
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #333; font-size: 14px;">Your verification code is:</p>
          <h1 style="color: #4CAF50; font-size: 32px; margin: 10px 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this verification, please ignore this email.</p>
      </div>
    `;

    const mailOptions = {
      // Add headers to prevent email clients from marking as spam
      headers: {
        'X-LAZINESS': 'none',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
      // Add message configuration
      priority: 'high',
      dsn: {
        id: `${Date.now()}`,
        return: 'headers',
        notify: ['success', 'failure', 'delay'],
        recipient: process.env.EMAIL_USER
      }
    };

    console.log('Sending verification email to:', email);
    const result = await sendEmailWithFallback(email, "Email Verification - Workstream Automations", htmlContent, mailOptions);
    
    if (result.success) {
      console.log(`Verification email sent successfully via ${result.method}:`, result.messageId);
    }
    
    return result;
  } catch (error) {
    console.log('Error details:====== 100', error);
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    console.error('Email sending failed:', JSON.stringify(errorDetails, null, 2));
    
    // More specific error handling
    let userMessage = 'Failed to send verification email';
    
    if (error.code === 'EAUTH') {
      userMessage = 'Authentication failed. Please check your email credentials.';
    } else if (error.code === 'ECONNECTION') {
      userMessage = 'Could not connect to email server. Please check your internet connection.';
    } else if (error.code === 'EENVELOPE') {
      userMessage = 'Invalid email address or missing required fields.';
    } else if (error.code === 'EENVELOPE' && error.command === 'API') {
      userMessage = 'Email service rejected the request. Please check your email configuration.';
    }
    
    return { 
      success: false, 
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
    };
  }
};

// Send password reset email (RESTORED YOUR ORIGINAL FUNCTION WITH FALLBACK)
export const sendPasswordResetEmail = async (email, code, name) => {
  try {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email address format');
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p style="color: #666; font-size: 16px;">Hello ${name},</p>
        <p style="color: #666; font-size: 16px;">We received a request to reset your password. Use the code below to reset your password:</p>
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #333; font-size: 14px;">Your reset code is:</p>
          <h1 style="color: #4CAF50; font-size: 32px; margin: 10px 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request a password reset, please ignore this email or contact support.</p>
      </div>
    `;

    const mailOptions = {
      headers: {
        'X-LAZINESS': 'none',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
      priority: 'high',
      dsn: {
        id: `${Date.now()}`,
        return: 'headers',
        notify: ['success', 'failure', 'delay'],
        recipient: process.env.EMAIL_USER
      }
    };

    console.log('Sending password reset email to:', email);
    const result = await sendEmailWithFallback(email, "Password Reset Request - Workstream Automations", htmlContent, mailOptions);
    
    if (result.success) {
      console.log(`Password reset email sent successfully via ${result.method}:`, result.messageId);
    }
    
    return result;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    console.error('Password reset email failed:', JSON.stringify(errorDetails, null, 2));
    
    // More specific error handling
    let userMessage = 'Failed to send password reset email';
    
    if (error.code === 'EAUTH') {
      userMessage = 'Authentication failed. Please check your email credentials.';
    } else if (error.code === 'ECONNECTION') {
      userMessage = 'Could not connect to email server. Please check your internet connection.';
    } else if (error.code === 'EENVELOPE') {
      userMessage = 'Invalid email address or missing required fields.';
    } else if (error.code === 'EENVELOPE' && error.command === 'API') {
      userMessage = 'Email service rejected the request. Please check your email configuration.';
    }
    
    return { 
      success: false, 
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
    };
  }
};

// Send appointment notification email (RESTORED YOUR ORIGINAL FUNCTION WITH FALLBACK)
export const sendAppointmentNotification = async (appointment, recipientEmail, recipientName) => {
  try {
    // Format date and time
    const formattedDate = new Date(appointment.scheduledDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const formattedTime = new Date(appointment.scheduledDate).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #3b3da0e3; padding: 15px; text-align: center; color: white;">
          <h2 style="margin: 0; color: #ffffff;">Workstream Automations</h2>
        </div>
        
        <div style="padding: 20px;">
          <p style="font-size: 16px; color: #333;">Hello ${recipientName},</p>
          <p style="color: #555;">A new <strong>${appointment.type}</strong> has been scheduled.</p>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Client:</strong> ${appointment.client.name}</p>
            <p><strong>Company:</strong> ${appointment.client.company || 'N/A'}</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
            ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
          </div>

          <p style="color: #666;">Best regards,<br>The Workstream Automations Team</p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">© ${new Date().getFullYear()} Workstream Automations. All rights reserved.</p>
        </div>
      </div>
    `;

    const result = await sendEmailWithFallback(
      recipientEmail, 
      `New ${appointment.type} Scheduled - ${appointment.client.name}`, 
      htmlContent
    );
    
    return result;
  } catch (error) {
    console.error("Error sending appointment notification:", error);
    return { success: false, error: error.message };
  }
};

// Send recording notification email (RESTORED YOUR ORIGINAL FUNCTION WITH FALLBACK)
export const sendRecordingNotification = async (recording, recipientEmail, recipientName) => {
  try {
    const formattedDate = new Date(recording.createdAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Format duration from seconds to MM:SS
    const formatDuration = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #3b3da0e3; padding: 15px; text-align: center; color: white;">
          <h2 style="margin: 0; color: #ffffff;">Workstream Automations</h2>
        </div>
        
        <div style="padding: 20px;">
          <p style="font-size: 16px; color: #333;">Hello ${recipientName},</p>
          <p style="color: #555;">A new recording has been uploaded.</p>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Title:</strong> ${recording.title}</p>
            ${recording.description ? `<p><strong>Description:</strong> ${recording.description}</p>` : ""}
            <p><strong>Duration:</strong> ${formatDuration(recording.audio.duration)}</p>
            <p><strong>File Size:</strong> ${(recording.audio.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
            <p><strong>Uploaded:</strong> ${formattedDate}</p>
            ${recording.clientName ? `<p><strong>Client:</strong> ${recording.clientName}</p>` : ""}
            ${recording.clientCompany ? `<p><strong>Company:</strong> ${recording.clientCompany}</p>` : ""}
          </div>

          <div style="margin: 25px 0; text-align: center;">
            <a href="${process.env.FRONTEND_URL || "https://your-app.com"}/recordings/${recording._id}" 
              style="background-color: #3b3da0ab; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Recording
            </a>
          </div>

          <p style="color: #666;">Best regards,<br>The Workstream Automations Team</p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">© ${new Date().getFullYear()} Workstream Automations. All rights reserved.</p>
        </div>
      </div>
    `;

    const result = await sendEmailWithFallback(
      recipientEmail, 
      `New Recording: ${recording.title}`, 
      htmlContent
    );
    
    return result;
  } catch (error) {
    console.error("Error sending recording notification:", error);
    return { success: false, error: error.message };
  }
};
