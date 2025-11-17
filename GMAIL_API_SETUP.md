# Gmail API Setup Guide

This guide will help you set up Gmail API for sending emails instead of SMTP, which resolves Render.com connectivity issues.

## Prerequisites

1. Google Cloud Console account
2. Gmail account for sending emails

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

## Step 2: Enable Gmail API

1. In Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click on it and press "Enable"

## Step 3: Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - Name: `gmail-sender`
   - Description: `Service account for sending emails via Gmail API`
4. Click "Create and Continue"
5. Skip role assignment (click "Continue")
6. Click "Done"

## Step 4: Generate Service Account Key

1. In the "Credentials" page, find your service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" format
6. Click "Create" - this will download the JSON file

## Step 5: Configure Domain-wide Delegation (Important!)

1. In the service account details, check "Enable Google Workspace Domain-wide Delegation"
2. Note the "Client ID" (numeric value)
3. Go to your Google Workspace Admin Console (admin.google.com)
4. Navigate to Security > API Controls > Domain-wide Delegation
5. Click "Add new" and enter:
   - Client ID: (the numeric client ID from step 2)
   - OAuth Scopes: `https://www.googleapis.com/auth/gmail.send`
6. Click "Authorize"

## Step 6: Setup Application

1. Copy the downloaded JSON file to `config/gmail-credentials.json`
2. Update your `.env.local` file:
   ```
   GMAIL_CREDENTIALS_PATH=config/gmail-credentials.json
   GMAIL_FROM_EMAIL=your-email@yourdomain.com
   GMAIL_FROM_NAME=Workstream Automations
   GMAIL_IMPERSONATE_EMAIL=your-email@yourdomain.com
   ```

## Step 7: Add credentials.json to .gitignore

Make sure to add the credentials file to `.gitignore`:
```
config/gmail-credentials.json
```

## Important Notes

- **Security**: Never commit the `gmail-credentials.json` file to version control
- **Domain**: The `GMAIL_IMPERSONATE_EMAIL` must be from your Google Workspace domain
- **Permissions**: The service account needs domain-wide delegation to send emails on behalf of users
- **Quotas**: Gmail API has daily quotas (1 billion quota units per day for most projects)

## Testing

After setup, the application will automatically use Gmail API instead of SMTP. Check the logs for successful authentication and email sending.

## Troubleshooting

### Common Issues:

1. **Authentication Error (401)**: 
   - Check if domain-wide delegation is properly configured
   - Verify the service account has the correct scopes

2. **Access Denied (403)**:
   - Ensure the Gmail API is enabled in Google Cloud Console
   - Check if you've exceeded API quotas

3. **File Not Found**:
   - Verify the `GMAIL_CREDENTIALS_PATH` points to the correct file
   - Ensure the JSON file is properly formatted

### Benefits over SMTP:

- ✅ Works on Render.com (uses HTTPS instead of SMTP ports)
- ✅ Better reliability and deliverability
- ✅ Higher rate limits
- ✅ Better error handling and monitoring
- ✅ No need to manage app passwords
