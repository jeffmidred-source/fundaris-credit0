# FUNDARIS CREDIT

A finance landing page and business workflow prototype for FUNDARIS CREDIT.

## Features
- marketing landing page
- contact enquiry form
- loan application form
- admin dashboard
- persistent JSON database
- admin login

## Run locally

1. Install Node.js LTS from https://nodejs.org/
2. Open a terminal in this folder
3. Run:

```bash
npm install
npm start
```

4. Open:
- http://localhost:3000
- http://localhost:3000/admin/login

## Default admin login
- username: kumasi
- password: admin123

## Email / live chat setup
To connect live chat support and enquiry notifications to a real email provider, create a .env file using the values in .env.example and fill in your SMTP credentials.

Example SMTP configuration:
- Gmail / Google Workspace: host = smtp.gmail.com, port = 587, secure = false
- Use a Google App Password if 2FA is enabled

The app will automatically send enquiry and live chat notifications through SMTP when the env values are present. If SMTP is not configured, the messages are logged to the console instead of being sent.

## Notes
- This is a business workflow prototype.
- For production, add proper authentication, email delivery, and a real database.

