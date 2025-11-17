import nodemailer from "nodemailer";

// Create a transporter with production-ready configuration and fallback
const createTransporter = async (useFallback = false) => {
  try {
    // Primary configuration for production
    const primaryConfig = {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 30000, // Reduced timeout
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false, // More lenient for production issues
        minVersion: 'TLSv1.2'
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      rateLimit: 10
    };

    // Fallback configuration for restrictive environments
    const fallbackConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      },
      requireTLS: true
    };

    // Use fallback config if requested or in development
    const config = useFallback || process.env.NODE_ENV !== 'production' 
      ? fallbackConfig 
      : primaryConfig;

    console.log(`Creating transporter with ${useFallback ? 'fallback' : 'primary'} config (port ${config.port})`);
    
    const transporter = nodemailer.createTransport(config);
    return transporter;
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
};

// Enhanced email sending with automatic fallback
const sendEmailWithFallback = async (mailOptions, maxRetries = 2) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const useFallback = attempt > 0; // Use fallback on retry
    let transporter;
    
    try {
      transporter = await createTransporter(useFallback);
      
      // Try to send the email with timeout
      const info = await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email send timeout')), 45000)
        )
      ]);
      
      console.log(`Email sent successfully on attempt ${attempt + 1}:`, info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        attempt: attempt + 1
      };
      
    } catch (error) {
      lastError = error;
      console.error(`Email attempt ${attempt + 1} failed:`, error.message);
      
      // Close transporter if it exists
      if (transporter) {
        try {
          transporter.close();
        } catch (closeError) {
          console.warn('Error closing transporter:', closeError.message);
        }
      }
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries - 1) {
        console.log(`Retrying in 2 seconds... (attempt ${attempt + 2}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // All attempts failed
  throw lastError;
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

// Send verification email
export const sendVerificationEmail = async (email, code, name) => {
  let transporter;
  try {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email address format');
    }

    const mailOptions = {
      from: `"Workstream Automations" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Email Verification - Workstream Automations",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Workstream Automations, ${name}!</h2>
          <p style="color: #666; font-size: 16px;">Thank you for registering. Please verify your email address to complete your registration.</p>
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #333; font-size: 14px;">Your verification code is:</p>
            <h1 style="color: #4CAF50; font-size: 32px; margin: 10px 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
      // Add headers to prevent email clients from marking as spam
      headers: {
        'X-LAZINESS': 'none',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
      // Add message configuration
      priority: 'high'
    };

    console.log('Sending verification email to:', email);
    
    // Use the enhanced fallback mechanism
    const result = await sendEmailWithFallback(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    
    return result;
  } catch (error) {
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
  } finally {
    // Close the transporter connection if it was created
    if (transporter) {
      transporter.close();
    }
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (email, code, name) => {
  let transporter;
  try {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email address format');
    }

    // Create and verify transporter
    transporter = createTransporter();
    await transporter.verify();
    console.log('SMTP server connection verified for password reset');

    const mailOptions = {
      from: `"Workstream Automations" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request - Workstream Automations",
      html: `
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
      `,
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
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', info.messageId);
    
    return { 
      success: true,
      messageId: info.messageId,
      response: info.response
    };
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
  } finally {
    // Close the transporter connection if it was created
    if (transporter) {
      transporter.close();
    }
  }
};

// Send appointment notification email
export const sendAppointmentNotification = async (appointment, recipientEmail, recipientName) => {
  try {
    const transporter = createTransporter();
    
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

    const mailOptions = {
      from: `"Workstream Automations" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `New ${appointment.type} Scheduled - ${appointment.client.name}`,
      html: `
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
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending appointment notification:", error);
    return { success: false, error: error.message };
  }
};

// Send recording notification email
export const sendRecordingNotification = async (recording, recipientEmail, recipientName) => {
  try {
    const transporter = createTransporter();
    
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

    const mailOptions = {
      from: `"Workstream Automations" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `New Recording: ${recording.title}`,
      html: `
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
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending recording notification:", error);
    return { success: false, error: error.message };
  }
};